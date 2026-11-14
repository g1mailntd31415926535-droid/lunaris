# Task 02 — sai số cao độ theo cấp LOD

Sai số ở đây là **sai lệch do giảm mật độ lưới và lượng tử hóa** so với DEM LOLA 5 m đã ghép. Nó **không phải** sai số đo của LOLA (`toterr`, `slperr` là đại lượng khác).

- **Miền đo:** mọi pixel 5 m hợp lệ trong hình tròn nằm dưới một ô lưới hợp lệ của cấp đó (không chỉ tại đỉnh lưới).
- **Bề mặt so sánh:** hai tam giác mỗi ô, chia theo đường chéo (i,j)→(i+1,j+1), đúng như game dựng; đỉnh lấy giá trị đã giải lượng tử.
- **LOD:** lấy mẫu thưa chính DEM 5 m (mỗi 2^k pixel), không làm mượt, không dùng LDEM 80 m.
- **Chỉ L0 mới là lưới 5 m.** Các cấp khác thưa hơn và không được gọi là "chính xác 5 m".

| LOD | Bước lưới | Số pixel 5 m đo | mean \|Δz\| (m) | p95 (m) | p99 (m) | RMSE (m) | max \|Δz\| (m) | Bước lượng tử (m) | Sai số lượng tử max (m) | Pixel hợp lệ không dựng lưới |
|---|---|---|---|---|---|---|---|---|---|---|
| L0 | 5 m | 14,775,901 | 0.0050 | 0.0095 | 0.0099 | 0.0058 | 0.010 | 0.02 | 0.0100 | 0.0342 % |
| L1 | 10 m | 14,770,767 | 0.0661 | 0.2704 | 0.6198 | 0.1481 | 16.092 | 0.04 | 0.0200 | 0.069 % |
| L2 | 20 m | 14,760,355 | 0.1775 | 0.5987 | 1.0969 | 0.2967 | 21.253 | 0.06 | 0.0300 | 0.1394 % |
| L3 | 40 m | 14,739,110 | 0.3819 | 1.1420 | 1.8845 | 0.5607 | 22.003 | 0.06 | 0.0300 | 0.2831 % |
| L4 | 80 m | 14,700,615 | 0.7871 | 2.2854 | 3.8596 | 1.1353 | 25.708 | 0.06 | 0.0300 | 0.5436 % |
| L5 | 160 m | 14,608,307 | 1.6003 | 4.8213 | 8.7735 | 2.4000 | 32.351 | 0.07 | 0.0350 | 1.1681 % |
| L6 | 320 m | 14,366,297 | 3.4143 | 10.4585 | 20.0889 | 5.2888 | 68.315 | 0.07 | 0.0350 | 2.8054 % |

"Pixel hợp lệ không dựng lưới" là phần sát mép vùng dữ liệu mà ô lưới thưa không phủ tới (ô chỉ được dựng khi mọi pixel 5 m bên dưới đều hợp lệ). Khi camera lại gần, cấp mịn hơn thay thế nên mép được dựng chính xác dần.

Va chạm và kiểm tra tuyến rover **không** được dựa vào cấp LOD thưa; `check` độ dốc dùng lớp `slp` 5 m gốc.
