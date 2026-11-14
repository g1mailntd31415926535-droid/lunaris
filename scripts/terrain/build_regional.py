#!/usr/bin/env python
"""LUNARIS - NASA LOLA terrain AROUND the 5 m sites (regional + global), for a seamless Moon.

The 5 m Site01/Site04 product (public/lunar/task02, built by build_terrain.py) is NOT read, rewritten or
re-encoded here. This script only adds lower-resolution NASA LOLA grids for the area around it:

  g0  40 m   48 x 48 km around the 5 m circle   <- LDEM_80S_40MPP_ADJ.TIF   (PGDA, Barker et al. 2023)
  g1  160 m  160 x 160 km around BASE            <- LDEM_80S_80MPP_ADJ.TIF   (2 x 2 mean of 80 m bins)
  g2  480 m  640 x 640 km around the south pole  <- LDEM_60S_240MPP_ADJ.TIF  (2 x 2 mean of 240 m bins)
  global     LDEM_4 (4 px/deg) simple cylindrical <- PDS LRO-L-LOLA-4-GDR-V1.0
  albedo     LROC WAC colour mosaic 2k (NASA SVS CGI Moon Kit, poles filled with LOLA albedo)

All polar grids use the same south polar stereographic plane and the same 1737.4 km sphere as the 5 m sites
(checked below), so they are the same geographic positions, not grids glued together by pixel index.
Heights are metres relative to the 1737.4 km sphere; only block means are used (no smoothing, no filling,
no vertical scale). NaN stays NoData.

Only the needed windows of the large polar GeoTIFFs are read (HTTP range requests on their 512 px tiles);
they are cached under raw_regional/ next to raw_task02/ (outside public/, not bundled).
"""
from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import json
import math
import urllib.request
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings('ignore')
import rasterio  # noqa: E402
import rasterio.windows  # noqa: E402
from PIL import Image  # noqa: E402
from scipy import ndimage  # noqa: E402

UI = Path(__file__).resolve().parents[2]
RAW = UI.parent / 'raw_regional'
RAW_SITES = UI.parent / 'raw_task02'
OUT = UI / 'public' / 'lunar' / 'regional'
REPORT = UI / 'reports' / 'regional_terrain_validation.json'
PGDA = 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/'
PDS_LDEM4 = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_4'
SVS_ALBEDO = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_2k.tif'

CIRCLE_CENTER = (-8500.0, -10500.0)
BASE_XY = (-11000.0, -12000.0)
NODATA = -32768

