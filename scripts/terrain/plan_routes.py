#!/usr/bin/env python
"""LUNARIS Task 02 - A* rover routes on the native 5 m NASA slope layer.

Run after build_terrain.py (it needs public/lunar/task02/source_mask_5m.png).

Rules (nothing is forced):
  * a 5 m pixel may be entered only if it is inside the circle, has valid DEM, and its `slp` value is
    <= ROUTE_NOMINAL_SLOPE_LIMIT_DEG (15 deg: NASA VIPER nominal operating slope, docs/EVIDENCE.md G17);
  * NoData is never crossed; a diagonal step is allowed only if both pixels it squeezes between are also
    allowed (no corner cutting);
  * the search runs directly on the 5 m grid (8-connected, exact A* with an octile heuristic), so the
    result is the shortest route ON THAT GRID; it is then re-checked against the raw rasters by dense
    1 m sampling of the polyline, and again, independently, by validate_outputs.py;
  * if the anchor pixel itself is not allowed, or is not connected to the depot, the zone gets
    NO_NOMINAL_ROUTE and only the closest reachable point is reported. The anchor is never moved.

"Route found" means only: slope <= 15 deg on every pixel and no NoData. Lighting, thermal limits,
communications, rocks, wheel sinkage and the vehicle footprint are NOT assessed, so no route is SAFE_ROUTE.

Outputs: public/lunar/task02/routes.json, science_zones.json (route fields updated),
         reports/task02_astar_routes.json/.md/.png
"""
from __future__ import annotations

import datetime as dt
import heapq
import json
import math
import sys
import time
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings('ignore')
import rasterio  # noqa: E402
from PIL import Image  # noqa: E402
from scipy import ndimage  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_terrain import ROUTE_NOMINAL_SLOPE_LIMIT_DEG, SLOPE_PROVENANCE  # noqa: E402
from inspect_inputs import ANCHORS, CIRCLE_CENTER, CIRCLE_RADIUS, FRAME  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
PX = 5.0
N = 5000
ROVER_DEPOT_LOCAL = (8.6, 11.2)          # metres east / south of BASE (src/world/rover-plan.ts)
# (di, dj) with i = column (east), j = row (south). Index = move code stored in routes.json.
MOVES = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
SQRT2 = math.sqrt(2.0)


def load(repo: Path):
    raw, pub = repo.parent / 'raw_task02', repo / 'public' / 'lunar' / 'task02'
    mask = np.asarray(Image.open(pub / 'source_mask_5m.png'))            # 2 = Site01, 3 = Site04

    def composite(layer: str) -> np.ndarray:
        out = np.full((N, N), np.nan, dtype=np.float32)
        for site, code in (('Site01', 2), ('Site04', 3)):
            with rasterio.open(raw / f'{site}_final_adj_5mpp_{layer}.tif') as ds:
                arr, b = ds.read(1), ds.bounds
            c0, r0 = int(round((b.left - FRAME['x_min']) / PX)), int(round((FRAME['y_max'] - b.top) / PX))
            rs, cs, re, ce = max(0, r0), max(0, c0), min(N, r0 + arr.shape[0]), min(N, c0 + arr.shape[1])
            sel = mask[rs:re, cs:ce] == code
            out[rs:re, cs:ce][sel] = arr[rs - r0:re - r0, cs - c0:ce - c0][sel]
        return out
    return mask, composite


