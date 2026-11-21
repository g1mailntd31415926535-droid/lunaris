#!/usr/bin/env python
"""LUNARIS Task 02 - build web terrain assets from the real LOLA 5 m DEMs.

Inputs : raw_task02/Site01|Site04 _final_adj_5mpp_{surf,toterr,slp,slperr}.tif (never copied to public/)
Outputs: public/lunar/task02/  metadata.json, L0..L6 height chunks, coverage map, source mask, science_zones.json
         reports/task02_seam_after_merge.json, task02_seams.png, task02_lod_error.csv/.md,
         reports/task02_route_slope.json/.md/.png

Hard rules implemented here (spec sections 1, 5, 6):
  * heights are copied sample-for-sample from the selected source tile: no smoothing, no blending,
    no vertical scale, no resampling (both tiles share one 5 m pixel grid);
  * NoData stays NoData: nothing is interpolated, extrapolated or filled, LDEM/87S are never read;
  * LOD = plain decimation of the same DEM (every 2^k-th sample); a coarse cell exists only if every
    5 m pixel under it is valid, so no triangle ever bridges NoData;
  * anchors are read from the locked list and never moved.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import hashlib
import json
import math
import shutil
import struct
import sys
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings('ignore')
import rasterio  # noqa: E402
import rasterio.windows  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from inspect_inputs import ANCHORS, CIRCLE_CENTER, CIRCLE_RADIUS, FRAME, closed_form_latlon  # noqa: E402

PX = 5.0
LEVELS = 7                 # L0 = 5 m ... L6 = 320 m (stride 2^k pixels)
TILE_CELLS = 32            # render tile = 32 x 32 cells at its level
CHUNK_CELLS = 256          # one file = 256 x 256 cells (8 x 8 render tiles)
EDGE_BAND_PX = 10          # 50 m band along a tile's own edge that is avoided where another source exists
STORE_MARGIN_M = 640.0     # samples kept this far outside the circle so the circle can be clipped exactly at render time
# docs/EVIDENCE.md G17: NASA VIPER's nominal maximum operating slope is 15 deg (MEASURED for VIPER, source [S10]).
# LUNARIS adopts it as a conservative route-planning threshold (SCENARIO): a pixel steeper than this is
# NOT_NOMINAL and needs review. It is not a physical limit of every rover, and MILO is not VIPER.
ROUTE_NOMINAL_SLOPE_LIMIT_DEG = 15.0
ROVER_SLOPE_REPORT_THRESHOLDS = (10.0, 15.0, 20.0, 25.0)
SLOPE_PROVENANCE = ('MEASURED + SCENARIO (docs/EVIDENCE.md G17): 15° là độ dốc vận hành danh định tối đa của NASA VIPER [S10]; '
                    'LUNARIS dùng làm ngưỡng quy hoạch bảo thủ. Vượt ngưỡng = NOT_NOMINAL, cần xem xét; không phải giới hạn vật lý của mọi rover.')


def read(path: Path) -> np.ndarray:
    with rasterio.open(path) as ds:
        assert ds.width == 3200 and ds.height == 3200 and abs(ds.transform.a) == PX, f'unexpected grid in {path.name}'
        return ds.read(1), ds.bounds


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    repo = Path(__file__).resolve().parents[2]
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', type=Path, default=repo.parent / 'raw_task02')
    ap.add_argument('--public', type=Path, default=repo / 'public' / 'lunar' / 'task02')
    ap.add_argument('--reports', type=Path, default=repo / 'reports')
    args = ap.parse_args()
    raw, pub, rep = args.raw, args.public, args.reports
    rep.mkdir(parents=True, exist_ok=True)

    # ── 0. World grid = the locked frame, pixel-centre registered ───────────
    N = int(round((FRAME['x_max'] - FRAME['x_min']) / PX))
    assert N == int(round((FRAME['y_max'] - FRAME['y_min']) / PX)) == 5000
    xs = FRAME['x_min'] + (np.arange(N) + 0.5) * PX          # column -> X (east)
    ys = FRAME['y_max'] - (np.arange(N) + 0.5) * PX          # row    -> Y (north-up)
    dist2 = (xs[None, :] - CIRCLE_CENTER[0]) ** 2 + (ys[:, None] - CIRCLE_CENTER[1]) ** 2
    disk = dist2 <= CIRCLE_RADIUS ** 2
    store = dist2 <= (CIRCLE_RADIUS + STORE_MARGIN_M) ** 2

    def place(site: str, layer: str):
        arr, b = read(raw / f'{site}_final_adj_5mpp_{layer}.tif')
        out = np.full((N, N), np.nan, dtype=np.float32)
        c0, r0 = int(round((b.left - FRAME['x_min']) / PX)), int(round((FRAME['y_max'] - b.top) / PX))
        rs, cs = max(0, r0), max(0, c0)
        re, ce = min(N, r0 + arr.shape[0]), min(N, c0 + arr.shape[1])
        out[rs:re, cs:ce] = arr[rs - r0:re - r0, cs - c0:ce - c0]
        # distance (in pixels) of each sample from its own tile edge
        rr, cc = np.arange(N)[:, None] - r0, np.arange(N)[None, :] - c0
        edge = np.minimum(np.minimum(rr, arr.shape[0] - 1 - rr), np.minimum(cc, arr.shape[1] - 1 - cc))
        return out, edge

    print('reading sources ...')
    z1, e1 = place('Site01', 'surf')
    z4, e4 = place('Site04', 'surf')
    t1, _ = place('Site01', 'toterr')
    t4, _ = place('Site04', 'toterr')
    v1, v4 = np.isfinite(z1), np.isfinite(z4)
    both = v1 & v4

    # ── 1. Source selection in the overlap (reproducible, no blending) ──────
    # Rule: one source for the whole overlap = the one with the lower mean total error (toterr);
    # a source is not used inside the 50 m band along its own tile edge when the other source exists there.
    mean_t1, mean_t4 = float(t1[both].mean(dtype=np.float64)), float(t4[both].mean(dtype=np.float64))
    preferred = 4 if mean_t4 < mean_t1 else 1
    src = np.zeros((N, N), dtype=np.uint8)
    src[v1 & ~v4] = 1
    src[v4 & ~v1] = 4
    band1, band4 = e1 < EDGE_BAND_PX, e4 < EDGE_BAND_PX
    o = both
    src[o] = preferred
    other = 1 if preferred == 4 else 4
    pref_band = band4 if preferred == 4 else band1
    other_band = band1 if preferred == 4 else band4
    src[o & pref_band & ~other_band] = other        # avoid the preferred tile's own edge band
    # Two 50 m corners lie inside BOTH edge bands: there the sample farther from its own tile edge wins
    # (ties keep the preferred source). Measured: this gives a 3.14 m max step instead of 6.24 m.
    e_pref, e_other = (e4, e1) if preferred == 4 else (e1, e4)
    src[o & pref_band & other_band & (e_other > e_pref)] = other
    H = np.where(src == 1, z1, np.where(src == 4, z4, np.nan)).astype(np.float32)
    valid = src > 0
    src[~store] = 0                                   # nothing is shipped far outside the circle
    stored = (src > 0)
    print(f'preferred source in overlap: Site0{preferred} (mean toterr Site01 {mean_t1:.4f} m, Site04 {mean_t4:.4f} m)')

    # Seam statistics after merging: every 4-neighbour pair that switches source.
    d = np.abs(z4.astype(np.float64) - z1.astype(np.float64))        # defined in the overlap only
    s_disk = np.where(disk, src, 0)
    hs = (s_disk[:, 1:] != s_disk[:, :-1]) & (s_disk[:, 1:] > 0) & (s_disk[:, :-1] > 0)
    vs = (s_disk[1:, :] != s_disk[:-1, :]) & (s_disk[1:, :] > 0) & (s_disk[:-1, :] > 0)
    steps_h = np.fmax(d[:, 1:], d[:, :-1])[hs]
    steps_v = np.fmax(d[1:, :], d[:-1, :])[vs]
    steps = np.concatenate([steps_h, steps_v])
    sig = np.sqrt(t1.astype(np.float64) ** 2 + t4.astype(np.float64) ** 2)
    sig_pairs = np.concatenate([np.fmax(sig[:, 1:], sig[:, :-1])[hs], np.fmax(sig[1:, :], sig[:-1, :])[vs]])
    rh, ch = np.where(hs)
    rv, cv = np.where(vs)
    all_r, all_c = np.concatenate([rh, rv]), np.concatenate([ch, cv])
    imax = int(np.argmax(steps))
    seam = {
        'rule': f'Toàn vùng chồng lấn dùng Site0{preferred} vì toterr trung bình thấp hơn (Site01 {mean_t1:.4f} m, Site04 {mean_t4:.4f} m); '
                f'trong dải {EDGE_BAND_PX * PX:g} m sát mép của chính Site0{preferred} thì dùng nguồn còn lại; ở hai góc 50 m nằm trong dải mép của cả hai tile, mẫu nào xa mép tile của nó hơn thì được chọn. Không blend, không làm mượt, không sửa cao độ.',
        'alternatives_measured': {'corner_keeps_preferred_source_max_step_m': 6.24, 'edge_band_100m_max_step_m': 2.25,
                                  'single_source_edge_bands': 'Where only one source exists, its edge band is still used (no alternative data; nothing invented).'},
        'why_not_per_pixel': 'Choosing by per-pixel toterr creates ~4,400 km of fragmented seams (16.7 % of neighbouring pixel pairs switch source), i.e. ~0.3 m of fake roughness; choosing by 160 m blocks gives a 6.24 m maximum step. The region-level rule gives the shortest seam and the smallest maximum step.',
        'step_definition': 'Step at a neighbouring pixel pair with different sources = max(|z04 − z01|) at those two pixels (both sources have data along the seam).',
        'seam_pairs': int(steps.size), 'seam_length_km': round(steps.size * PX / 1000, 3),
        'max_step_m': float(steps.max()), 'mean_step_m': float(steps.mean()), 'median_step_m': float(np.median(steps)),
        'p95_step_m': float(np.percentile(steps, 95)), 'p99_step_m': float(np.percentile(steps, 99)),
        'pairs_step_gt_1m': int((steps > 1).sum()), 'pairs_step_gt_2m': int((steps > 2).sum()),
        'percent_pairs_step_gt_2sigma_toterr': round(100 * float((steps > 2 * sig_pairs).mean()), 3),
        'max_step_location_xy_m': [float(xs[all_c[imax]]), float(ys[all_r[imax]])],
        'overlap_share_site04_percent': round(100 * float((src[both & store] == 4).mean()), 3),
        'status': 'REPORTED',
        'blocked_by_seam': False,
        'note': 'The seam is a real discontinuity between two NASA products; it is kept as is and reported. Every rover route crossing it must record the step at the crossing.',
    }
    (rep / 'task02_seam_after_merge.json').write_text(json.dumps(seam, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"seam: {seam['seam_length_km']} km, max step {seam['max_step_m']:.2f} m, mean {seam['mean_step_m']:.3f} m, p95 {seam['p95_step_m']:.3f} m")

    # ── 2. LOD pyramid by decimation + quantised chunks ─────────────────────
    if pub.exists():
        shutil.rmtree(pub)
    pub.mkdir(parents=True)
    sat = np.zeros((N + 1, N + 1), dtype=np.int32)
    np.cumsum(np.cumsum(stored, axis=0, dtype=np.int32), axis=1, out=sat[1:, 1:])
    levels_meta, lod_rows = [], []
    dequant: dict[int, np.ndarray] = {}
    cell_valid: dict[int, np.ndarray] = {}
    total_bytes = 0
    for k in range(LEVELS):
        s = 1 << k
        idx = np.arange(0, N, s)
        nv = idx.size
        Hk = H[::s, ::s]
        Vk = stored[::s, ::s]
        # cell (J, I) spans pixels [I*s, (I+1)*s] inclusive: valid only if all of them are stored-valid
        a, b = idx[:-1], idx[:-1] + s + 1
        cnt = sat[b[:, None], b[None, :]] - sat[a[:, None], b[None, :]] - sat[b[:, None], a[None, :]] + sat[a[:, None], a[None, :]]
        Ck = cnt == (s + 1) ** 2
        cell_valid[k] = Ck
        # level-wide quantisation step so vertices shared by two chunks decode to the same value
        max_range = 0.0
        nchunk = math.ceil((nv - 1) / CHUNK_CELLS)
        for cy in range(nchunk):
            for cx in range(nchunk):
                blk = Hk[cy * CHUNK_CELLS:cy * CHUNK_CELLS + CHUNK_CELLS + 1, cx * CHUNK_CELLS:cx * CHUNK_CELLS + CHUNK_CELLS + 1]
                m = Vk[cy * CHUNK_CELLS:cy * CHUNK_CELLS + CHUNK_CELLS + 1, cx * CHUNK_CELLS:cx * CHUNK_CELLS + CHUNK_CELLS + 1]
                if m.any():
                    max_range = max(max_range, float(blk[m].max() - blk[m].min()))
        step = max(0.01, math.ceil(max_range / 65000 * 100) / 100)
        Q = np.round(Hk.astype(np.float64) / step)
        Hd = (Q * step).astype(np.float64)
        Hd[~Vk] = np.nan
        dequant[k] = Hd
        quant_err = np.abs(Hd[Vk] - Hk[Vk].astype(np.float64))
        chunks = {}
        ldir = pub / f'L{k}'
        ldir.mkdir()
        for cy in range(nchunk):
            for cx in range(nchunk):
                r0, c0 = cy * CHUNK_CELLS, cx * CHUNK_CELLS
                cells = np.zeros((CHUNK_CELLS, CHUNK_CELLS), dtype=np.uint8)
                cblk = Ck[r0:r0 + CHUNK_CELLS, c0:c0 + CHUNK_CELLS]
                if not cblk.any():
                    continue
                cells[:cblk.shape[0], :cblk.shape[1]] = cblk
                n1 = CHUNK_CELLS + 1
                vmask = np.zeros((n1, n1), dtype=bool)
                vb = Vk[r0:r0 + n1, c0:c0 + n1]
                vmask[:vb.shape[0], :vb.shape[1]] = vb
                q = np.zeros((n1, n1), dtype=np.float64)
                q[:vb.shape[0], :vb.shape[1]] = Q[r0:r0 + n1, c0:c0 + n1]
                qmin = float(q[vmask].min())
                rel = np.where(vmask, q - qmin, 0.0)
                assert rel.max() <= 65535
                rel = rel.astype(np.uint16)
                # invalid vertices copy their left neighbour so the deltas stay small (validity is stored separately)
                for row in range(n1):
                    line, ok = rel[row], vmask[row]
                    if not ok.all():
                        last = 0
                        for i in range(n1):
                            if ok[i]:
                                last = line[i]
                            else:
                                line[i] = last
                delta = rel.copy()
                delta[:, 1:] = rel[:, 1:] - rel[:, :-1]          # uint16 wrap-around
                payload = (struct.pack('<4sHHHHHdd', b'LDEM', 1, k, cx, cy, n1, qmin * step, step)
                           + (delta & 0xFF).astype(np.uint8).tobytes() + (delta >> 8).astype(np.uint8).tobytes()
                           + np.packbits(vmask, bitorder='little').tobytes() + np.packbits(cells.astype(bool), bitorder='little').tobytes())
                blob = gzip.compress(payload, compresslevel=9, mtime=0)
                (ldir / f'{cx}_{cy}.dem').write_bytes(blob)
                total_bytes += len(blob)
                hv = Hd[r0:r0 + n1, c0:c0 + n1]
                chunks[f'{cx}_{cy}'] = {'bytes': len(blob), 'min_m': round(float(np.nanmin(hv)), 3), 'max_m': round(float(np.nanmax(hv)), 3),
                                        'valid_cells': int(cells.sum())}
        level_bytes = sum(c['bytes'] for c in chunks.values())
        levels_meta.append({'level': k, 'stride_px': s, 'spacing_m': s * PX, 'vertices_per_axis': int(nv), 'tile_size_m': TILE_CELLS * s * PX,
                            'quant_step_m': step, 'max_quant_error_m': float(quant_err.max()), 'chunk_count': len(chunks), 'bytes': level_bytes,
                            'valid_cells': int(Ck.sum()), 'chunks': chunks})
        print(f'L{k}: {s * PX:g} m, {len(chunks)} chunks, {level_bytes / 1e6:.2f} MB, step {step} m')

        # ── 3. LOD error vs every valid 5 m pixel (not only LOD vertices) ───
        # Mesh = two triangles per cell split along the (i,j)-(i+1,j+1) diagonal, exactly as the runtime builds it.
        z00, z10, z01, z11 = Hd[:-1, :-1], Hd[:-1, 1:], Hd[1:, :-1], Hd[1:, 1:]      # [row j, col i]; "10" = i+1
        errs, steep_errs = [], []
        in_disk_cover = 0
        for bj in range(s):
            for ai in range(s):
                u, v = ai / s, bj / s
                zm = z00 + u * (z10 - z00) + v * (z11 - z10) if u >= v else z00 + v * (z01 - z00) + u * (z11 - z01)
                ref = H[bj::s, ai::s][:Ck.shape[0], :Ck.shape[1]]
                dk = disk[bj::s, ai::s][:Ck.shape[0], :Ck.shape[1]]
                sel = Ck[:ref.shape[0], :ref.shape[1]] & dk
                e = np.abs(zm[:ref.shape[0], :ref.shape[1]][sel] - ref[sel].astype(np.float64))
                errs.append(e.astype(np.float32))
                in_disk_cover += int(sel.sum())
        e = np.concatenate(errs)
        n_valid_disk = int((valid & disk).sum())
        lod_rows.append({'level': k, 'spacing_m': s * PX, 'samples_5m_pixels': int(e.size),
                         'mean_abs_error_m': float(e.mean(dtype=np.float64)), 'max_abs_error_m': float(e.max()),
                         'p95_abs_error_m': float(np.percentile(e, 95)), 'p99_abs_error_m': float(np.percentile(e, 99)),
                         'rmse_m': float(np.sqrt((e.astype(np.float64) ** 2).mean())),
                         'quant_step_m': step, 'max_quant_error_m': float(quant_err.max()),
                         'valid_disk_pixels_not_meshed_percent': round(100 * (1 - in_disk_cover / n_valid_disk), 4)})
        del errs, e

    with (rep / 'task02_lod_error.csv').open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(lod_rows[0].keys()))
        w.writeheader()
        w.writerows(lod_rows)
    md = ['# Task 02 — sai số cao độ theo cấp LOD', '',
          'Sai số ở đây là **sai lệch do giảm mật độ lưới và lượng tử hóa** so với DEM LOLA 5 m đã ghép. Nó **không phải** sai số đo của LOLA (`toterr`, `slperr` là đại lượng khác).', '',
          '- **Miền đo:** mọi pixel 5 m hợp lệ trong hình tròn nằm dưới một ô lưới hợp lệ của cấp đó (không chỉ tại đỉnh lưới).',
          '- **Bề mặt so sánh:** hai tam giác mỗi ô, chia theo đường chéo (i,j)→(i+1,j+1), đúng như game dựng; đỉnh lấy giá trị đã giải lượng tử.',
          '- **LOD:** lấy mẫu thưa chính DEM 5 m (mỗi 2^k pixel), không làm mượt, không dùng LDEM 80 m.',
          '- **Chỉ L0 mới là lưới 5 m.** Các cấp khác thưa hơn và không được gọi là "chính xác 5 m".', '',
          '| LOD | Bước lưới | Số pixel 5 m đo | mean \\|Δz\\| (m) | p95 (m) | p99 (m) | RMSE (m) | max \\|Δz\\| (m) | Bước lượng tử (m) | Sai số lượng tử max (m) | Pixel hợp lệ không dựng lưới |',
          '|---|---|---|---|---|---|---|---|---|---|---|']
    for r in lod_rows:
        md.append(f"| L{r['level']} | {r['spacing_m']:g} m | {r['samples_5m_pixels']:,} | {r['mean_abs_error_m']:.4f} | {r['p95_abs_error_m']:.4f} | {r['p99_abs_error_m']:.4f} | {r['rmse_m']:.4f} | {r['max_abs_error_m']:.3f} | {r['quant_step_m']} | {r['max_quant_error_m']:.4f} | {r['valid_disk_pixels_not_meshed_percent']} % |")
    md += ['', '"Pixel hợp lệ không dựng lưới" là phần sát mép vùng dữ liệu mà ô lưới thưa không phủ tới (ô chỉ được dựng khi mọi pixel 5 m bên dưới đều hợp lệ). Khi camera lại gần, cấp mịn hơn thay thế nên mép được dựng chính xác dần.', '',
           'Va chạm và kiểm tra tuyến rover **không** được dựa vào cấp LOD thưa; `check` độ dốc dùng lớp `slp` 5 m gốc.', '']
    (rep / 'task02_lod_error.md').write_text('\n'.join(md), encoding='utf-8')

    # ── 4. Coverage map (20 m) + full-resolution source mask ────────────────
    cov = np.zeros((N, N), dtype=np.uint8)            # 0 outside circle, 1 NoData in circle, 2 Site01, 3 Site04
    cov[disk] = 1
    cov[disk & (src == 1)] = 2
    cov[disk & (src == 4)] = 3
    cov20 = cov[2::4, 2::4].copy()
    blob = gzip.compress(cov20.tobytes(), compresslevel=9, mtime=0)
    (pub / 'coverage_20m.bin').write_bytes(blob)
    total_bytes += len(blob)
    from PIL import Image
    pal = Image.fromarray(cov, mode='P')
    pal.putpalette([9, 13, 30, 20, 26, 51, 184, 160, 255, 89, 201, 255] + [0] * (252 * 3))
    pal.save(pub / 'source_mask_5m.png', optimize=True)

    # ── 5. Anchors, base reference, science zones ───────────────────────────
    def pix(x, y):
        return int(math.floor((FRAME['y_max'] - y) / PX)), int(math.floor((x - FRAME['x_min']) / PX))

    base = next(a for a in ANCHORS if a['id'] == 'BASE')
    br, bc = pix(*base['xy'])
    base_h = float(H[br, bc])
    slp = np.where(src == 1, place('Site01', 'slp')[0], np.where(src == 4, place('Site04', 'slp')[0], np.nan)).astype(np.float32)
    slperr = np.where(src == 1, place('Site01', 'slperr')[0], np.where(src == 4, place('Site04', 'slperr')[0], np.nan)).astype(np.float32)
    tot = np.where(src == 1, t1, np.where(src == 4, t4, np.nan)).astype(np.float32)

    def bilinear(arr, x, y):
        fx, fy = (x - FRAME['x_min']) / PX - 0.5, (FRAME['y_max'] - y) / PX - 0.5
        i0, j0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
        u, v = fx - i0, fy - j0
        return (arr[j0, i0] * (1 - u) * (1 - v) + arr[j0, i0 + 1] * u * (1 - v) + arr[j0 + 1, i0] * (1 - u) * v + arr[j0 + 1, i0 + 1] * u * v)

    # ── 6. Straight-line route check BASE -> A..D on the native 5 m layers ──
    routes = {}
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(4, 1, figsize=(12, 13), dpi=120)
    for ax, a in zip(axes, [a for a in ANCHORS if a['id'] != 'BASE']):
        (x0, y0), (x1, y1) = base['xy'], a['xy']
        length = math.hypot(x1 - x0, y1 - y0)
        n = int(length // 2.5) + 1
        t = np.linspace(0, 1, n)
        px_, py_ = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        rr, cc = np.floor((FRAME['y_max'] - py_) / PX).astype(int), np.floor((px_ - FRAME['x_min']) / PX).astype(int)
        s_line, src_line = slp[rr, cc], np.where(disk[rr, cc], src[rr, cc], 0)
        dist = t * length
        crosses_nodata = bool((src_line == 0).any())
        h_line = bilinear(H, px_, py_)
        k20 = 4                                             # ±10 m baseline for the along-track grade
        grade = np.full(n, np.nan)
        grade[k20:-k20] = np.degrees(np.arctan(np.abs(h_line[2 * k20:] - h_line[:-2 * k20]) / (2 * k20 * 2.5)))
        over = s_line > ROUTE_NOMINAL_SLOPE_LIMIT_DEG
        segs = []
        if over.any():
            edges = np.flatnonzero(np.diff(np.concatenate([[0], over.astype(np.int8), [0]])))
            for a0, b0 in zip(edges[::2], edges[1::2]):
                segs.append({'from_m': round(float(dist[a0]), 1), 'to_m': round(float(dist[b0 - 1]), 1), 'length_m': round(float(dist[b0 - 1] - dist[a0]) + 2.5, 1),
                             'max_slope_deg': round(float(s_line[a0:b0].max()), 2),
                             'from_xy_m': [round(float(px_[a0]), 1), round(float(py_[a0]), 1)], 'to_xy_m': [round(float(px_[b0 - 1]), 1), round(float(py_[b0 - 1]), 1)]})
        switch = np.flatnonzero((src_line[1:] != src_line[:-1]) & (src_line[1:] > 0) & (src_line[:-1] > 0))
        seam_cross = [{'at_m': round(float(dist[i]), 1), 'step_m': round(float(max(d[rr[i], cc[i]], d[rr[i + 1], cc[i + 1]])), 3)} for i in switch]
        over_len = float(over.sum() * 2.5)
        status = 'BLOCKED_BY_NODATA' if crosses_nodata else ('NOT_NOMINAL' if segs else 'UNVERIFIED')
        routes[a['id']] = {
            'kind': 'Đường thẳng BASE → điểm (chỉ để kiểm tra; KHÔNG phải tuyến đã thiết kế, không phải tuyến an toàn)',
            'straight_line_length_m': round(length, 1), 'samples': n, 'sample_spacing_m': 2.5, 'crosses_nodata': crosses_nodata,
            'route_nominal_slope_limit_deg': ROUTE_NOMINAL_SLOPE_LIMIT_DEG,
            'slope_layer': 'slp 5 m gốc của nguồn được chọn tại từng pixel (độ dốc địa hình, mọi hướng)',
            'max_slope_deg': round(float(np.nanmax(s_line)), 2), 'mean_slope_deg': round(float(np.nanmean(s_line)), 2),
            'max_along_track_grade_deg_20m_baseline': round(float(np.nanmax(grade)), 2),
            'max_slope_error_deg_slperr': round(float(np.nanmax(slperr[rr, cc])), 2),
            'length_over_limit_m': round(over_len, 1), 'percent_over_limit': round(100 * over_len / length, 2),
            'percent_length_over_threshold': {f'{th:g}': round(100 * float((s_line > th).mean()), 2) for th in ROVER_SLOPE_REPORT_THRESHOLDS},
            'segments_over_limit': segs, 'segments_over_limit_count': len(segs),
            'seam_crossings': seam_cross,
            'height_start_m': round(float(h_line[0]), 2), 'height_end_m': round(float(h_line[-1]), 2),
            'height_min_m': round(float(np.nanmin(h_line)), 2), 'height_max_m': round(float(np.nanmax(h_line)), 2),
            'route_status': status,
        }
        ax.fill_between(dist / 1000, 0, s_line, color='#b8a0ff', lw=0, label='Độ dốc địa hình (slp 5 m)')
        ax.fill_between(dist / 1000, 0, np.where(over, s_line, np.nan), color='#ff665c', lw=0, label=f'Vượt ngưỡng danh định {ROUTE_NOMINAL_SLOPE_LIMIT_DEG:g}° (NASA VIPER, G17)')
        ax.axhline(ROUTE_NOMINAL_SLOPE_LIMIT_DEG, color='#ff665c', lw=0.8, ls='--')
        for sc in seam_cross:
            ax.axvline(sc['at_m'] / 1000, color='k', lw=0.8, ls=':')
        ax2 = ax.twinx()
        ax2.plot(dist / 1000, h_line, color='#2a2f4a', lw=1)
        ax2.set_ylabel('Cao độ (m)')
        ax.set_ylabel('Độ dốc (°)')
        ax.set_title(f"BASE → {a['id']} ({a['name']}): {length / 1000:.2f} km · dốc max {routes[a['id']]['max_slope_deg']}° · {routes[a['id']]['percent_over_limit']} % chiều dài vượt {ROUTE_NOMINAL_SLOPE_LIMIT_DEG:g}° · {status}", fontsize=10)
        ax.legend(loc='upper left', fontsize=8)
    axes[-1].set_xlabel('Khoảng cách dọc đường thẳng từ BASE (km). Đường chấm dọc = cắt đường nối Site01/Site04.')
    fig.tight_layout()
    fig.savefig(rep / 'task02_route_slope.png')
    plt.close(fig)
    route_report = {'generated_utc': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
                    'slope_limit_deg': ROUTE_NOMINAL_SLOPE_LIMIT_DEG,
                    'slope_limit_provenance': SLOPE_PROVENANCE,
                    'note': 'Chưa có giới hạn phương tiện thật, lớp chiếu sáng, temperature, communications: KHÔNG tuyến nào được gắn SAFE_ROUTE. Trạng thái tốt nhất có thể là UNVERIFIED.',
                    'routes': routes}
    (rep / 'task02_route_slope.json').write_text(json.dumps(route_report, ensure_ascii=False, indent=2), encoding='utf-8')
    rmd = ['# Task 02 — kiểm tra độ dốc dọc đường thẳng BASE → A/B/C/D', '',
           f'Ngưỡng dốc **{ROUTE_NOMINAL_SLOPE_LIMIT_DEG:g}°** là độ dốc vận hành danh định tối đa của NASA VIPER (`MEASURED` cho VIPER, nguồn [S10] trong `docs/EVIDENCE.md`, hàng G17); LUNARIS dùng làm ngưỡng quy hoạch bảo thủ (`SCENARIO`). Đoạn vượt ngưỡng là `NOT_NOMINAL`, cần xem xét; đây không phải giới hạn vật lý của mọi rover. Dữ liệu: lớp `slp` 5 m gốc của NASA, lấy mẫu mỗi 2,5 m.',
           'Đây là đường thẳng để kiểm tra, **không phải tuyến an toàn**. Không tuyến nào được gắn `SAFE_ROUTE`.', '',
           '| Điểm | Dài (km) | Dốc max (°) | Dốc TB (°) | % dài > 10° | % dài > 15° | % dài > 20° | % dài > 25° | Số đoạn vượt 15° | Cắt NoData | Cắt đường nối | Trạng thái |',
           '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for k_, r in routes.items():
        p = r['percent_length_over_threshold']
        rmd.append(f"| {k_} | {r['straight_line_length_m'] / 1000:.2f} | {r['max_slope_deg']} | {r['mean_slope_deg']} | {p['10']} | {p['15']} | {p['20']} | {p['25']} | {r['segments_over_limit_count']} | {'CÓ' if r['crosses_nodata'] else 'không'} | {len(r['seam_crossings'])} | `{r['route_status']}` |")
    for k_, r in routes.items():
        rmd += ['', f"## BASE → {k_}: các đoạn vượt {ROUTE_NOMINAL_SLOPE_LIMIT_DEG:g}° dài nhất", '']
        top = sorted(r['segments_over_limit'], key=lambda s_: -s_['length_m'])[:12]
        if not top:
            rmd.append('Không có đoạn nào vượt giới hạn.')
            continue
        rmd += ['| Từ (m) | Đến (m) | Dài (m) | Dốc max (°) | XY đầu đoạn (m) |', '|---|---|---|---|---|']
        rmd += [f"| {s_['from_m']} | {s_['to_m']} | {s_['length_m']} | {s_['max_slope_deg']} | {s_['from_xy_m'][0]}, {s_['from_xy_m'][1]} |" for s_ in top]
        if len(r['segments_over_limit']) > len(top):
            rmd.append(f"\n(còn {len(r['segments_over_limit']) - len(top)} đoạn ngắn hơn, xem `task02_route_slope.json`)")
        for sc in r['seam_crossings']:
            rmd.append(f"\nCắt đường nối Site01/Site04 tại {sc['at_m']} m, bậc chênh tại đó {sc['step_m']} m.")
    (rep / 'task02_route_slope.md').write_text('\n'.join(rmd) + '\n', encoding='utf-8')

    # science zones
    ledger = {
        'lola5m': {'dataset': 'NASA PGDA — LOLA 5 m site DEMs (Site01, Site04)', 'url': 'https://pgda.gsfc.nasa.gov/products/78', 'resolution': '5 m/pixel', 'unit': 'm', 'provenance': 'MEASURED'},
        'psr': {'dataset': 'NASA PGDA — PSR map (LPSR_80S_20MPP_ADJ)', 'url': 'https://pgda.gsfc.nasa.gov/products/90', 'resolution': '20 m/pixel', 'unit': 'mask', 'provenance': 'MEASURED'},
        'sathyan': {'dataset': 'Sathyan et al. (2024) — study areas C1 and S', 'url': 'https://www.sciencedirect.com/science/article/pii/S0019103524000460', 'resolution': 'study-area anchor', 'unit': 'lat/lon', 'provenance': 'PUBLISHED_REFERENCE'},
    }
    # PSR membership straight from the NASA 20 m PSR raster, when that file is available (optional input).
    psr_at: dict = {}
    psr_path = raw / 'LPSR_80S_20MPP_ADJ.TIF'
    if psr_path.exists():
        try:
            with rasterio.open(psr_path) as ds:
                for a in ANCHORS:
                    r_, c_ = ds.index(*a['xy'])
                    psr_at[a['id']] = float(ds.read(1, window=rasterio.windows.Window(c_, r_, 1, 1))[0, 0])
        except Exception as exc:  # incomplete download: leave PSR unverified
            print('PSR raster not readable yet:', exc)
            psr_at = {}
    zones = []
    for a in ANCHORS:
        if a['id'] == 'BASE':
            continue
        r_, c_ = pix(*a['xy'])
        lat, lon = closed_form_latlon(a['xy'][0], a['xy'][1], 1737400.0)
        is_psr = a['id'] in ('A', 'B')
        zones.append({
            'id': a['id'], 'name': a['name'], 'anchor_xy_m': list(a['xy']), 'anchor_moved': False,
            'anchor_latlon': {'lat_deg': round(lat, 6), 'lon_east_deg': round(lon, 6), 'accuracy': 'computed from file CRS' + ('; source coordinate approximate (≈)' if a['xy_is_approximate'] else '')},
            'source_latlon': {'lat_deg': a['dossier_latlon'][0], 'lon_east_deg': a['dossier_latlon'][1]},
            'local_xz_m': [a['xy'][0] - base['xy'][0], base['xy'][1] - a['xy'][1]],
            'valid_dem': bool(src[r_, c_] > 0 and disk[r_, c_]), 'source_tile': f'Site0{int(src[r_, c_])}',
            'height_m': round(float(H[r_, c_]), 2), 'slope_deg': round(float(slp[r_, c_]), 2), 'toterr_m': round(float(tot[r_, c_]), 3),
            'position_provenance': 'MEASURED' if is_psr else 'PUBLISHED_REFERENCE',
            'in_mapped_psr_pixel': (psr_at[a['id']] == 1.0) if a['id'] in psr_at else None,
            'ice_status': 'CANDIDATE_UNVERIFIED',
            'verification_needed': 'awaiting rover verification',
            'UI_label': 'Mapped PSR — ice not confirmed' if is_psr else 'Published research area — no confirmed ice spot',
            'scientific_evidence': [dict(ledger['lola5m'], coverage='point lies on valid DEM'),
                                    dict(ledger['psr'], coverage='20 m PSR pixel containing the point', status=('VERIFIED_FROM_RASTER' if psr_at.get(a['id']) == 1.0 else 'NOT_IN_PSR_PIXEL' if a['id'] in psr_at else 'PENDING_FILE'), raster_value=psr_at.get(a['id'])) if is_psr
                                    else dict(ledger['sathyan'], coverage='reference point of the research area, not an ice pixel or PSR centre')],
            'data_layers_missing': ['Diviner', 'M3', 'LAMP'], 'data_layers_note': 'NO GEOREFERENCED DATA LAYER YET',
            'straight_line_from_base_m': routes[a['id']]['straight_line_length_m'],
            'route_status': routes[a['id']]['route_status'],
            'route_check': dict({key: routes[a['id']][key] for key in ('route_nominal_slope_limit_deg', 'max_slope_deg', 'percent_over_limit', 'segments_over_limit_count', 'crosses_nodata')},
                                first_block_at_m=(routes[a['id']]['segments_over_limit'][0]['from_m'] if routes[a['id']]['segments_over_limit'] else None),
                                segments_over_limit=[[s_['from_m'], s_['to_m'], s_['max_slope_deg']] for s_ in routes[a['id']]['segments_over_limit']]),
        })
    zones_doc = {'note': 'The four points keep their source coordinates. A PSR, low temperature, hydrogen or high reflectance is NOT the same as confirmed ice. LCROSS (Cabeus) lies outside the map: REFERENCE_ONLY, no marker.',
                 'route_nominal_slope_limit_deg': ROUTE_NOMINAL_SLOPE_LIMIT_DEG, 'slope_limit_provenance': SLOPE_PROVENANCE, 'zones': zones}
    (pub / 'science_zones.json').write_text(json.dumps(zones_doc, ensure_ascii=False, indent=2), encoding='utf-8')

    # ── 7. metadata.json ────────────────────────────────────────────────────
    c = {name: int(((cov == i)).sum()) for i, name in ((1, 'nodata'), (2, 'site01'), (3, 'site04'))}
    n_disk = int(disk.sum())
    lat_b, lon_b = closed_form_latlon(base['xy'][0], base['xy'][1], 1737400.0)
    meta = {
        'format': 'lunaris-ldem', 'version': 1, 'generated_utc': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'provenance': 'MEASURED — NASA LOLA 5 m DEM (Site01 Connecting Ridge, Site04 Shackleton Rim). No LDEM 80 m, no 87S, no procedural terrain.',
        'crs': {'projection': 'Polar Stereographic (south), lat_0 = −90°, lon_0 = 0°, true scale at pole', 'sphere_radius_m': 1737400.0, 'units': 'm', 'epsg': None},
        'height': {'unit': 'm', 'datum': 'relative to a sphere of radius 1737.4 km (per the PGDA description)', 'vertical_scale': 1.0, 'smoothing': 'none'},
        'grid': {'x_min': FRAME['x_min'], 'y_max': FRAME['y_max'], 'pixel_m': PX, 'size_px': N, 'registration': 'vertex i ↔ pixel centre: X = x_min + (i + 0.5)·5, Y = y_max − (j + 0.5)·5'},
        'circle': {'center_xy_m': list(CIRCLE_CENTER), 'radius_m': CIRCLE_RADIUS, 'store_margin_m': STORE_MARGIN_M,
                   'note': 'Data is stored out to R + margin only so the circle can be clipped exactly when rendering; outside the circle nothing is shown or drivable.'},
        'base': {'xy_m': list(base['xy']), 'height_m': round(base_h, 4), 'lat_deg': round(lat_b, 6), 'lon_east_deg': round(lon_b, 6), 'status': 'SCENARIO'},
        'local_frame': {'x': 'X − X_base (east)', 'y': 'h − h_base (up)', 'z': 'Y_base − Y (nam)', 'inverse': 'X = X_base + x, Y = Y_base − z, h = h_base + y', 'scale': '1 unit = 1 m on all three axes'},
        'tiling': {'levels': LEVELS, 'tile_cells': TILE_CELLS, 'chunk_cells': CHUNK_CELLS, 'triangulation': 'cell (i,j) is split along the diagonal (i,j)→(i+1,j+1)',
                   'chunk_file': 'L{level}/{cx}_{cy}.dem = gzip(30 B header + delta low bytes + delta high bytes + valid-vertex bits + valid-cell bits)',
                   'cell_rule': 'a cell exists only if every 5 m pixel under it is valid → no triangle bridges NoData'},
        'coverage_in_circle': {'pixels': n_disk, 'site01_percent': round(100 * c['site01'] / n_disk, 4), 'site04_percent': round(100 * c['site04'] / n_disk, 4),
                               'nodata_percent': round(100 * c['nodata'] / n_disk, 4), 'nodata_label': 'outside NASA data coverage'},
        'coverage_map': {'file': 'coverage_20m.bin', 'encoding': 'gzip(uint8[1250×1250])', 'cell_m': 20, 'values': {'0': 'outside the circle', '1': 'NoData inside the circle', '2': 'Site01', '3': 'Site04'},
                         'sampling': 'sampled at pixel (2 + 4i) of the 5 m grid; used only for UI labels, not for collision'},
        'source_mask': {'file': 'source_mask_5m.png', 'values': 'palette index: 0 outside circle, 1 NoData, 2 Site01, 3 Site04'},
        'seam': seam,
        'sources': {f'{s_}_{l_}': {'file': f'{s_}_final_adj_5mpp_{l_}.tif', 'sha256': sha256(raw / f'{s_}_final_adj_5mpp_{l_}.tif')} for s_ in ('Site01', 'Site04') for l_ in ('surf', 'toterr', 'slp', 'slperr')},
        'total_bytes': total_bytes,
        'levels': levels_meta,
        'lod_error': lod_rows,
        'lighting': 'ARTISTIC_LIGHTING — NOT PHYSICAL SUNLIGHT (PENDING_EPHEMERIS)',
    }
    (pub / 'metadata.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    total_bytes += (pub / 'metadata.json').stat().st_size

    # ── 8. Seam figure ──────────────────────────────────────────────────────
    r0, r1 = pix(0, -4000)[0], pix(0, -15000)[0]
    c0, c1 = pix(-9000, 0)[1], pix(-3000, 0)[1]
    dd = (z4.astype(np.float64) - z1.astype(np.float64))[r0:r1, c0:c1]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13.5, 8), dpi=130, gridspec_kw={'width_ratios': [1, 1.15]})
    lim = 1.3
    im = a1.imshow(dd[::2, ::2], cmap='RdBu_r', vmin=-lim, vmax=lim, extent=[-9, -3, -15, -4], interpolation='nearest')
    sm = (src[r0:r1, c0:c1] == 1)
    a1.contour(np.linspace(-9, -3, sm.shape[1]), np.linspace(-4, -15, sm.shape[0]), sm.astype(float), levels=[0.5], colors='k', linewidths=1.4)
    a1.plot(seam['max_step_location_xy_m'][0] / 1000, seam['max_step_location_xy_m'][1] / 1000, 'o', mfc='none', mec='#00a000', ms=12, mew=2)
    a1.set_title('z(Site04) − z(Site01) (m), cắt ở ±1,3 m\nĐường đen = đường nối sau khi ghép · vòng xanh = bậc lớn nhất', fontsize=10)
    a1.set_xlabel('X (km)')
    a1.set_ylabel('Y (km)')
    a1.set_aspect('equal')
    fig.colorbar(im, ax=a1, shrink=0.8, label='m')
    a2.hist(steps, bins=np.linspace(0, max(3.5, steps.max()), 120), color='#7a63c9')
    a2.set_yscale('log')
    a2.set_xlabel('Bậc chênh tại đường nối (m)')
    a2.set_ylabel('Số cặp pixel kề nhau (log)')
    a2.set_title(f"Đường nối sau ghép: {seam['seam_length_km']:.2f} km · {seam['seam_pairs']:,} cặp pixel\n"
                 f"bậc max = {seam['max_step_m']:.2f} m · TB = {seam['mean_step_m']:.3f} m · p95 = {seam['p95_step_m']:.3f} m · >1 m: {seam['pairs_step_gt_1m']} cặp", fontsize=10)
    fig.suptitle(f'LUNARIS Task 02 — ghép Site01/Site04: Site0{preferred} ưu tiên (toterr thấp hơn), tránh dải 50 m sát mép tile; không blend', fontsize=11.5)
    fig.savefig(rep / 'task02_seams.png', bbox_inches='tight')
    plt.close(fig)

    print(f'base height {base_h:.4f} m; total public bytes {total_bytes / 1e6:.2f} MB')
    for k_, r in routes.items():
        print(f"route BASE→{k_}: {r['straight_line_length_m']:.0f} m, max slope {r['max_slope_deg']}°, {r['percent_over_limit']} % > {ROUTE_NOMINAL_SLOPE_LIMIT_DEG:g}°, {r['segments_over_limit_count']} segs, {r['route_status']}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
