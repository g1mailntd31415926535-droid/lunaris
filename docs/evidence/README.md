# LUNARIS — evidence assets

Lưu các ảnh **thật, có nguồn và có thể kiểm toán**. Không tạo placeholder PNG để đánh dấu PASS.

| Tệp | Tình trạng | Cách tạo/nguồn | Giới hạn |
|---|---|---|---|
| `site01_lola_psr_hillshade_illustrative.png` | **ĐÃ CÓ** | File Site01 LOLA/PSR user đã cung cấp; sao chép nguyên bản, không chỉnh sửa | Hillshade minh họa, không phải bóng nắng giờ thực, không chứng minh băng |
| `task02_coverage.png` | **ĐÃ CÓ** | Sao chép nguyên bản từ `reports/task02_coverage.png` (`scripts/terrain/inspect_inputs.py`). SHA-256 `ee2ef728e4d55ccd090ff95f0800305e4801b0af641dc199ed48f54face59e8e` | Có legend valid/NoData với km² và %, vòng tròn, khung, 5 anchor; tọa độ theo CRS của GeoTIFF. Diện tích trên mặt phẳng chiếu |
| `task02_seams.png` | **ĐÃ CÓ** | Sao chép từ `reports/task02_seams.png` (`scripts/terrain/build_terrain.py`). SHA-256 `cc3d365c3d8630b268387b9a51bcb1e7b89fc435af1f17cace2eff5f5869e224` | Trái: `z04 − z01` có dấu, cắt ở ±1,3 m, đường đen = đường nối sau ghép. Phải: histogram bậc tuyệt đối tại đường nối (3.400 cặp pixel; max 3,14 m; TB 0,226 m; p95 0,734 m). Số đầy đủ: `task02_seam_after_merge.json` |
| `task02_before_*.png` / `task02_after_*.png` | **ĐÃ CÓ** (4 góc × 2 bản `_ui`/`_world` mỗi bên) | `node scripts/capture_views.mjs before` / `after`; thông số camera, viewport 1366×768, DPR 1, FOV 40°, commit trong `task02_before_views.json` / `task02_after_views.json` | Ảnh game, không phải ảnh địa hình do NASA đo. BEFORE = địa hình công thức cũ (commit `f0af09f`) |
| `task02_overlap_difference.png` | **ĐÃ CÓ** | `inspect_inputs.py`. SHA-256 `fe73f7decf3aaf59297a27df24d453b3813ba5885108c8e1bc4ff702875e108e` | Chênh cao toàn vùng chồng lấn trước khi ghép (n = 2.640.000; mean-abs 0,223 m; có dấu −0,024 m) |
| `task02_route_slope.png`, `.md`, `.json` | **ĐÃ CÓ** | `build_terrain.py`. SHA-256 ảnh `8384b1269f87d885768e200b110e6c83d9536a2d3c75a92c969a2f2d630bebdb` | Độ dốc `slp` 5 m dọc **đường thẳng** BASE→A/B/C/D so với ngưỡng danh định 15° của NASA VIPER (G17). Không phải tuyến đã thiết kế; chưa có tuyến A* |
| `task02_lod_error.csv`, `.md` | **ĐÃ CÓ** | `build_terrain.py`. SHA-256 csv `03ef725dfaae832b81ddf2899b2f67ae657fbb1b994c608b281e33d90e579310` | Sai lệch do thưa lưới so với mọi pixel 5 m, không phải sai số đo LOLA |
| `task02_geospatial_validation.json`, `task02_validate_outputs.json`, `task02_seam_after_merge.json`, `task02_psr_check.json` | **ĐÃ CÓ** | `inspect_inputs.py`, `validate_outputs.py`, `build_terrain.py` | Số liệu gốc cho các hàng G02–G13 trong `EVIDENCE.md` |

Sau mỗi bước: cập nhật `docs/EVIDENCE.md` và nhật ký, ghi commit, nguồn/phiên bản/hash ảnh, không chờ đến cuối. File TIFF, ZIP thô dung lượng lớn không nên đưa vào git.

SHA256 ảnh Site01 đã lưu: `86f8aae1e0cf9ba56ef09cef62167a935efd93ab26658dd39467685f65688e0d` (kiểm lại sau khi copy vào repo).