GRIDS = [
    # name, source file, source pixel m, block, centre XY, half size m, int16 step m
    ('g0', 'LDEM_80S_40MPP_ADJ.TIF', 40.0, 1, CIRCLE_CENTER, 24_000.0, 0.25),
    ('g1', 'LDEM_80S_80MPP_ADJ.TIF', 80.0, 2, BASE_XY, 80_000.0, 0.25),
    ('g2', 'LDEM_60S_240MPP_ADJ.TIF', 240.0, 2, (0.0, 0.0), 320_000.0, 0.5),
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download(url: str, target: Path) -> Path:
    if not target.exists():
        print('download', url)
        with urllib.request.urlopen(url, timeout=300) as r:
            target.write_bytes(r.read())
    return target


def read_window(name: str, pixel: float, centre: tuple[float, float], half: float, block: int) -> tuple[Path, dict]:
    """Reads (once) the aligned window of a remote PGDA GeoTIFF and caches it as a local GeoTIFF."""
    cache = RAW / f'{Path(name).stem}_window_{int(centre[0])}_{int(centre[1])}_{int(half)}.tif'
    url = '/vsicurl/' + PGDA + name
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.TIF'):
        with rasterio.open(url) as src:
            left, top = src.bounds.left, src.bounds.top
            col0 = math.floor((centre[0] - half - left) / pixel)
            row0 = math.floor((top - (centre[1] + half)) / pixel)
            size = math.ceil(2 * half / pixel / block) * block
            window = rasterio.windows.Window(col0, row0, size, size)
            info = {'url': PGDA + name, 'crs_wkt': src.crs.to_wkt(), 'source_size_px': [src.width, src.height],
                    'source_pixel_m': pixel, 'window_col_row': [col0, row0], 'window_px': size,
                    'tags': {k: v for k, v in src.tags().items() if k.startswith(('z#', 'NC_GLOBAL#history'))}}
            if not cache.exists():
                print('read window', name, window)
                data = src.read(1, window=window)
                profile = src.profile | {'width': size, 'height': size, 'transform': src.window_transform(window), 'driver': 'GTiff', 'compress': 'deflate', 'tiled': True}
                with rasterio.open(cache, 'w', **profile) as dst:
                    dst.write(data, 1)
    return cache, info


def block_mean(a: np.ndarray, k: int) -> np.ndarray:
    if k == 1:
        return a
    h, w = a.shape
    v = a.reshape(h // k, k, w // k, k)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        return np.nanmean(v, axis=(1, 3))


def encode(heights: np.ndarray, step: float) -> bytes:
    q = np.where(np.isfinite(heights), np.clip(np.round(heights / step), -32767, 32767), NODATA).astype('<i2')
    return gzip.compress(q.tobytes(), 9, mtime=0)


def main() -> None:
    RAW.mkdir(exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    manifest: dict = {
        'format': 'lunaris-regional', 'version': 1,
        'generated_utc': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'provenance': 'MEASURED - NASA LOLA (PGDA south pole DEMs, Barker et al. 2023, doi:10.3847/PSJ/acf3e1, data doi:10.60903/gsfcpgda-lola-spole; '
                      'PDS LRO-L-LOLA-4-GDR-V1.0 LDEM_4). Block means only; no smoothing, no filling, no procedural relief.',
        'crs': 'Polar Stereographic (south), lat_0 = -90, lon_0 = 0, sphere 1737400 m (same as the 5 m Site01/Site04 product)',
        'height': 'm relative to the 1737.4 km sphere; int16 value * step_m; -32768 = NoData',
        'registration': 'vertex (i, j) = pixel centre: X = x0 + i * spacing_m, Y = y0 - j * spacing_m',
        'grids': {}, 'checks': {},
    }
    site_crs = None
    with rasterio.open(RAW_SITES / 'Site01_final_adj_5mpp_surf.tif') as s:
        site_crs = s.crs

    grids: dict[str, dict] = {}
    for name, file, pixel, block, centre, half, step in GRIDS:
        path, info = read_window(file, pixel, centre, half, block)
        with rasterio.open(path) as src:
            raw = src.read(1).astype('f8')
            if src.nodata is not None and not math.isnan(src.nodata):
                raw[raw == src.nodata] = np.nan
            same_crs = src.crs == site_crs or src.crs.to_proj4() == site_crs.to_proj4()
            t = src.transform
        heights = block_mean(raw, block)
        spacing = pixel * block
        x0 = t.c + spacing / 2
        y0 = t.f - spacing / 2
        data = encode(heights, step)
        out = OUT / f'{name}_{int(spacing)}m.i16.gz'
        out.write_bytes(data)
        nan = int(np.isnan(heights).sum())
        grids[name] = {'h': heights, 'x0': x0, 'y0': y0, 'spacing': spacing}
        manifest['grids'][name] = {
            'file': out.name, 'bytes': len(data), 'sha256': sha256(data), 'cols': heights.shape[1], 'rows': heights.shape[0],
            'x0': x0, 'y0': y0, 'spacing_m': spacing, 'step_m': step,
            'min_m': float(np.nanmin(heights)), 'max_m': float(np.nanmax(heights)), 'nodata_px': nan,
            'source': info['url'], 'source_pixel_m': pixel, 'resample': 'none' if block == 1 else f'{block} x {block} mean of source bins',
            'source_window_col_row_px': info['window_col_row'] + [info['window_px']], 'same_crs_as_5m_sites': bool(same_crs),
            'label': 'MEASURED (NASA LOLA)',
        }
        print(name, heights.shape, 'spacing', spacing, 'nan', nan, 'range', np.nanmin(heights), np.nanmax(heights), 'crs ok', same_crs)

    # Global LOLA LDEM_4 (PDS): int16 DN, height = DN * 0.5 m above 1737.4 km, 1440 x 720, line 0 = 89.875 N, sample 0 = 0.125 E.
    lbl = download(PDS_LDEM4 + '.lbl', RAW / 'ldem_4.lbl')
    img = download(PDS_LDEM4 + '.img', RAW / 'ldem_4.img')
    dn = np.frombuffer(img.read_bytes(), '<i2').reshape(720, 1440)
    data = gzip.compress(dn.astype('<i2').tobytes(), 9, mtime=0)
    (OUT / 'ldem_4.i16.gz').write_bytes(data)
    manifest['global'] = {
        'file': 'ldem_4.i16.gz', 'bytes': len(data), 'sha256': sha256(data), 'cols': 1440, 'rows': 720, 'step_m': 0.5,
        'layout': 'simple cylindrical, row 0 centre = 89.875 N, col 0 centre = 0.125 E, 0.25 deg pixels',
        'min_m': float(dn.min()) * 0.5, 'max_m': float(dn.max()) * 0.5,
        'source': PDS_LDEM4 + '.img', 'label_sha256': sha256(lbl.read_bytes()), 'label': 'MEASURED (NASA LOLA LDEM_4)',
    }

    # Albedo for the far-view globe: LROC WAC colour mosaic (presentation imagery; never used as a measurement).
    tif = download(SVS_ALBEDO, RAW / 'lroc_color_poles_2k.tif')
    image = Image.open(tif).convert('RGB')
    jpg = OUT / 'moon_albedo_lroc_2k.jpg'
    image.save(jpg, quality=88, optimize=True)
    rgb = np.asarray(image).astype('f8') / 255
    lat = 90 - (np.arange(rgb.shape[0]) + 0.5) * 180 / rgb.shape[0]
    polar = rgb[(lat < -75) & (lat > -80)]
    manifest['albedo'] = {
        'file': jpg.name, 'bytes': jpg.stat().st_size, 'size_px': list(image.size), 'source': SVS_ALBEDO,
        'credit': "NASA's Scientific Visualization Studio (CGI Moon Kit); LROC WAC mosaic (NASA/GSFC/Arizona State University), poles filled with LOLA albedo",
        'mean_srgb_75S_80S': [round(float(c), 4) for c in polar.reshape(-1, 3).mean(0)],
        'label': 'IMAGERY (presentation, not a measurement)',
    }

    # Distance from each g0 vertex to the nearest place WITHOUT 5 m data (read-only use of source_mask_5m.png).
    # The renderer lowers the 40 m surface only well inside the 5 m data, where the 5 m mesh always covers it.
    mask = np.asarray(Image.open(UI / 'public' / 'lunar' / 'task02' / 'source_mask_5m.png'))
    has5 = (mask == 2) | (mask == 3)
    dist_m = ndimage.distance_transform_edt(has5) * 5.0
    g0 = grids['g0']
    rows, cols = g0['h'].shape
    X = g0['x0'] + np.arange(cols) * g0['spacing']
    Y = g0['y0'] - np.arange(rows) * g0['spacing']
    ci = np.floor((X + 21000) / 5).astype(int)
    rj = np.floor((2000 - Y) / 5).astype(int)
    inside = (ci[None, :] >= 0) & (ci[None, :] < 5000) & (rj[:, None] >= 0) & (rj[:, None] < 5000)
    d = np.zeros((rows, cols))
    d[inside] = dist_m[np.clip(rj, 0, 4999)[:, None].repeat(cols, 1)[inside], np.clip(ci, 0, 4999)[None, :].repeat(rows, 0)[inside]]
    q = np.clip(np.round(d / 10), 0, 255).astype('u1')
    data = gzip.compress(q.tobytes(), 9, mtime=0)
    (OUT / 'g0_5m_coverage_distance.u8.gz').write_bytes(data)
    manifest['grids']['g0']['coverage_distance'] = {'file': 'g0_5m_coverage_distance.u8.gz', 'unit': '10 m', 'cap_m': 2550,
                                                    'meaning': 'distance from the g0 vertex to the nearest 5 m pixel without Site01/Site04 data (0 = no 5 m data here)'}

    # Check: same place, same datum. Mean of the merged 5 m DEM in each fully covered 40 m cell vs. the 40 m LOLA bin.
    # Each site raster is placed on the 5 m grid of source_mask_5m.png (x_min -21000, y_max 2000) by its own transform.
    def on_grid(path: Path) -> np.ndarray:
        grid = np.full((5000, 5000), np.nan)
        with rasterio.open(path) as r:
            band = r.read(1, masked=True).filled(np.nan).astype('f8')
            c0, r0 = int(round((r.transform.c + 21000) / 5)), int(round((2000 - r.transform.f) / 5))
        cs, rs = max(0, c0), max(0, r0)
        ce, re_ = min(5000, c0 + band.shape[1]), min(5000, r0 + band.shape[0])
        grid[rs:re_, cs:ce] = band[rs - r0:re_ - r0, cs - c0:ce - c0]
        return grid
    s1 = on_grid(RAW_SITES / 'Site01_final_adj_5mpp_surf.tif')
    s4 = on_grid(RAW_SITES / 'Site04_final_adj_5mpp_surf.tif')
    merged = np.where(mask == 3, s4, np.where(mask == 2, s1, np.nan))
    off_c = int(round((-21000 - (g0['x0'] - 20)) / 40))
    off_r = int(round(((g0['y0'] + 20) - 2000) / 40))
    blocks = merged.reshape(625, 8, 625, 8)
    full = np.isfinite(blocks).all(axis=(1, 3))
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        mean5 = np.nanmean(blocks, axis=(1, 3))
    lola = g0['h'][off_r:off_r + 625, off_c:off_c + 625]
    diff = (mean5 - lola)[full & np.isfinite(lola)]
    manifest['checks']['g0_vs_5m_sites'] = {
        'cells_compared': int(diff.size), 'cell_m': 40,
        'mean_m': float(diff.mean()), 'median_m': float(np.median(diff)), 'rms_m': float(np.sqrt((diff ** 2).mean())),
        'p95_abs_m': float(np.percentile(np.abs(diff), 95)), 'p99_abs_m': float(np.percentile(np.abs(diff), 99)), 'max_abs_m': float(np.abs(diff).max()),
        'grid_alignment_px': [off_c, off_r],
        'meaning': 'mean of the 64 merged 5 m pixels in each 40 m cell minus the LOLA 40 m bin; small values = same positions and datum',
    }
    for coarse, fine in (('g1', 'g0'), ('g2', 'g1')):
        c, f = grids[coarse], grids[fine]
        cols_f = f['x0'] + np.arange(f['h'].shape[1]) * f['spacing']
        rows_f = f['y0'] - np.arange(f['h'].shape[0]) * f['spacing']
        ii = np.round((cols_f - c['x0']) / c['spacing']).astype(int)
        jj = np.round((c['y0'] - rows_f) / c['spacing']).astype(int)
        sample = c['h'][np.clip(jj, 0, c['h'].shape[0] - 1)][:, np.clip(ii, 0, c['h'].shape[1] - 1)]
        dd = (f['h'] - sample)[np.isfinite(f['h']) & np.isfinite(sample)]
        manifest['checks'][f'{fine}_vs_{coarse}_nearest'] = {'mean_m': float(dd.mean()), 'rms_m': float(np.sqrt((dd ** 2).mean())), 'p99_abs_m': float(np.percentile(np.abs(dd), 99))}
    print(json.dumps(manifest['checks'], indent=1))

    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding='utf-8')
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding='utf-8')
    total = sum(p.stat().st_size for p in OUT.iterdir())
    print('wrote', OUT, f'{total / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
