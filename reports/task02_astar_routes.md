# Task 02 — tuyến rover bằng A* trên lớp độ dốc 5 m

Ngưỡng **15°** = độ dốc vận hành danh định tối đa của NASA VIPER (`docs/EVIDENCE.md` G17), LUNARIS dùng làm ngưỡng quy hoạch.
A* chạy trực tiếp trên lưới 5 m gốc (8 hướng, không cắt góc), chỉ đi qua pixel có DEM, trong hình tròn và `slp` ≤ ngưỡng. Mỗi tuyến được kiểm tra lại bằng cách lấy mẫu 1 m trên raster gốc.
**"Có tuyến" chỉ có nghĩa: không pixel nào trên tuyến dốc hơn ngưỡng và không cắt NoData.** Chưa xét bề rộng xe, chiếu sáng, nhiệt, liên lạc, đá nhỏ hơn 5 m. Không tuyến nào được gắn `SAFE_ROUTE`.

- Pixel đạt ngưỡng: 54.687 % số pixel có DEM trong hình tròn.
- Pixel nối được với căn cứ qua các ô đạt ngưỡng: 49.976 %.

| Khu | Có tuyến ≤ 15° tới anchor? | Dài tuyến (km) | Dài theo địa hình 3D (km) | Đường thẳng (km) | Dốc lớn nhất trên tuyến | Dốc TB | Lên / xuống (m) | Cắt đường nối | Kiểm tra lại 5 m |
|---|---|---|---|---|---|---|---|---|---|
| A | **Có** | 19.30 | 19.44 | 6.94 | 14.99° | 9.87° | 624 / 1271 | 0.231 m, 0.05 m | PASS (19,297 mẫu) |
| B | **Có** | 7.42 | 7.50 | 6.76 | 14.99° | 8.87° | 46 / 832 | 0.187 m | PASS (7,426 mẫu) |
| C | **Có** | 1.89 | 1.89 | 1.78 | 14.28° | 5.18° | 25 / 99 | — | PASS (1,886 mẫu) |
| D | **Không** (pixel anchor dốc hơn ngưỡng); điểm gần nhất tới được cách anchor 4.7 m | 11.64 | 11.73 | 10.03 | 14.99° | 10.28° | 484 / 726 | 0.259 m | PASS (11,645 mẫu) |

Với khu không có tuyến, các cột độ dài và độ dốc mô tả đoạn tới **điểm gần nhất tới được**, không phải tới anchor.

## Giới hạn

- Tuyến là ngắn nhất **trên lưới 8 hướng** (có thể dài hơn đường ngắn nhất thật vài phần trăm) và đi sát các ô gần ngưỡng: xem cột dưới.
- `slperr` (sai số độ dốc của NASA) chưa được dùng làm điều kiện; nó được báo cáo để biết tuyến sát ngưỡng tới đâu.

| Khu | % tuyến trong khoảng 1° dưới ngưỡng | % tuyến mà slp + slperr > ngưỡng | max (slp + slperr) |
|---|---|---|---|
| A | 6.15 % | 13.36 % | 19.22° |
| B | 5.75 % | 10.98 % | 18.67° |
| C | 0.68 % | 1.35 % | 16.96° |
| D | 9.61 % | 18.32 % | 20.01° |
