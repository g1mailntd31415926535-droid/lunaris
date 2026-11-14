#!/usr/bin/env python
"""LUNARIS Task 02 - validate the built terrain assets against the raw NASA rasters.

Independent of build_terrain.py's composite: every packed vertex is compared directly with the
Site01 / Site04 surf.tif sample at the same pixel. Writes reports/task02_validate_outputs.json.

Status: PASS (exit 0) · FAIL (exit 1) · BLOCKED (exit 2, inputs or outputs missing).
"""
from __future__ import annotations

import gzip
import json
import struct
import sys
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings('ignore')
import rasterio  # noqa: E402
from PIL import Image  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from inspect_inputs import ANCHORS, CIRCLE_CENTER, CIRCLE_RADIUS, FRAME  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
repo = Path(__file__).resolve().parents[2]
raw, pub, rep = repo.parent / 'raw_task02', repo / 'public' / 'lunar' / 'task02', repo / 'reports'
checks: list[dict] = []


def check(name: str, ok: bool, detail: str = '') -> None:
    checks.append({'check': name, 'pass': bool(ok), 'detail': detail})
    print('PASS' if ok else 'FAIL', name, detail)


def finish(status: str, code: int) -> int:
    (rep / 'task02_validate_outputs.json').write_text(json.dumps({'status': status, 'checks': checks}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'STATUS: {status}')
    return code


def main() -> int:
    needed = [raw / f'{s}_final_adj_5mpp_surf.tif' for s in ('Site01', 'Site04')] + [pub / 'metadata.json', pub / 'source_mask_5m.png', pub / 'science_zones.json']
    missing = [str(p) for p in needed if not p.exists()]
    if missing:
        check('inputs and outputs present', False, '; '.join(missing))
        return finish('BLOCKED', 2)
    meta = json.loads((pub / 'metadata.json').read_text(encoding='utf-8'))
    N, PX = meta['grid']['size_px'], meta['grid']['pixel_m']

    # ── locked geometry and honesty flags ───────────────────────────────────
    check('circle centre/radius unchanged', meta['circle']['center_xy_m'] == list(CIRCLE_CENTER) and meta['circle']['radius_m'] == CIRCLE_RADIUS)
    check('no vertical exaggeration', meta['height']['vertical_scale'] == 1.0 and meta['height']['smoothing'] == 'none')
    forbidden = [p.name for p in (repo / 'public').rglob('*') if p.suffix.lower() in ('.tif', '.tiff', '.shp', '.dbf', '.shx') or p.name.upper().startswith('LDEM')]
    check('no raw GeoTIFF / shapefile / LDEM in public/', not forbidden, ', '.join(forbidden))
    src_text = (repo / 'scripts' / 'terrain' / 'build_terrain.py').read_text(encoding='utf-8')
    check('build script never opens LDEM/87S', 'LDEM_80S' not in src_text.replace('LDEM/87S', '').replace('không LDEM', '') and '87S_' not in src_text)
    runtime = ''.join(p.read_text(encoding='utf-8') for p in (repo / 'src' / 'world').glob('*.ts*'))
    field = (repo / 'src' / 'world' / 'terrain-field.ts').read_text(encoding='utf-8')
    check('procedural craters/peaks removed from terrain-field.ts', all(word not in field for word in ('CRATERS', 'PEAKS', 'Math.sin', 'fbm3', 'colonyReliefAt')))
    check('procedural cap and regional relief removed', all(word not in runtime for word in ('buildSouthPoleCap', 'regionalHeightMeters', 'REGIONAL_CRATERS', 'surfacePointMeters')))
    rover = (repo / 'src' / 'world' / 'rover-plan.ts').read_text(encoding='utf-8')
    check('rover-plan.ts no longer pulls sites toward the base', 'localRadius' not in rover and 'SURVEY_SITES.forEach' not in rover and 'safeCorridor' not in rover)

    # ── raw sources on the world grid ───────────────────────────────────────
    def place(site):
        with rasterio.open(raw / f'{site}_final_adj_5mpp_surf.tif') as ds:
            arr, b = ds.read(1), ds.bounds
        out = np.full((N, N), np.nan, dtype=np.float32)
        c0, r0 = int(round((b.left - FRAME['x_min']) / PX)), int(round((FRAME['y_max'] - b.top) / PX))
        rs, cs, re, ce = max(0, r0), max(0, c0), min(N, r0 + arr.shape[0]), min(N, c0 + arr.shape[1])
        out[rs:re, cs:ce] = arr[rs - r0:re - r0, cs - c0:ce - c0]
        return out
    z1, z4 = place('Site01'), place('Site04')
    mask = np.asarray(Image.open(pub / 'source_mask_5m.png'))            # 0 outside, 1 NoData, 2 Site01, 3 Site04
    xs = FRAME['x_min'] + (np.arange(N) + 0.5) * PX
    ys = FRAME['y_max'] - (np.arange(N) + 0.5) * PX
    disk = ((xs[None, :] - CIRCLE_CENTER[0]) ** 2 + (ys[:, None] - CIRCLE_CENTER[1]) ** 2) <= CIRCLE_RADIUS ** 2
    check('source mask: Site01 pixels have Site01 data, Site04 pixels have Site04 data', bool(np.isfinite(z1[mask == 2]).all() and np.isfinite(z4[mask == 3]).all()))
    check('source mask: NoData pixels have no data in either tile', bool((~np.isfinite(z1[mask == 1]) & ~np.isfinite(z4[mask == 1])).all()))
    check('source mask: nothing marked valid outside the circle', bool((mask[~disk] == 0).all()))
    check('every in-circle pixel with data is used (no data dropped)', bool(((mask >= 2) == (disk & (np.isfinite(z1) | np.isfinite(z4)))).all()))
    nodata_pct = 100 * float((mask == 1).sum()) / float(disk.sum())
    check('reported NoData share matches the mask', abs(nodata_pct - meta['coverage_in_circle']['nodata_percent']) < 1e-3, f'{nodata_pct:.4f} %')

    # ── every chunk: files, sizes, vertex == raw sample, cells never bridge NoData ──
    stored_valid = np.isfinite(z1) | np.isfinite(z4)
    worst_err, n_vertices, n_cells, bad_files, bridge, not_raw = 0.0, 0, 0, [], 0, 0
    for level in meta['levels']:
        k, s, step = level['level'], level['stride_px'], level['quant_step_m']
        idx = np.arange(0, N, s)
        A1, A4, V = z1[::s, ::s], z4[::s, ::s], stored_valid[::s, ::s]
        # all-pixels-valid test for a coarse cell, via a summed-area table of the raw validity
        sat = np.zeros((N + 1, N + 1), dtype=np.int32)
        np.cumsum(np.cumsum(stored_valid, axis=0, dtype=np.int32), axis=1, out=sat[1:, 1:])
        a, b = idx[:-1], idx[:-1] + s + 1
        full = (sat[b[:, None], b[None, :]] - sat[a[:, None], b[None, :]] - sat[b[:, None], a[None, :]] + sat[a[:, None], a[None, :]]) == (s + 1) ** 2
        for name, info in level['chunks'].items():
            cx, cy = map(int, name.split('_'))
            f = pub / f'L{k}' / f'{name}.dem'
            if not f.exists() or f.stat().st_size != info['bytes']:
                bad_files.append(str(f)); continue
            buf = gzip.decompress(f.read_bytes())
            magic, _ver, lv, hx, hy, n1, hmin, hstep = struct.unpack_from('<4sHHHHHdd', buf, 0)
            if magic != b'LDEM' or lv != k or hx != cx or hy != cy or hstep != step:
                bad_files.append(str(f)); continue
            cnt = n1 * n1
            delta = np.frombuffer(buf, np.uint8, cnt, 30).astype(np.uint16) | (np.frombuffer(buf, np.uint8, cnt, 30 + cnt).astype(np.uint16) << 8)
            rel = np.cumsum(delta.reshape(n1, n1), axis=1, dtype=np.uint16)
            h = hmin + rel.astype(np.float64) * hstep
            vbits = np.unpackbits(np.frombuffer(buf, np.uint8, -(-cnt // 8), 30 + 2 * cnt), bitorder='little')[:cnt].reshape(n1, n1).astype(bool)
            cells = np.unpackbits(np.frombuffer(buf, np.uint8, -(-(n1 - 1) ** 2 // 8), 30 + 2 * cnt + -(-cnt // 8)), bitorder='little')[:(n1 - 1) ** 2].reshape(n1 - 1, n1 - 1).astype(bool)
            r0, c0 = cy * (n1 - 1), cx * (n1 - 1)
            rr, cc = min(n1, A1.shape[0] - r0), min(n1, A1.shape[1] - c0)
            hv, vm = h[:rr, :cc], vbits[:rr, :cc]
            e1, e4 = np.abs(hv - A1[r0:r0 + rr, c0:c0 + cc]), np.abs(hv - A4[r0:r0 + rr, c0:c0 + cc])
            err = np.fmin(e1, e4)                                         # distance to the nearer RAW sample
            used = vm & cells_vertices(cells, n1)[:rr, :cc]
            if used.any():
                worst_err = max(worst_err, float(np.nanmax(err[used])))
                not_raw += int((~(err[used] <= step / 2 + 1e-4)).sum())
            n_vertices += int(used.sum())
            fr, fc = min(n1 - 1, full.shape[0] - r0), min(n1 - 1, full.shape[1] - c0)
            bridge += int((cells[:fr, :fc] & ~full[r0:r0 + fr, c0:c0 + fc]).sum()) + int(cells[fr:, :].sum()) + int(cells[:, fc:].sum())
            n_cells += int(cells.sum())
    check('all chunk files present with manifest sizes and headers', not bad_files, f'{len(bad_files)} bad' if bad_files else f"{sum(len(l['chunks']) for l in meta['levels'])} files")
    check('every meshed vertex equals a RAW Site01/Site04 sample (≤ half a quantisation step)', not_raw == 0, f'{n_vertices:,} vertices, worst |Δ| {worst_err:.4f} m')
    check('no mesh cell bridges NoData at any LOD', bridge == 0, f'{n_cells:,} cells checked')

    # ── seam, LOD report, anchors ───────────────────────────────────────────
    d = np.abs(z4.astype(np.float64) - z1.astype(np.float64))
    hs = (mask[:, 1:] != mask[:, :-1]) & (mask[:, 1:] >= 2) & (mask[:, :-1] >= 2)
    vs = (mask[1:, :] != mask[:-1, :]) & (mask[1:, :] >= 2) & (mask[:-1, :] >= 2)
    steps = np.concatenate([np.fmax(d[:, 1:], d[:, :-1])[hs], np.fmax(d[1:, :], d[:-1, :])[vs]])
    check('seam max step recomputed from the mask matches the report', abs(float(steps.max()) - meta['seam']['max_step_m']) < 1e-6, f"{steps.max():.4f} m over {steps.size * PX / 1000:.2f} km")
    rows = meta['lod_error']
    check('LOD error reported for every level against 5 m pixels', len(rows) == meta['tiling']['levels'] and all(r['samples_5m_pixels'] > 1e7 for r in rows) and all(r['max_abs_error_m'] > 0 for r in rows[1:]),
          ' · '.join(f"L{r['level']} mean {r['mean_abs_error_m']:.3f} max {r['max_abs_error_m']:.2f}" for r in rows))
    zones = {z['id']: z for z in json.loads((pub / 'science_zones.json').read_text(encoding='utf-8'))['zones']}
    for a in ANCHORS:
        r, c = int((FRAME['y_max'] - a['xy'][1]) // PX), int((a['xy'][0] - FRAME['x_min']) // PX)
        on_data = mask[r, c] >= 2
        if a['id'] == 'BASE':
            check('BASE on valid DEM at its locked coordinates', bool(on_data) and meta['base']['xy_m'] == list(a['xy']))
            continue
        z = zones[a['id']]
        raw_h = float(z1[r, c] if mask[r, c] == 2 else z4[r, c])
        check(f"anchor {a['id']} unmoved, on valid DEM, height equals raw sample", bool(on_data) and z['anchor_xy_m'] == list(a['xy']) and abs(z['height_m'] - raw_h) < 0.006 and z['route_status'] != 'SAFE_ROUTE' and z['ice_status'] == 'CANDIDATE_UNVERIFIED',
              f"{z['source_tile']} h={z['height_m']} m route={z['route_status']}")
    failed = [c for c in checks if not c['pass']]
    return finish('FAIL' if failed else 'PASS', 1 if failed else 0)


def cells_vertices(cells: np.ndarray, n1: int) -> np.ndarray:
    """Vertices that belong to at least one valid cell (the only vertices the mesh uses)."""
    used = np.zeros((n1, n1), dtype=bool)
    used[:-1, :-1] |= cells; used[1:, :-1] |= cells; used[:-1, 1:] |= cells; used[1:, 1:] |= cells
    return used


if __name__ == '__main__':
    sys.exit(main())
