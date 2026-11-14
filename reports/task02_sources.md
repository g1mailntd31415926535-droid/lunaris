# Task 02 — sổ nguồn dữ liệu

Ngày truy cập và kiểm tra: 14/11/2026. Mã băm SHA-256 của từng tệp đầu vào nằm trong `reports/task02_geospatial_validation.json` (`inputs.rasters.*.sha256`) và `public/lunar/task02/metadata.json` (`sources`).

## Dữ liệu đã dùng

| Dữ liệu | Tệp | Nguồn | Đơn vị | Độ phân giải | Nhãn | Dùng vào việc gì |
|---|---|---|---|---|---|---|
| Cao độ LOLA Site01 (Connecting Ridge) | `Site01_final_adj_5mpp_surf.tif` | NASA PGDA, https://pgda.gsfc.nasa.gov/products/78 | m, so với mặt cầu 1737,4 km (theo mô tả PGDA; header không ghi đơn vị) | 5 m | MEASURED | Địa hình trong game |
| Cao độ LOLA Site04 (Shackleton Rim) | `Site04_final_adj_5mpp_surf.tif` | như trên | như trên | 5 m | MEASURED | Địa hình trong game |
| Sai số cao độ | `Site0x_…_toterr.tif` | như trên | m | 5 m | MEASURED (ước lượng sai số của NASA) | Chọn nguồn ở vùng chồng lấn |
| Độ dốc | `Site0x_…_slp.tif` | như trên | độ | 5 m | MEASURED | Kiểm tra độ dốc dọc đường thẳng tới A–D |
| Sai số độ dốc | `Site0x_…_slperr.tif` | như trên | độ | 5 m | MEASURED | Ghi kèm trong báo cáo tuyến |
| Lớp `ldec` | `Site0x_…_ldec.tif` | như trên | theo README PGDA | 5 m | — | Chỉ kiểm tra đọc được; chưa diễn giải, chưa dùng |
| Bản đồ PSR đầy đủ | `LPSR_80S_20MPP_ADJ.TIF` | NASA PGDA, https://pgda.gsfc.nasa.gov/products/90 | 0/1 | 20 m | MEASURED | Xác nhận A, B nằm trong pixel PSR (`reports/task02_psr_check.json`) |

Hệ tọa độ của mọi tệp trên được đọc từ header: Polar Stereographic cực Nam, tâm −90°, kinh tuyến gốc 0°, mặt cầu bán kính 1.737.400 m, đơn vị mét, không có mã EPSG.

## Dữ liệu KHÔNG dùng

| Dữ liệu | Trạng thái |
|---|---|
| `LDEM_80S_80MPP_ADJ.TIF`, bản ghép 87S | Không tải, không dùng. Không có gì được lấp vào NoData. |
| `Site01_ROIs.tgz`, `Site04_ROIs.tgz` | Không bắt buộc cho việc dựng địa hình; chưa tải. Chỉ cần nếu muốn đối chiếu các khu NASA đã chú thích. |
| Diviner (nhiệt độ), M3, LAMP | Chưa có raster địa tham chiếu đã kiểm chứng. UI ghi "CHƯA CÓ LỚP DỮ LIỆU ĐỊA THAM CHIẾU"; không có số nhiệt độ hay phổ nào tại A–D. |
| Hydro Lunar Prospector 0,5° | Có trong thư mục dữ liệu nhưng chưa dùng; không được đổi thành xác suất băng. |
| LCROSS (Cabeus) | REFERENCE_ONLY, nằm ngoài bản đồ; không có marker. https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20140005563.pdf |
| NAIF/SPICE | Chưa dùng; ánh sáng là mỹ thuật (xem `task02_sunlight.md`). https://naif.jpl.nasa.gov/naif/ |

## Bốn điểm khoa học và căn cứ

| Điểm | Tọa độ XY (m) | Nguồn vị trí | Nhãn vị trí | Trong pixel PSR 20 m? | Trạng thái băng |
|---|---|---|---|---|---|
| A — PSR #1470 | −16970, −8485 | PSR do NASA lập bản đồ | MEASURED | Có (giá trị 1) | CANDIDATE_UNVERIFIED · chờ rover xác minh |
| B — PSR #921 | −4240, −12345 | PSR do NASA lập bản đồ | MEASURED | Có (giá trị 1) | CANDIDATE_UNVERIFIED · chờ rover xác minh |
| C — Connecting Ridge C1 | −12467, −13001 | Sathyan et al. (2024), https://www.sciencedirect.com/science/article/pii/S0019103524000460 | PUBLISHED_REFERENCE (tọa độ gần đúng) | Không (giá trị 0) | CANDIDATE_UNVERIFIED · chờ rover xác minh |
| D — Shackleton Rim S | −2606, −6502 | Sathyan et al. (2024) | PUBLISHED_REFERENCE (tọa độ gần đúng) | Không (giá trị 0) | CANDIDATE_UNVERIFIED · chờ rover xác minh |
| BASE | −11000, −12000 | Vị trí dự kiến trong game | SCENARIO | Không | — |