def astar(allowed: bytes, start: int, goal: int):
    """Exact A* on the 8-connected 5 m grid. Returns (list of move codes, expansions) or (None, expansions)."""
    gi, gj = goal % N, goal // N
    g = {start: 0.0}
    came: dict[int, int] = {}
    closed = bytearray(N * N)
    si, sj = start % N, start // N
    dx, dy = abs(si - gi), abs(sj - gj)
    heap = [((max(dx, dy) + (SQRT2 - 1) * min(dx, dy)), 0.0, start)]
    offsets = [di + dj * N for di, dj in MOVES]
    expansions = 0
    while heap:
        _f, gc, cur = heapq.heappop(heap)
        if closed[cur]:
            continue
        closed[cur] = 1
        expansions += 1
        if cur == goal:
            path = []
            while cur != start:
                move = came[cur]
                path.append(move)
                cur -= offsets[move]
            return path[::-1], expansions
        ci, cj = cur % N, cur // N
        for m in range(8):
            di, dj = MOVES[m]
            ni, nj = ci + di, cj + dj
            if ni < 0 or nj < 0 or ni >= N or nj >= N:
                continue
            nxt = cur + offsets[m]
            if not allowed[nxt] or closed[nxt]:
                continue
            if di and dj and not (allowed[cur + di] and allowed[cur + dj * N]):
                continue                                              # no corner cutting
            ng = gc + (SQRT2 if (di and dj) else 1.0)
            if ng < g.get(nxt, 1e30):
                g[nxt] = ng
                came[nxt] = m
                ddx, ddy = abs(ni - gi), abs(nj - gj)
                heapq.heappush(heap, (ng + max(ddx, ddy) + (SQRT2 - 1) * min(ddx, ddy), ng, nxt))
    return None, expansions


