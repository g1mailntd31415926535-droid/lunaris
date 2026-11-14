"""Non-destructive presence check for LUNARIS evidence assets.
Run from any cwd: python scripts/evidence/check_evidence.py
Only checks local file presence/non-empty, NOT scientific correctness.
"""
from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parents[2]
EVID = ROOT / "docs/EVIDENCE.md"
ASSETS = ROOT / "docs/evidence"
REQUIRED_EXISTING = [
    "site01_lola_psr_hillshade_illustrative.png",
    # Task 02 artifacts copied from reports/ (2026-11-14); see docs/evidence/README.md
    "task02_coverage.png", "task02_seams.png", "task02_overlap_difference.png", "task02_route_slope.png",
    "task02_lod_error.csv", "task02_geospatial_validation.json", "task02_validate_outputs.json",
    "task02_before_base_ui.png", "task02_after_base_ui.png", "task02_before_region_world.png", "task02_after_region_world.png",
    "task02_astar_routes.png", "task02_astar_routes.json",
    "task02_performance.md", "task02_perf_views.json",
]
PENDING = []

if not EVID.is_file():
    raise SystemExit("FAIL: missing docs/EVIDENCE.md")
missing = []
for name in REQUIRED_EXISTING:
    p = ASSETS / name
    if not p.is_file() or p.stat().st_size == 0:
        print(f"FAIL: missing or empty: {p.relative_to(ROOT)}")
        missing.append(name)
    else:
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        print(f"FOUND {name} bytes={p.stat().st_size} sha256={digest}")
for name in PENDING:
    p = ASSETS / name
    if p.is_file() and p.stat().st_size:
        print(f"FOUND {name} bytes={p.stat().st_size}")
    else:
        print(f"PENDING {name}: not yet available; DO NOT CLAIM GIS EVIDENCE COMPLETE")
print(f"Evidence ledger: {EVID}")
if missing:
    raise SystemExit(1)
print("CHECK OK for currently available baseline assets. Not a GIS/science PASS.")