PSR, nhiệt độ thấp, hydro hay phản xạ cao **không** tương đương xác nhận có băng. Tài liệu đối chiếu: Li et al. (2018) về M3, https://pmc.ncbi.nlm.nih.gov/articles/PMC6130389/ ; diễn giải phản xạ Shackleton (2025), https://www.janss.kr/archive/view_article?pid=jass-42-4-85 . Chưa có raster M3 hay Diviner nào được gán cho A–D.

## Giá trị suy ra (DERIVED)

| Giá trị | Cách tính | Tệp |
|---|---|---|
| Vùng phủ, tỷ lệ NoData 24,72 % | Đếm tâm pixel 5 m trong hình tròn | `task02_geospatial_validation.json`, `task02_coverage.png` |
| Chênh cao Site04 − Site01, bậc tại đường nối (max 3,14 m) | Trừ trực tiếp hai raster tại cùng pixel | `task02_seam_after_merge.json`, `task02_seams.png` |
| Sai số LOD | So lưới tam giác từng cấp với mọi pixel 5 m | `task02_lod_error.csv`, `task02_lod_error.md` |
| Vĩ độ/kinh độ của A–D, BASE | Từ CRS của GeoTIFF (pyproj), đối chiếu công thức đóng | `task02_geospatial_validation.json` |
| Mặt phẳng đặt căn cứ (dốc 4,04°) | Bình phương tối thiểu trên DEM 5 m trong bán kính 14 m quanh BASE | `src/world/dem.ts` |

## Giả định và ngưỡng thiết kế của LUNARIS

| Giả định | Giá trị | Nơi khai báo |
|---|---|---|
| Ngưỡng dốc quy hoạch tuyến | 15° — `MEASURED` cho NASA VIPER (độ dốc vận hành danh định tối đa, `docs/EVIDENCE.md` G17 [S10]) + `SCENARIO` khi áp cho rover LUNARIS; vượt ngưỡng = `NOT_NOMINAL` | `ROUTE_NOMINAL_SLOPE_LIMIT_DEG` trong `scripts/terrain/build_terrain.py` |
| Tốc độ hoạt ảnh rover | 0,7 m/s — chỉ để chạy hoạt ảnh; tốc độ rover LUNARIS vẫn `UNSET` (`docs/EVIDENCE.md` G18), không dùng để tính thời gian di chuyển | `ROVER_CRUISE_SPEED` trong `src/world/rover-plan.ts` |
| MILO quay lại trước đoạn dốc đầu tiên 15 m | 15 m | `STOP_BEFORE_STEEP_M` trong `src/world/rover-plan.ts` |
| Vị trí căn cứ | (−11000, −12000) | Đặc tả Task 02; chưa thẩm định chiếu sáng, liên lạc, đường đi |
| Đá quanh căn cứ, công trình, phi hành gia | Minh họa tái dựng | `src/world/Terrain.tsx`, `rock-plan.ts` |
| Hướng và màu ánh sáng | Mỹ thuật | `src/world/World.tsx › SolarLighting` |
| Quả cầu Mặt Trăng ở góc nhìn quỹ đạo | Địa hình hư cấu, chỉ hiện khi nhìn xa | `src/world/planet-fields.ts` |
| Điện, nước, oxy | Số cân bằng của trò chơi | `src/game/balance.ts` |

## Tái tạo

```powershell
..\.venv_task02\Scripts\python.exe scripts\terrain\inspect_inputs.py     # kiểm tra đầu vào
..\.venv_task02\Scripts\python.exe scripts\terrain\build_terrain.py      # dựng public/lunar/task02 + báo cáo
..\.venv_task02\Scripts\python.exe scripts\terrain\validate_outputs.py   # đối chiếu ngược với raster gốc
```

Thư viện: Python 3.12, rasterio 1.4.3 (GDAL 3.9.3), numpy, pyproj, matplotlib (`scripts/terrain/requirements.txt`). Tệp GeoTIFF gốc nằm ở `C:\Tung Duong\NASA\raw_task02`, ngoài `public/`, không vào bundle.