def main() -> int:
    repo = Path(__file__).resolve().parents[2]
    pub, rep = repo / 'public' / 'lunar' / 'task02', repo / 'reports'
    limit = ROUTE_NOMINAL_SLOPE_LIMIT_DEG
    mask, composite = load(repo)
    slp, surf, slperr = composite('slp'), composite('surf'), composite('slperr')
    xs = FRAME['x_min'] + (np.arange(N) + 0.5) * PX
    ys = FRAME['y_max'] - (np.arange(N) + 0.5) * PX
    valid = mask >= 2                                                    # in circle and has DEM
    allowed = valid & (slp <= limit)                                     # NaN compares False
    print(f'allowed pixels: {int(allowed.sum()):,} of {int(valid.sum()):,} valid ({100 * allowed.sum() / valid.sum():.2f} %)')

    base = next(a for a in ANCHORS if a['id'] == 'BASE')
    depot_xy = (base['xy'][0] + ROVER_DEPOT_LOCAL[0], base['xy'][1] - ROVER_DEPOT_LOCAL[1])
    pix = lambda x, y: (int(math.floor((FRAME['y_max'] - y) / PX)), int(math.floor((x - FRAME['x_min']) / PX)))  # noqa: E731
    sr, sc = pix(*depot_xy)
    assert allowed[sr, sc], 'the rover depot pixel must itself be within the slope threshold'
    # 4-connectivity gives the same components as 8-connectivity without corner cutting.
    labels, _ = ndimage.label(allowed)
    home = labels[sr, sc]
    reach = labels == home
    print(f'pixels reachable from the depot: {int(reach.sum()):,} ({100 * reach.sum() / valid.sum():.2f} % of valid)')
    allowed_bytes = allowed.tobytes()
    zdiff = None
    try:                                                                  # seam steps where a route changes source tile
        raw = repo.parent / 'raw_task02'
        full = {}
        for site in ('Site01', 'Site04'):
            with rasterio.open(raw / f'{site}_final_adj_5mpp_surf.tif') as ds:
                arr, b = ds.read(1), ds.bounds
            out = np.full((N, N), np.nan, dtype=np.float32)
            c0, r0 = int(round((b.left - FRAME['x_min']) / PX)), int(round((FRAME['y_max'] - b.top) / PX))
            rs, cs, re, ce = max(0, r0), max(0, c0), min(N, r0 + arr.shape[0]), min(N, c0 + arr.shape[1])
            out[rs:re, cs:ce] = arr[rs - r0:re - r0, cs - c0:ce - c0]
            full[site] = out
        zdiff = np.abs(full['Site04'].astype(np.float64) - full['Site01'].astype(np.float64))
        del full
    except Exception as exc:
        print('seam step lookup unavailable:', exc)

    results, drawn = {}, {}
    for a in [a for a in ANCHORS if a['id'] != 'BASE']:
        gr, gc = pix(*a['xy'])
        anchor_ok, connected = bool(allowed[gr, gc]), bool(reach[gr, gc])
        straight = math.hypot(a['xy'][0] - depot_xy[0], a['xy'][1] - depot_xy[1])
        entry = {'zone': a['id'], 'name': a['name'], 'anchor_xy_m': list(a['xy']), 'anchor_moved': False,
                 'anchor_pixel_slope_deg': round(float(slp[gr, gc]), 2), 'anchor_pixel_within_threshold': anchor_ok,
                 'anchor_connected_to_depot': connected, 'straight_line_from_depot_m': round(straight, 1)}
        target = (gr, gc)
        if not connected:
            # Report only: the reachable pixel closest to the anchor. The rover is not sent there as if it were the zone.
            rr, cc = np.nonzero(reach)
            d2 = (xs[cc] - a['xy'][0]) ** 2 + (ys[rr] - a['xy'][1]) ** 2
            k = int(np.argmin(d2))
            target = (int(rr[k]), int(cc[k]))
            entry['closest_reachable_xy_m'] = [float(xs[target[1]]), float(ys[target[0]])]
            entry['closest_reachable_distance_to_anchor_m'] = round(float(math.sqrt(d2[k])), 1)
            entry['no_route_reason'] = ('pixel anchor dốc hơn ngưỡng' if not anchor_ok else 'pixel anchor đạt ngưỡng nhưng bị các ô dốc hơn ngưỡng/NoData bao quanh, không nối được với căn cứ')
        t0 = time.time()
        moves, expansions = astar(allowed_bytes, sr * N + sc, target[0] * N + target[1])
        assert moves is not None
        rows, cols = [sr], [sc]
        for m in moves:
            cols.append(cols[-1] + MOVES[m][0]); rows.append(rows[-1] + MOVES[m][1])
        rows, cols = np.array(rows), np.array(cols)
        seg = np.where((np.diff(rows) != 0) & (np.diff(cols) != 0), SQRT2, 1.0) * PX
        h = surf[rows, cols].astype(np.float64)
        s_cells = slp[rows, cols].astype(np.float64)
        length2d = float(seg.sum())
        length3d = float(np.sqrt(seg ** 2 + np.diff(h) ** 2).sum())
        # ── re-check on the 5 m rasters: every pixel under a 1 m sampling of the polyline ──
        px_x, px_y = xs[cols], ys[rows]
        cum = np.concatenate([[0.0], np.cumsum(seg)])
        t = np.arange(0.0, length2d + 1e-9, 1.0)
        sx, sy = np.interp(t, cum, px_x), np.interp(t, cum, px_y)
        vr, vc = np.floor((FRAME['y_max'] - sy) / PX).astype(int), np.floor((sx - FRAME['x_min']) / PX).astype(int)
        in_disk = ((sx - CIRCLE_CENTER[0]) ** 2 + (sy - CIRCLE_CENTER[1]) ** 2) <= CIRCLE_RADIUS ** 2
        recheck = {'samples_1m': int(t.size), 'max_slope_deg': round(float(np.nanmax(slp[vr, vc])), 3),
                   'pixels_over_threshold': int((~(slp[vr, vc] <= limit)).sum()), 'pixels_nodata': int((mask[vr, vc] < 2).sum()),
                   'samples_outside_circle': int((~in_disk).sum())}
        recheck['pass'] = recheck['pixels_over_threshold'] == 0 and recheck['pixels_nodata'] == 0 and recheck['samples_outside_circle'] == 0
        src_line = mask[rows, cols]
        switch = np.flatnonzero(src_line[1:] != src_line[:-1])
        seam = [{'at_m': round(float(cum[i]), 1), 'step_m': round(float(np.nanmax([zdiff[rows[i], cols[i]], zdiff[rows[i + 1], cols[i + 1]]])), 3)} for i in switch] if zdiff is not None else None
        over_with_err = (s_cells + slperr[rows, cols]) > limit
        route_found = connected and recheck['pass']
        entry.update({
            'route_status': 'NOMINAL_SLOPE_ROUTE_FOUND' if route_found else 'NO_NOMINAL_ROUTE',
            'reaches_anchor_pixel': connected,
            'route_length_m': round(length2d, 1), 'route_length_3d_m': round(length3d, 1),
            'detour_factor_vs_straight_line': round(length2d / max(1.0, math.hypot(xs[target[1]] - depot_xy[0], ys[target[0]] - depot_xy[1])), 3),
            'pixels_on_route': int(rows.size), 'max_slope_deg': round(float(s_cells.max()), 2), 'mean_slope_deg': round(float(s_cells.mean()), 2),
            'percent_route_within_1deg_of_threshold': round(100 * float((s_cells > limit - 1).mean()), 2),
            'percent_route_where_slope_plus_slperr_exceeds_threshold': round(100 * float(over_with_err.mean()), 2),
            'max_slope_plus_slperr_deg': round(float((s_cells + slperr[rows, cols]).max()), 2),
            'height_start_m': round(float(h[0]), 2), 'height_end_m': round(float(h[-1]), 2), 'height_min_m': round(float(h.min()), 2), 'height_max_m': round(float(h.max()), 2),
            'total_ascent_m': round(float(np.clip(np.diff(h), 0, None).sum()), 1), 'total_descent_m': round(float(-np.clip(np.diff(h), None, 0).sum()), 1),
            'seam_crossings': seam, 'recheck_on_5m_rasters': recheck,
            'astar': {'grid': '5 m, 8-connected, no corner cutting', 'heuristic': 'octile (admissible)', 'expansions': expansions, 'seconds': round(time.time() - t0, 1)},
            'start_pixel_rc': [int(sr), int(sc)], 'moves': ''.join(str(m) for m in moves),
        })
        results[a['id']] = entry
        drawn[a['id']] = (px_x, px_y, connected)
        print(f"{a['id']}: {entry['route_status']} · {'tới anchor' if connected else 'KHÔNG tới anchor, gần nhất ' + str(entry['closest_reachable_distance_to_anchor_m']) + ' m'} · {length2d / 1000:.2f} km (3D {length3d / 1000:.2f}) · max {entry['max_slope_deg']}° · recheck {'PASS' if recheck['pass'] else 'FAIL'} · {expansions:,} expansions, {entry['astar']['seconds']} s")

    header = {'generated_utc': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
              'route_nominal_slope_limit_deg': limit, 'slope_limit_provenance': SLOPE_PROVENANCE,
              'slope_layer': 'slp 5 m gốc của NASA (nguồn theo source_mask_5m.png), không làm mượt, không resample',
              'method': 'A* trực tiếp trên lưới 5 m, 8 hướng, không cắt góc; chi phí = quãng đường phẳng; kiểm tra lại bằng lấy mẫu 1 m trên raster gốc',
              'criteria': f'mỗi pixel trên tuyến: trong hình tròn, có DEM, slp ≤ {limit:g}°',
              'not_assessed': ['footprint/bề rộng xe', 'chiếu sáng và năng lượng', 'nhiệt', 'liên lạc', 'đá và chướng ngại nhỏ hơn 5 m', 'độ bất định slperr (chỉ báo cáo)'],
              'safe_route_claimed': False,
              'depot_xy_m': [round(depot_xy[0], 2), round(depot_xy[1], 2)], 'grid': {'x_min': FRAME['x_min'], 'y_max': FRAME['y_max'], 'pixel_m': PX, 'size_px': N},
              'move_codes': 'chuỗi số 0–7 theo thứ tự (di, dj) = ' + str(MOVES) + '; i = cột (đông), j = hàng (nam)',
              'allowed_percent_of_valid': round(100 * float(allowed.sum()) / float(valid.sum()), 3),
              'reachable_from_depot_percent_of_valid': round(100 * float(reach.sum()) / float(valid.sum()), 3)}
    (pub / 'routes.json').write_text(json.dumps({**header, 'routes': results}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (rep / 'task02_astar_routes.json').write_text(json.dumps({**header, 'routes': {k: {kk: vv for kk, vv in v.items() if kk != 'moves'} for k, v in results.items()}}, ensure_ascii=False, indent=2), encoding='utf-8')

    # science_zones.json: replace the straight-line status with the A* result (straight-line numbers stay as history)
    zp = pub / 'science_zones.json'
    doc = json.loads(zp.read_text(encoding='utf-8'))
    for z in doc['zones']:
        r = results[z['id']]
        z['straight_line_check'] = z.get('straight_line_check') or {**z['route_check'], 'status': z['route_status'] if z['route_status'] == 'NOT_NOMINAL' else z.get('straight_line_check', {}).get('status', 'NOT_NOMINAL')}
        z['route_status'] = r['route_status']
        z['route'] = {k: r[k] for k in ('route_status', 'reaches_anchor_pixel', 'route_length_m', 'route_length_3d_m', 'max_slope_deg', 'mean_slope_deg', 'detour_factor_vs_straight_line')}
        for k in ('closest_reachable_distance_to_anchor_m', 'no_route_reason'):
            if k in r:
                z['route'][k] = r[k]
    zp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding='utf-8')

    # ── report ──────────────────────────────────────────────────────────────
    md = ['# Task 02 — tuyến rover bằng A* trên lớp độ dốc 5 m', '',
          f'Ngưỡng **{limit:g}°** = độ dốc vận hành danh định tối đa của NASA VIPER (`docs/EVIDENCE.md` G17), LUNARIS dùng làm ngưỡng quy hoạch.',
          'A* chạy trực tiếp trên lưới 5 m gốc (8 hướng, không cắt góc), chỉ đi qua pixel có DEM, trong hình tròn và `slp` ≤ ngưỡng. Mỗi tuyến được kiểm tra lại bằng cách lấy mẫu 1 m trên raster gốc.',
          '**"Có tuyến" chỉ có nghĩa: không pixel nào trên tuyến dốc hơn ngưỡng và không cắt NoData.** Chưa xét bề rộng xe, chiếu sáng, nhiệt, liên lạc, đá nhỏ hơn 5 m. Không tuyến nào được gắn `SAFE_ROUTE`.', '',
          f"- Pixel đạt ngưỡng: {header['allowed_percent_of_valid']} % số pixel có DEM trong hình tròn.",
          f"- Pixel nối được với căn cứ qua các ô đạt ngưỡng: {header['reachable_from_depot_percent_of_valid']} %.", '',
          '| Khu | Có tuyến ≤ 15° tới anchor? | Dài tuyến (km) | Dài theo địa hình 3D (km) | Đường thẳng (km) | Dốc lớn nhất trên tuyến | Dốc TB | Lên / xuống (m) | Cắt đường nối | Kiểm tra lại 5 m |',
          '|---|---|---|---|---|---|---|---|---|---|']
    for k, r in results.items():
        seam = '—' if not r['seam_crossings'] else ', '.join(f"{s['step_m']} m" for s in r['seam_crossings'])
        yes = '**Có**' if r['route_status'] == 'NOMINAL_SLOPE_ROUTE_FOUND' else f"**Không** ({r.get('no_route_reason', '')}); điểm gần nhất tới được cách anchor {r.get('closest_reachable_distance_to_anchor_m')} m"
        md.append(f"| {k} | {yes} | {r['route_length_m'] / 1000:.2f} | {r['route_length_3d_m'] / 1000:.2f} | {r['straight_line_from_depot_m'] / 1000:.2f} | {r['max_slope_deg']}° | {r['mean_slope_deg']}° | {r['total_ascent_m']:.0f} / {r['total_descent_m']:.0f} | {seam} | {'PASS' if r['recheck_on_5m_rasters']['pass'] else 'FAIL'} ({r['recheck_on_5m_rasters']['samples_1m']:,} mẫu) |")
    md += ['', 'Với khu không có tuyến, các cột độ dài và độ dốc mô tả đoạn tới **điểm gần nhất tới được**, không phải tới anchor.', '',
           '## Giới hạn', '',
           '- Tuyến là ngắn nhất **trên lưới 8 hướng** (có thể dài hơn đường ngắn nhất thật vài phần trăm) và đi sát các ô gần ngưỡng: xem cột dưới.',
           '- `slperr` (sai số độ dốc của NASA) chưa được dùng làm điều kiện; nó được báo cáo để biết tuyến sát ngưỡng tới đâu.', '',
           '| Khu | % tuyến trong khoảng 1° dưới ngưỡng | % tuyến mà slp + slperr > ngưỡng | max (slp + slperr) |', '|---|---|---|---|']
    for k, r in results.items():
        md.append(f"| {k} | {r['percent_route_within_1deg_of_threshold']} % | {r['percent_route_where_slope_plus_slperr_exceeds_threshold']} % | {r['max_slope_plus_slperr_deg']}° |")
    (rep / 'task02_astar_routes.md').write_text('\n'.join(md) + '\n', encoding='utf-8')

    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap
    from matplotlib.patches import Circle
    cls = np.zeros((N, N), dtype=np.uint8)            # 0 outside, 1 NoData, 2 over threshold, 3 allowed but cut off, 4 reachable
    cls[mask == 1] = 1
    cls[valid] = 2
    cls[allowed] = 3
    cls[reach] = 4
    fig, ax = plt.subplots(figsize=(11.5, 11), dpi=130)
    fig.patch.set_facecolor('#0b1026'); ax.set_facecolor('#090d1e')
    ax.imshow(cls[::4, ::4], cmap=ListedColormap(['#090d1e', '#141a33', '#7a3b46', '#5a5578', '#b8a0ff']), vmin=0, vmax=4,
              extent=[FRAME['x_min'] / 1000, FRAME['x_max'] / 1000, FRAME['y_min'] / 1000, FRAME['y_max'] / 1000], interpolation='nearest')
    ax.add_patch(Circle((CIRCLE_CENTER[0] / 1000, CIRCLE_CENTER[1] / 1000), CIRCLE_RADIUS / 1000, fill=False, ec='#ffffff', lw=1.4))
    colours = {'A': '#ffd75e', 'B': '#59c9ff', 'C': '#5edc88', 'D': '#ff9d8d'}
    for k, (px_x, px_y, ok) in drawn.items():
        r = results[k]
        ax.plot(px_x / 1000, px_y / 1000, color=colours[k], lw=1.8, ls='-' if ok else ':', label=f"{k}: {'có tuyến' if ok else 'KHÔNG có tuyến tới anchor'} · {r['route_length_m'] / 1000:.2f} km · dốc max {r['max_slope_deg']}°")
        ax_, ay_ = r['anchor_xy_m']
        ax.plot(ax_ / 1000, ay_ / 1000, 'o', mfc=colours[k] if ok else 'none', mec=colours[k], ms=10, mew=2)
        ax.annotate(k, (ax_ / 1000, ay_ / 1000), xytext=(7, 7), textcoords='offset points', color='#ffffff', fontsize=12, fontweight='bold')
    ax.plot(depot_xy[0] / 1000, depot_xy[1] / 1000, 's', mfc='#f2dcba', mec='#0b1026', ms=9)
    ax.annotate('BASE', (depot_xy[0] / 1000, depot_xy[1] / 1000), xytext=(7, -14), textcoords='offset points', color='#f2dcba', fontsize=10)
    ax.set_xlim(FRAME['x_min'] / 1000, FRAME['x_max'] / 1000); ax.set_ylim(FRAME['y_min'] / 1000, FRAME['y_max'] / 1000)
    ax.set_xlabel('X (km)', color='#e9edf7'); ax.set_ylabel('Y (km)', color='#e9edf7'); ax.tick_params(colors='#9ba7c0')
    ax.set_title(f'LUNARIS Task 02 — tuyến A* trên slp 5 m, chỉ qua ô ≤ {limit:g}° (ngưỡng danh định NASA VIPER), né NoData\n'
                 'tím nhạt = ô nối được với căn cứ · xám tím = ô đạt ngưỡng nhưng bị cô lập · đỏ sẫm = dốc hơn ngưỡng · tối = NoData', color='#f2dcba', fontsize=11)
    leg = ax.legend(loc='lower left', fontsize=9, facecolor='#10182d', edgecolor='#3a4160')
    for txt in leg.get_texts():
        txt.set_color('#e9edf7')
    ax.set_aspect('equal')
    fig.savefig(rep / 'task02_astar_routes.png', bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close(fig)
    return 0


if __name__ == '__main__':
    sys.exit(main())
