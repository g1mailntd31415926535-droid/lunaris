#!/usr/bin/env python
"""LUNARIS Task 02 - step 1: inspect the real NASA LOLA GeoTIFF inputs.

Reads every header value straight from the files (rasterio/GDAL); nothing here
is taken from the Barker et al. estimate. Produces:

  reports/task02_geospatial_validation.json
  reports/task02_coverage.png
  reports/task02_overlap_difference.png

It does NOT build terrain, does NOT fill NoData, does NOT move any anchor and
does NOT touch game code.

Exit codes
  0  every required input present and readable, all checks done
  2  geospatial core verified, but required inputs are missing/incomplete
  3  hard failure: a surf DEM is missing/unreadable, CRS/grid mismatch, or an
     anchor/BASE falls on NoData or outside the circle
  1  unexpected error

Usage (from the UI/ folder):
  ..\\.venv_task02\\Scripts\\python.exe scripts\\terrain\\inspect_inputs.py
  [--raw DIR] [--out DIR]
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import sys
import tarfile
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings('ignore', category=DeprecationWarning)

warnings.filterwarnings('ignore', message='You will likely lose important projection information')

import rasterio  # noqa: E402
import rasterio.windows  # noqa: E402
from pyproj import CRS, Transformer  # noqa: E402

# ── Locked Task 02 decisions (section 1 of the spec). Never edited to fit data. ──
CIRCLE_CENTER = (-8500.0, -10500.0)   # m, projected X/Y
CIRCLE_RADIUS = 12500.0               # m
FRAME = {'x_min': -21000.0, 'x_max': 4000.0, 'y_min': -23000.0, 'y_max': 2000.0}

# Anchors exactly as given in section 3. `dossier_latlon` is the lat / east-lon
# written in the project dossier; it is only COMPARED, never used to move a point.
ANCHORS = [
    {'id': 'A', 'name': 'PSR #1470', 'xy': (-16970.0, -8485.0), 'dossier_latlon': (-89.37432, 243.43495), 'xy_is_approximate': False},
    {'id': 'B', 'name': 'PSR #921', 'xy': (-4240.0, -12345.0), 'dossier_latlon': (-89.56955, 198.95549), 'xy_is_approximate': False},
    {'id': 'C', 'name': 'Connecting Ridge C1', 'xy': (-12467.0, -13001.0), 'dossier_latlon': (-89.406, 223.800), 'xy_is_approximate': True},
    {'id': 'D', 'name': 'Shackleton Rim S', 'xy': (-2606.0, -6502.0), 'dossier_latlon': (-89.769, 201.838), 'xy_is_approximate': True},
    {'id': 'BASE', 'name': 'Căn cứ tạm (SCENARIO)', 'xy': (-11000.0, -12000.0), 'dossier_latlon': None, 'xy_is_approximate': False},
]

SITES = ['Site01', 'Site04']
LAYERS = ['surf', 'slp', 'toterr', 'slperr', 'ldec']
# Units/meaning are NOT stored in the GeoTIFF headers. They are quoted from the
# NASA PGDA product description (https://pgda.gsfc.nasa.gov/products/78) and are
# labelled as such in the report.
LAYER_NOTES = {
    'surf': 'Cao độ bề mặt, mét, so với mặt cầu tham chiếu bán kính 1737,4 km (theo mô tả PGDA; header không ghi đơn vị).',
    'slp': 'Độ dốc, độ (theo mô tả PGDA; header không ghi đơn vị).',
    'toterr': 'Ước lượng sai số cao độ tổng, mét (theo mô tả PGDA; header không ghi đơn vị).',
    'slperr': 'Ước lượng sai số độ dốc, độ (theo mô tả PGDA; header không ghi đơn vị).',
    'ldec': 'Lớp phụ trợ của PGDA; ý nghĩa cần đối chiếu README của PGDA, script này không diễn giải.',
}
FORBIDDEN = ['LDEM_80S_80MPP_ADJ.TIF']   # must never be used to fill NoData


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def read_raster(path: Path, keep_data: bool):
    """Returns (info dict, array or None). status is PRESENT_VERIFIED only after a full pixel read."""
    info = {'file': path.name, 'path': str(path)}
    if not path.exists():
        info['status'] = 'MISSING'
        return info, None
    info['size_bytes'] = path.stat().st_size
    if info['size_bytes'] == 0:
        info['status'] = 'EMPTY_OR_DOWNLOADING'
        return info, None
    try:
        with rasterio.open(path) as ds:
            t = ds.transform
            info.update({
                'driver': ds.driver, 'width': ds.width, 'height': ds.height, 'band_count': ds.count,
                'dtype': ds.dtypes[0], 'nodata_declared': None if ds.nodata is None else (float(ds.nodata) if not math.isnan(ds.nodata) else 'nan'),
                'affine_gdal_geotransform': [t.c, t.a, t.b, t.f, t.d, t.e],
                'affine_abcdef': [t.a, t.b, t.c, t.d, t.e, t.f],
                'pixel_size_m': [abs(t.a), abs(t.e)],
                'bounds': {'x_min': ds.bounds.left, 'x_max': ds.bounds.right, 'y_min': ds.bounds.bottom, 'y_max': ds.bounds.top},
                'row_axis': 'north-up (y giảm khi số hàng tăng)' if t.e < 0 else 'south-up',
                'rotation_terms_zero': t.b == 0 and t.d == 0,
                'crs_wkt': ds.crs.to_wkt() if ds.crs else None,
                'compression': str(ds.compression) if ds.compression else 'none',
                'unit_in_header': ds.units[0],
                'tags': ds.tags(), 'band_tags': ds.tags(1),
            })
            # Every pixel is read (this also proves the download is complete), but
            # block by block so the 30400 x 30400 PSR grid never sits in RAM at once.
            data = np.empty((ds.height, ds.width), dtype=ds.dtypes[0]) if keep_data else None
            n_valid, vmin, vmax, vsum = 0, math.inf, -math.inf, 0.0
            rows_per_chunk = max(1, (64 << 20) // (ds.width * 4))
            for r0 in range(0, ds.height, rows_per_chunk):
                h = min(rows_per_chunk, ds.height - r0)
                block = ds.read(1, window=rasterio.windows.Window(0, r0, ds.width, h))
                if keep_data:
                    data[r0:r0 + h] = block
                ok = np.isfinite(block)
                if ds.nodata is not None and not math.isnan(ds.nodata):
                    ok &= block != ds.nodata
                v = block[ok]
                if v.size:
                    n_valid += int(v.size)
                    vmin, vmax = min(vmin, float(v.min())), max(vmax, float(v.max()))
                    vsum += float(v.sum(dtype=np.float64))
            total = ds.width * ds.height
            info.update({
                'valid_pixels': n_valid, 'total_pixels': total, 'nodata_pixels': total - n_valid,
                'value_min': vmin if n_valid else None, 'value_max': vmax if n_valid else None,
                'value_mean': vsum / n_valid if n_valid else None,
            })
        info['sha256'] = sha256(path)
        info['status'] = 'PRESENT_VERIFIED'
        return info, (data if keep_data else None)
    except Exception as exc:  # truncated download, corrupt file, ...
        info['status'] = 'INCOMPLETE_OR_CORRUPT'
        info['error'] = f'{type(exc).__name__}: {exc}'
        return info, None


def crs_summary(wkt: str) -> dict:
    crs = CRS.from_wkt(wkt)
    op = crs.coordinate_operation
    params = {p.name: p.value for p in op.params} if op else {}
    ell = crs.ellipsoid
    return {
        'is_projected': crs.is_projected,
        'projection_method': op.method_name if op else None,
        'projection_parameters': params,
        'ellipsoid_semi_major_m': ell.semi_major_metre, 'ellipsoid_semi_minor_m': ell.semi_minor_metre,
        'ellipsoid_is_sphere': ell.semi_major_metre == ell.semi_minor_metre,
        'linear_unit': crs.axis_info[0].unit_name,
        'epsg': crs.to_epsg(),
        'proj4': crs.to_proj4(),
        'note': 'CRS của Mặt Trăng, không có mã EPSG Trái Đất. Không gán EPSG.',
    }


def closed_form_latlon(x: float, y: float, radius: float):
    """Independent check: spherical south-polar stereographic, true scale at the pole, lon0 = 0."""
    r = math.hypot(x, y)
    lat = -90.0 + math.degrees(2.0 * math.atan(r / (2.0 * radius)))
    lon = math.degrees(math.atan2(x, y)) % 360.0
    return lat, lon


def rect_polygon(b: dict):
    return [[b['x_min'], b['y_min']], [b['x_max'], b['y_min']], [b['x_max'], b['y_max']], [b['x_min'], b['y_max']]]


def main() -> int:
    repo = Path(__file__).resolve().parents[2]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--raw', type=Path, default=repo.parent / 'raw_task02', help='thư mục chứa GeoTIFF NASA gốc (ngoài public/)')
    ap.add_argument('--out', type=Path, default=repo / 'reports', help='thư mục báo cáo')
    args = ap.parse_args()
    raw: Path = args.raw
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)

    report: dict = {
        'task': 'LUNARIS Task 02 — bước 1: kiểm tra tọa độ GeoTIFF',
        'generated_utc': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'tool': {'python': sys.version.split()[0], 'rasterio': rasterio.__version__, 'gdal': rasterio.__gdal_version__, 'numpy': np.__version__},
        'raw_dir': str(raw),
        'locked_geometry': {'circle_center_xy_m': list(CIRCLE_CENTER), 'circle_radius_m': CIRCLE_RADIUS, 'frame': FRAME,
                            'circle_area_geometric_km2': math.pi * CIRCLE_RADIUS ** 2 / 1e6},
        'notes': [],
        'problems': [],
    }
    problems: list = report['problems']

    # ── 1. Inventory ────────────────────────────────────────────────────────
    rasters: dict = {}
    data: dict = {}
    for site in SITES:
        for layer in LAYERS:
            p = raw / f'{site}_final_adj_5mpp_{layer}.tif'
            info, arr = read_raster(p, keep_data=layer in ('surf', 'slp', 'toterr', 'slperr', 'ldec'))
            info['layer_note'] = LAYER_NOTES[layer]
            rasters[f'{site}_{layer}'] = info
            if arr is not None:
                data[f'{site}_{layer}'] = arr
    psr_info, _ = read_raster(raw / 'LPSR_80S_20MPP_ADJ.TIF', keep_data=False)
    rois = {}
    for site in SITES:
        p = raw / f'{site}_ROIs.tgz'
        entry = {'file': p.name, 'status': 'MISSING'}
        if p.exists():
            entry['size_bytes'] = p.stat().st_size
            try:
                with tarfile.open(p) as tf:
                    entry['members'] = tf.getnames()[:200]
                entry['sha256'] = sha256(p)
                entry['status'] = 'PRESENT_VERIFIED'
            except Exception as exc:
                entry['status'] = 'INCOMPLETE_OR_CORRUPT'
                entry['error'] = f'{type(exc).__name__}: {exc}'
        rois[site] = entry
    forbidden_found = [name for name in FORBIDDEN if (raw / name).exists()]
    report['inputs'] = {'rasters': rasters, 'psr_20m': psr_info, 'rois_optional': rois,
                        'forbidden_files_present': forbidden_found}
    if forbidden_found:
        problems.append({'level': 'WARN', 'code': 'FORBIDDEN_FILE_PRESENT', 'detail': f'{forbidden_found} có trong raw_task02; script không đọc và không được dùng để lấp NoData.'})

    required_missing = [k for k, v in rasters.items() if v['status'] != 'PRESENT_VERIFIED']
    if psr_info['status'] != 'PRESENT_VERIFIED':
        required_missing.append('LPSR_80S_20MPP_ADJ.TIF')
    report['required_inputs_not_verified'] = [{'input': k, 'status': (rasters.get(k) or psr_info)['status']} for k in required_missing]

    surf_ok = {s: rasters[f'{s}_surf']['status'] == 'PRESENT_VERIFIED' for s in SITES}
    if not surf_ok['Site01']:
        problems.append({'level': 'FAIL', 'code': 'SITE01_SURF_NOT_VERIFIED', 'detail': rasters['Site01_surf']['status']})
        report['status'] = 'BLOCKED'
        (out / 'task02_geospatial_validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        return 3
    site04_available = surf_ok['Site04']
    if not site04_available:
        problems.append({'level': 'FAIL', 'code': 'SITE04_NOT_VERIFIED', 'detail': 'Thiếu/không đọc được Site04 surf: mọi kết luận về Site04, điểm D và vùng chồng lấn là NOT_VERIFIED. Bản đồ chỉ có thể là PARTIAL_COVERAGE từ Site01.'})

    # ── 2. CRS + pixel grid consistency ─────────────────────────────────────
    ref = rasters['Site01_surf']
    ref_crs = CRS.from_wkt(ref['crs_wkt'])
    report['crs'] = crs_summary(ref['crs_wkt'])
    report['crs']['wkt_from_Site01_surf'] = ref['crs_wkt']
    radius = report['crs']['ellipsoid_semi_major_m']
    px = ref['pixel_size_m'][0]
    grid_checks = []
    hard_grid_fail = False
    for key, info in rasters.items():
        if info['status'] != 'PRESENT_VERIFIED':
            continue
        same_crs = CRS.from_wkt(info['crs_wkt']) == ref_crs
        same_px = info['pixel_size_m'] == ref['pixel_size_m']
        dx = (info['bounds']['x_min'] - ref['bounds']['x_min']) / px
        dy = (info['bounds']['y_max'] - ref['bounds']['y_max']) / px
        aligned = float(dx).is_integer() and float(dy).is_integer()
        site = key.split('_')[0]
        same_extent_as_site_surf = rasters[f'{site}_surf']['status'] == 'PRESENT_VERIFIED' and info['bounds'] == rasters[f'{site}_surf']['bounds'] and info['width'] == rasters[f'{site}_surf']['width']
        grid_checks.append({'raster': key, 'same_crs_as_Site01_surf': same_crs, 'same_pixel_size': same_px,
                            'offset_from_Site01_surf_px': [dx, dy], 'pixel_aligned': aligned,
                            'same_grid_as_own_site_surf': same_extent_as_site_surf,
                            'north_up_no_rotation': info['rotation_terms_zero'] and info['affine_abcdef'][4] < 0})
        if not (same_crs and same_px and aligned and same_extent_as_site_surf):
            hard_grid_fail = hard_grid_fail or key.endswith('_surf')
            problems.append({'level': 'FAIL' if key.endswith('_surf') else 'WARN', 'code': 'GRID_OR_CRS_MISMATCH', 'detail': key})
    report['grid_alignment'] = {'reference': 'Site01_surf', 'checks': grid_checks,
                                'reprojection_needed': any(not (c['same_crs_as_Site01_surf'] and c['pixel_aligned'] and c['same_pixel_size']) for c in grid_checks)}
    if hard_grid_fail:
        report['status'] = 'BLOCKED'
        (out / 'task02_geospatial_validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        return 3

    # ── 3. World grid (frame ∪ rasters), masks by pixel centre ──────────────
    present_sites = [s for s in SITES if surf_ok[s]]
    wx0 = min([FRAME['x_min']] + [rasters[f'{s}_surf']['bounds']['x_min'] for s in present_sites])
    wx1 = max([FRAME['x_max']] + [rasters[f'{s}_surf']['bounds']['x_max'] for s in present_sites])
    wy0 = min([FRAME['y_min']] + [rasters[f'{s}_surf']['bounds']['y_min'] for s in present_sites])
    wy1 = max([FRAME['y_max']] + [rasters[f'{s}_surf']['bounds']['y_max'] for s in present_sites])
    ncol, nrow = int(round((wx1 - wx0) / px)), int(round((wy1 - wy0) / px))
    xs = wx0 + (np.arange(ncol) + 0.5) * px
    ys = wy1 - (np.arange(nrow) + 0.5) * px
    disk = ((xs[None, :] - CIRCLE_CENTER[0]) ** 2 + (ys[:, None] - CIRCLE_CENTER[1]) ** 2) <= CIRCLE_RADIUS ** 2

    valid = {}
    placement = {}
    for s in SITES:
        m = np.zeros((nrow, ncol), dtype=bool)
        if surf_ok[s]:
            b = rasters[f'{s}_surf']['bounds']
            c0, r0 = int(round((b['x_min'] - wx0) / px)), int(round((wy1 - b['y_max']) / px))
            h, w = data[f'{s}_surf'].shape
            m[r0:r0 + h, c0:c0 + w] = np.isfinite(data[f'{s}_surf'])
            placement[s] = (r0, c0, h, w)
        valid[s] = m
    v1, v4 = valid['Site01'], valid['Site04']
    valid_dem = disk & (v1 | v4)
    nodata_disk = disk & ~valid_dem
    cell_km2 = px * px / 1e6
    n_disk = int(disk.sum())

    def area(mask):
        n = int(mask.sum())
        return {'pixels': n, 'area_km2': round(n * cell_km2, 6), 'percent_of_disk': round(100.0 * n / n_disk, 4)}

    coverage = {
        'method': f'Đếm tâm pixel {px:g} m trên lưới chung; diskMask = (x+8500)²+(y+10500)² ≤ 12500².',
        'disk_pixel_area': {'pixels': n_disk, 'area_km2': round(n_disk * cell_km2, 6), 'geometric_area_km2': round(math.pi * CIRCLE_RADIUS ** 2 / 1e6, 6)},
        'in_disk': {
            'site01_only': area(disk & v1 & ~v4), 'site04_only': area(disk & v4 & ~v1), 'overlap': area(disk & v1 & v4),
            'validDEM_total': area(valid_dem), 'noDataDisk': area(nodata_disk),
        },
        'outside_disk_but_has_dem': {'site01': area(v1 & ~disk), 'site04': area(v4 & ~disk)},
        'site04_status': 'VERIFIED_FROM_FILE' if site04_available else 'NOT_VERIFIED',
        'coverage_status': 'TWO_SITES' if site04_available else 'PARTIAL_COVERAGE',
        'note': 'Tỷ lệ NoData là số đo thật từ hai file, không phải con số 25% ước lượng.',
    }
    report['coverage'] = coverage

    # Footprints from valid masks (not from bounding boxes).
    footprints = {}
    for s in present_sites:
        info = rasters[f'{s}_surf']
        full = info['nodata_pixels'] == 0
        footprints[s] = {
            'valid_pixels': info['valid_pixels'], 'nodata_pixels': info['nodata_pixels'],
            'valid_area_km2': round(info['valid_pixels'] * cell_km2, 6),
            'footprint_is_full_rectangle': full,
            'polygon_xy_m': rect_polygon(info['bounds']) if full else None,
            'note': 'Mọi pixel hợp lệ nên footprint theo mask trùng đúng hình chữ nhật bounds.' if full else 'Có NoData bên trong: footprint không phải hình chữ nhật, xem task02_coverage.png.',
        }
    report['footprints'] = footprints

    # ── 4. Overlap + seam statistics (same pixel centres, no resampling) ────
    both = v1 & v4
    overlap = {'status': 'NOT_VERIFIED' if not site04_available else 'VERIFIED_FROM_MASKS'}
    diff_img = None
    if site04_available:
        n_both = int(both.sum())
        overlap.update({'pixels': n_both, 'area_km2': round(n_both * cell_km2, 6)})
        if n_both:
            rows, cols = np.where(both.any(axis=1))[0], np.where(both.any(axis=0))[0]
            rr0, rr1, cc0, cc1 = rows[0], rows[-1] + 1, cols[0], cols[-1] + 1
            ob = {'x_min': wx0 + cc0 * px, 'x_max': wx0 + cc1 * px, 'y_min': wy1 - rr1 * px, 'y_max': wy1 - rr0 * px}
            is_rect = bool(both[rr0:rr1, cc0:cc1].all())
            overlap.update({'bounds': ob, 'is_full_rectangle': is_rect, 'polygon_xy_m': rect_polygon(ob) if is_rect else None,
                            'size_km': [(ob['x_max'] - ob['x_min']) / 1000, (ob['y_max'] - ob['y_min']) / 1000]})

            def window(site, layer):
                r0, c0, h, w = placement[site]
                return data[f'{site}_{layer}'][rr0 - r0:rr1 - r0, cc0 - c0:cc1 - c0]

            z1, z4 = window('Site01', 'surf').astype(np.float64), window('Site04', 'surf').astype(np.float64)
            sel = both[rr0:rr1, cc0:cc1]
            d = (z4 - z1)
            dv = d[sel]
            adv = np.abs(dv)
            seam = {
                'definition': 'diff = z(Site04) − z(Site01) tại cùng tâm pixel 5 m. Hai lưới trùng nhau từng pixel nên KHÔNG nội suy/resample.',
                'samples': int(dv.size),
                'mean_abs_difference_m': float(adv.mean()), 'max_abs_difference_m': float(adv.max()),
                'p95_abs_difference_m': float(np.percentile(adv, 95)), 'p99_abs_difference_m': float(np.percentile(adv, 99)),
                'median_abs_difference_m': float(np.median(adv)), 'rmse_m': float(np.sqrt((dv ** 2).mean())),
                'mean_signed_difference_m': float(dv.mean()), 'std_m': float(dv.std()),
                'pixels_abs_diff_gt_1m': int((adv > 1).sum()), 'pixels_abs_diff_gt_5m': int((adv > 5).sum()),
                'percent_abs_diff_gt_1m': round(100.0 * float((adv > 1).mean()), 4),
            }
            in_disk_sel = (disk[rr0:rr1, cc0:cc1] & sel)
            a2 = np.abs(d[in_disk_sel])
            seam['inside_disk_only'] = {'samples': int(a2.size), 'mean_abs_difference_m': float(a2.mean()), 'max_abs_difference_m': float(a2.max()), 'p95_abs_difference_m': float(np.percentile(a2, 95))}
            # Where the difference concentrates: bands along the tile edges that cut
            # through the overlap, versus the overlap interior. Measurement only.
            band = 10  # pixels = 50 m
            oh, ow = d.shape
            ad = np.abs(d)
            interior = ad[band:oh - band, band:ow - band]
            seam['edge_band_stats'] = {
                'band_width_m': band * px,
                'site04_west_edge_x_-9000': {'mean_abs_m': float(ad[:, :band].mean()), 'max_abs_m': float(ad[:, :band].max())},
                'site04_south_edge_y_-15000': {'mean_abs_m': float(ad[oh - band:, :].mean()), 'max_abs_m': float(ad[oh - band:, :].max())},
                'site01_east_edge_x_-3000': {'mean_abs_m': float(ad[:, ow - band:].mean()), 'max_abs_m': float(ad[:, ow - band:].max())},
                'site01_north_edge_y_-4000': {'mean_abs_m': float(ad[:band, :].mean()), 'max_abs_m': float(ad[:band, :].max())},
                'interior': {'mean_abs_m': float(interior.mean()), 'max_abs_m': float(interior.max()), 'p95_abs_m': float(np.percentile(interior, 95))},
                'note': 'Các cạnh này chính là nơi đường nối giữa hai tile có thể chạy qua khi dựng mesh.',
            }
            if all(f'{s}_toterr' in data for s in SITES):
                t1, t4 = window('Site01', 'toterr').astype(np.float64), window('Site04', 'toterr').astype(np.float64)
                sigma = np.sqrt(t1 ** 2 + t4 ** 2)[sel]
                seam['vs_published_uncertainty'] = {
                    'definition': 'sigma = sqrt(toterr01² + toterr04²) từ chính hai file toterr của NASA (DERIVED).',
                    'mean_toterr_site01_m': float(t1[sel].mean()), 'mean_toterr_site04_m': float(t4[sel].mean()),
                    'percent_abs_diff_gt_1sigma': round(100.0 * float((adv > sigma).mean()), 4),
                    'percent_abs_diff_gt_2sigma': round(100.0 * float((adv > 2 * sigma).mean()), 4),
                    'percent_abs_diff_gt_3sigma': round(100.0 * float((adv > 3 * sigma).mean()), 4),
                    'site04_toterr_lower_percent_of_overlap': round(100.0 * float((t4[sel] < t1[sel]).mean()), 4),
                }
            else:
                seam['vs_published_uncertainty'] = {'status': 'NOT_COMPUTED', 'reason': 'thiếu file toterr'}
            seam['source_selection'] = {'status': 'NOT_DECIDED_IN_THIS_STEP',
                                        'note': 'Bước này chỉ đo. Quy tắc chọn nguồn ở vùng chồng lấn và cờ BLOCKED_BY_SEAM sẽ quyết ở bước dựng mesh; không blend, không sửa cao độ.'}
            overlap['elevation_comparison'] = seam
            diff_img = (np.where(sel, d, np.nan), ob)
    report['overlap'] = overlap

    # ── 5. Anchors + BASE ───────────────────────────────────────────────────
    to_geo = Transformer.from_crs(ref_crs, ref_crs.geodetic_crs, always_xy=True)
    to_xy = Transformer.from_crs(ref_crs.geodetic_crs, ref_crs, always_xy=True)
    nd_rows, nd_cols = np.where(nodata_disk)
    nd_x, nd_y = xs[nd_cols], ys[nd_rows]
    anchors_out = []
    anchor_fail = False
    max_formula_disagreement = 0.0
    for a in ANCHORS:
        x, y = a['xy']
        col, row = int(math.floor((x - wx0) / px)), int(math.floor((wy1 - y) / px))
        inside_frame = 0 <= col < ncol and 0 <= row < nrow
        dist_centre = math.hypot(x - CIRCLE_CENTER[0], y - CIRCLE_CENTER[1])
        inside_circle = dist_centre <= CIRCLE_RADIUS
        in1 = bool(inside_frame and v1[row, col])
        in4 = bool(inside_frame and v4[row, col])
        lon, lat = to_geo.transform(x, y)
        lon %= 360.0
        lat_cf, lon_cf = closed_form_latlon(x, y, radius)
        max_formula_disagreement = max(max_formula_disagreement, abs(lat - lat_cf), abs((lon - lon_cf + 180) % 360 - 180))
        entry = {
            'id': a['id'], 'name': a['name'], 'anchor_xy_m': [x, y], 'anchor_xy_is_approximate_in_source': a['xy_is_approximate'],
            'anchor_moved': False,
            'latlon_from_file_crs': {'lat_deg': round(lat, 6), 'lon_east_deg': round(lon, 6)},
            'inside_circle': inside_circle, 'distance_to_circle_centre_m': round(dist_centre, 2),
            'distance_to_circle_edge_m': round(CIRCLE_RADIUS - dist_centre, 2),
            'valid_dem': in1 or in4, 'in_site01': in1, 'in_site04': in4,
            'source_tile': 'Site01+Site04 (overlap)' if in1 and in4 else 'Site01' if in1 else 'Site04' if in4 else None,
            'pixel_centre_xy_m': [float(xs[col]), float(ys[row])] if inside_frame else None,
            'samples': {},
        }
        if not site04_available:
            entry['site04_check'] = 'NOT_VERIFIED'
        for s in SITES:
            if not (in1 if s == 'Site01' else in4):
                continue
            r0, c0, _, _ = placement[s]
            vals = {}
            for layer, key in (('surf', 'height_m'), ('slp', 'slope_deg'), ('toterr', 'toterr_m'), ('slperr', 'slperr_deg'), ('ldec', 'ldec')):
                arr = data.get(f'{s}_{layer}')
                vals[key] = round(float(arr[row - r0, col - c0]), 4) if arr is not None else 'NOT_AVAILABLE'
            entry['samples'][s] = vals
        if in1 and in4:
            entry['height_difference_site04_minus_site01_m'] = round(entry['samples']['Site04']['height_m'] - entry['samples']['Site01']['height_m'], 4)
        entry['nodata_distance_m'] = round(float(np.sqrt((nd_x - x) ** 2 + (nd_y - y) ** 2).min()), 2) if nd_x.size else None
        if a['dossier_latlon']:
            dlat, dlon = a['dossier_latlon']
            fx, fy = to_xy.transform(dlon, dlat)
            entry['dossier_check'] = {
                'dossier_lat_deg': dlat, 'dossier_lon_east_deg': dlon,
                'xy_from_dossier_latlon_m': [round(fx, 2), round(fy, 2)],
                'offset_anchor_vs_dossier_latlon_m': round(math.hypot(fx - x, fy - y), 2),
                'lat_difference_deg': round(lat - dlat, 6), 'lon_difference_deg': round(((lon - dlon + 180) % 360) - 180, 6),
                'note': 'Chỉ để báo sai khác do làm tròn tọa độ nguồn; anchor KHÔNG bị sửa.',
            }
        entry['result'] = 'PASS' if (inside_circle and entry['valid_dem']) else 'FAIL'
        if entry['result'] == 'FAIL':
            if not site04_available and not in1 and inside_circle:
                entry['result'] = 'NOT_VERIFIED'
                entry['reason'] = 'Không nằm trên Site01; Site04 chưa có file nên không thể kết luận.'
            else:
                anchor_fail = True
                entry['reason'] = 'Ngoài hình tròn' if not inside_circle else 'Rơi vào NoData (không có DEM Site01/Site04).'
                problems.append({'level': 'FAIL', 'code': 'ANCHOR_NOT_ON_VALID_DEM', 'detail': f"{a['id']}: {entry['reason']} Anchor không được tự dời."})
        anchors_out.append(entry)
    report['anchors'] = anchors_out
    report['crs']['closed_form_cross_check'] = {
        'formula': 'lat = −90° + 2·atan(r / 2R), lon_E = atan2(x, y); R lấy từ header',
        'max_disagreement_with_pyproj_deg': max_formula_disagreement,
    }

    # Straight-line distances (metres, projected plane). Informational, not a rover route.
    base_xy = next(a['xy'] for a in ANCHORS if a['id'] == 'BASE')
    report['straight_line_distances_from_base_m'] = {
        a['id']: round(math.hypot(a['xy'][0] - base_xy[0], a['xy'][1] - base_xy[1]), 1) for a in ANCHORS if a['id'] != 'BASE'}
    report['notes'].append('Khoảng cách đường chim bay tính trên mặt phẳng chiếu; ở vĩ độ này hệ số tỷ lệ của phép chiếu lệch khỏi 1 dưới 0,01 %. Đây KHÔNG phải quãng đường rover và không có tuyến nào được coi là an toàn.')
    report['route_status'] = 'UNVERIFIED'

    # ── 6. Figures ──────────────────────────────────────────────────────────
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap
    from matplotlib.patches import Circle, Patch, Rectangle

    step = 5  # 25 m display cells; statistics above always use the full 5 m grid
    cls = np.zeros((nrow, ncol), dtype=np.uint8)            # 0 outside circle, no DEM
    cls[(v1 | v4) & ~disk] = 1                               # DEM exists but outside circle
    cls[nodata_disk] = 2
    cls[disk & v1 & ~v4] = 3
    cls[disk & v4 & ~v1] = 4
    cls[disk & v1 & v4] = 5
    colours = ['#090d1e', '#2a2f4a', '#141a33', '#b8a0ff', '#59c9ff', '#f2dcba']
    c = coverage['in_disk']
    labels = ['Ngoài hình tròn', 'Có DEM nhưng ngoài hình tròn (không dùng)',
              f"NoData trong hình tròn — ngoài vùng dữ liệu NASA: {c['noDataDisk']['area_km2']:.2f} km² ({c['noDataDisk']['percent_of_disk']:.2f} %)",
              f"Chỉ Site01: {c['site01_only']['area_km2']:.2f} km² ({c['site01_only']['percent_of_disk']:.2f} %)",
              f"Chỉ Site04: {c['site04_only']['area_km2']:.2f} km² ({c['site04_only']['percent_of_disk']:.2f} %)",
              f"Chồng lấn Site01∩Site04: {c['overlap']['area_km2']:.2f} km² ({c['overlap']['percent_of_disk']:.2f} %)"]
    fig, ax = plt.subplots(figsize=(11, 10.5), dpi=130)
    fig.patch.set_facecolor('#0b1026')
    ax.set_facecolor('#090d1e')
    ax.imshow(cls[::step, ::step], cmap=ListedColormap(colours), vmin=0, vmax=5, extent=[wx0 / 1000, wx1 / 1000, wy0 / 1000, wy1 / 1000], interpolation='nearest')
    ax.add_patch(Circle((CIRCLE_CENTER[0] / 1000, CIRCLE_CENTER[1] / 1000), CIRCLE_RADIUS / 1000, fill=False, ec='#ffffff', lw=1.6))
    ax.add_patch(Rectangle((FRAME['x_min'] / 1000, FRAME['y_min'] / 1000), (FRAME['x_max'] - FRAME['x_min']) / 1000, (FRAME['y_max'] - FRAME['y_min']) / 1000, fill=False, ec='#9ba7c0', lw=0.8, ls='--'))
    for s, col in (('Site01', '#d6c8ff'), ('Site04', '#a8e3ff')):
        if surf_ok[s]:
            b = rasters[f'{s}_surf']['bounds']
            ax.add_patch(Rectangle((b['x_min'] / 1000, b['y_min'] / 1000), (b['x_max'] - b['x_min']) / 1000, (b['y_max'] - b['y_min']) / 1000, fill=False, ec=col, lw=1.0, ls=':'))
            ax.text(b['x_min'] / 1000 + 0.3, b['y_max'] / 1000 - 0.3, f'{s} (bounds thật từ file)', color=col, fontsize=8, va='top')
    for e in anchors_out:
        x, y = e['anchor_xy_m']
        ok = e['result'] == 'PASS'
        is_base = e['id'] == 'BASE'
        ax.plot(x / 1000, y / 1000, marker='s' if is_base else 'o', ms=9, mfc='#ffd75e' if is_base else ('#5edc88' if ok else '#ff665c'), mec='#0b1026', mew=1.5, zorder=5)
        offset = {'BASE': (10, 14), 'C': (-14, -34)}.get(e['id'], (10, 10))
        ax.annotate(f"{e['id']}  ({x:.0f}, {y:.0f})\n{e['source_tile'] or 'NoData'} · {e['result']}", (x / 1000, y / 1000), xytext=offset, textcoords='offset points', fontsize=8, color='#0b1026',
                    ha='right' if e['id'] == 'C' else 'left',
                    bbox=dict(boxstyle='round,pad=0.3', fc='#f2dcba', ec='none', alpha=0.95), zorder=6)
    ax.plot(CIRCLE_CENTER[0] / 1000, CIRCLE_CENTER[1] / 1000, '+', color='#ffffff', ms=10)
    ax.set_xlabel('X (km) — hình chiếu cực Nam, lấy từ CRS của file', color='#e9edf7')
    ax.set_ylabel('Y (km)', color='#e9edf7')
    ax.tick_params(colors='#9ba7c0')
    for sp in ax.spines.values():
        sp.set_color('#3a4160')
    ax.set_title(f"LUNARIS Task 02 — vùng phủ DEM LOLA 5 m trong hình tròn R = 12,5 km\n"
                 f"DEM hợp lệ {c['validDEM_total']['percent_of_disk']:.2f} % · NoData {c['noDataDisk']['percent_of_disk']:.2f} % diện tích hình tròn"
                 + ('' if site04_available else '  ·  PARTIAL_COVERAGE (thiếu Site04)'), color='#f2dcba', fontsize=12)
    leg = ax.legend(handles=[Patch(fc=colours[i], ec='#3a4160', label=labels[i]) for i in (5, 3, 4, 2, 1, 0)], loc='lower center', bbox_to_anchor=(0.5, -0.27), ncol=1, fontsize=8.5, frameon=False)
    for t in leg.get_texts():
        t.set_color('#e9edf7')
    ax.set_aspect('equal')
    fig.savefig(out / 'task02_coverage.png', bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close(fig)

    if diff_img is not None:
        d, ob = diff_img
        s = overlap['elevation_comparison']
        lim = max(1.0, s['p99_abs_difference_m'])
        fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 8), dpi=130, gridspec_kw={'width_ratios': [1.05, 1]})
        im = a1.imshow(d[::2, ::2], cmap='RdBu_r', vmin=-lim, vmax=lim, extent=[ob['x_min'] / 1000, ob['x_max'] / 1000, ob['y_min'] / 1000, ob['y_max'] / 1000], interpolation='nearest')
        a1.add_patch(Circle((CIRCLE_CENTER[0] / 1000, CIRCLE_CENTER[1] / 1000), CIRCLE_RADIUS / 1000, fill=False, ec='k', lw=1.2))
        a1.set_xlim(ob['x_min'] / 1000, ob['x_max'] / 1000)
        a1.set_ylim(ob['y_min'] / 1000, ob['y_max'] / 1000)
        a1.set_title('z(Site04) − z(Site01) ở vùng chồng lấn (m)\nthang màu cắt ở ±p99; đường đen = biên hình tròn', fontsize=10)
        a1.set_xlabel('X (km)')
        a1.set_ylabel('Y (km)')
        a1.set_aspect('equal')
        fig.colorbar(im, ax=a1, shrink=0.8, label='m')
        dv = d[np.isfinite(d)]
        a2.hist(np.clip(dv, -lim, lim), bins=160, color='#7a63c9')
        a2.set_yscale('log')
        a2.set_xlabel('Chênh cao (m), cắt ở ±p99')
        a2.set_ylabel('Số pixel (thang log)')
        a2.set_title(f"n = {s['samples']:,} pixel 5 m (không resample)\nmean|Δ| = {s['mean_abs_difference_m']:.3f} m · p95 = {s['p95_abs_difference_m']:.3f} m · max = {s['max_abs_difference_m']:.2f} m\n"
                     f"bias = {s['mean_signed_difference_m']:+.3f} m · RMSE = {s['rmse_m']:.3f} m", fontsize=10)
        fig.suptitle('LUNARIS Task 02 — đối chiếu cao độ Site01 / Site04 (chỉ đo, không sửa, không blend)', fontsize=12)
        fig.savefig(out / 'task02_overlap_difference.png', bbox_inches='tight')   # task02_seams.png is written by build_terrain.py
        plt.close(fig)

    # ── 7. Verdict ──────────────────────────────────────────────────────────
    acceptance = {
        'circle_centre_radius_unchanged': True,
        'site04_real_geotiff_read': site04_available,
        'ldem_80m_or_87s_used': False,
        'anchors_all_on_valid_dem': (not anchor_fail) and all(e['result'] == 'PASS' for e in anchors_out),
        'anchors_moved': False,
        'all_required_inputs_verified': not required_missing,
    }
    report['acceptance_snapshot'] = acceptance
    if anchor_fail or not site04_available:
        report['status'] = 'FAIL' if anchor_fail else 'PARTIAL_COVERAGE'
        code = 3
    elif required_missing:
        report['status'] = 'GEOSPATIAL_VERIFIED__INPUTS_INCOMPLETE'
        code = 2
    else:
        report['status'] = 'PASS'
        code = 0
    report['exit_code'] = code
    (out / 'task02_geospatial_validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f"STATUS: {report['status']} (exit {code})")
    for k, v in rasters.items():
        print(f"  {k:16s} {v['status']}")
    print(f"  LPSR 20 m        {psr_info['status']}")
    for s, e in rois.items():
        print(f"  {s}_ROIs (tuỳ chọn) {e['status']}")
    print(f"  validDEM {c['validDEM_total']['percent_of_disk']} % · NoData {c['noDataDisk']['percent_of_disk']} % của hình tròn")
    for e in anchors_out:
        print(f"  {e['id']:5s} {e['result']:13s} tile={e['source_tile']}")
    for p in problems:
        print(f"  [{p['level']}] {p['code']}: {p['detail']}")
    return code


if __name__ == '__main__':
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:  # pragma: no cover
        print(f'UNEXPECTED ERROR: {type(exc).__name__}: {exc}', file=sys.stderr)
        raise
