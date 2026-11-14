# Task 02 — hiệu năng (đo trên máy phát triển)

**Số đo trên máy phát triển, chưa phải nghiệm thu trên máy mục tiêu.** Các mục chưa đo ghi rõ `NOT_MEASURED`.

## Điều kiện đo

| Mục | Giá trị |
|---|---|
| Máy | Máy phát triển Windows 11, GPU tích hợp Intel Iris Xe (ANGLE Direct3D 11). CPU/RAM: `NOT_RECORDED` |
| Trình duyệt | Chrome 157 headless qua Playwright |
| Độ phân giải | 1366 × 768, DPR 1, chất lượng "Đẹp nhất" |
| Máy chủ | Vite dev server trên localhost (module chưa bundle), không giới hạn băng thông, cache nguội |
| Cách đo | `node scripts/capture_views.mjs perf` → `reports/screenshots/perf_views.json` (bản sao: `docs/evidence/task02_perf_views.json`). Mỗi góc ghi hai số từ `renderer.info`: **khung cuối** (một frame bất kỳ) và **đỉnh** = lớn nhất trong cửa sổ 0,12 s. Bóng được cập nhật mỗi 0,08 s nên cửa sổ đỉnh luôn chứa ít nhất một frame có lượt vẽ bóng. Phân rã theo nhóm: `node scripts/scene_breakdown.mjs` |

## Đã làm (mục 2)

1. **Địa hình gộp thành một mesh.** Trước: mỗi ô lưới 32 × 32 là một draw call (13–134 ô tùy góc). Giờ: các ô cần vẽ được lọc theo frustum trên CPU rồi ghép vào **một** buffer động, nên chỉ còn **1 draw call**. Thêm ngân sách tam giác cho địa hình (84 nghìn ở "Đẹp nhất", 56 nghìn ở "Mượt mà"): khi vượt, khoảng cách chuyển cấp LOD tự co lại (tối thiểu 0,3 lần), nên các ô xa dùng cấp thưa hơn. Đỉnh lưới vẫn là mẫu DEM gốc của cấp đó; **không đổi số liệu DEM**, không làm mượt, không phóng đại.
2. **Cụm căn cứ gộp theo vật liệu.** 8 công trình + lối đi, đèn, hàng hóa, bãi đáp trước đây là ~90 mesh riêng; giờ gộp thành 17 mesh (một mesh cho mỗi vật liệu dùng chung). Mô hình, vật liệu và quy tắc đổ bóng giữ nguyên. Việc chọn công trình dùng một bản sao hình học vô hình (không được vẽ, chỉ để bắt click).
3. **Quả cầu Mặt Trăng ở gần.** Khi camera thấp hơn 30 km, mặt cầu 28.500 tam giác vốn chỉ hiện như nền tối được thay bằng vỏ cầu tối 800 tam giác cùng lỗ 50 km. Trên 30 km quả cầu chi tiết hiện lại như cũ.
4. **Lượt vẽ bóng.** Địa hình không đổ bóng (đã vậy từ Task 02); đá minh họa dùng instancing (2 draw call). Lượt bóng còn 22 draw call / 64.900 tam giác (13 mesh căn cứ, 2 nhóm đá, 7 mesh rover). Không cần giảm cấp LOD riêng cho lượt bóng để vào ngân sách.

So sánh ảnh trước/sau gộp (cùng 4 góc, ảnh chỉ thế giới): lệch trung bình 0,01–0,71 / 255 mỗi pixel, ≤ 0,15 % pixel lệch quá 24 / 255. Phong cách không đổi.

## Kết quả theo góc nhìn

| Góc | Trước mục 2: tam giác / draw call (một frame) | Sau: khung cuối | Sau: **đỉnh (có lượt bóng)** | ms/frame sau |
|---|---|---|---|---|
| `base` (27 m) | 269.806 / 216 | 154.172 / 69 | **219.072 / 91** | 16,7 |
| `near` (90 m) | 273.902 / 218 | 158.268 / 69 | **223.168 / 91** | 16,7 |
| `region` (900 m) | 285.230 / 221 | 137.148 / 69 | **202.048 / 91** | 16,7 |
| `wide` (6000 m) | 50.350 / 21 | 13.296 / 3 | **78.196 / 25** | 16,6 |

Số "trước" là một frame lấy mẫu trong `reports/screenshots/after_views.json` (commit `35b43be` chưa có số đỉnh), có thể có hoặc không có lượt bóng.

Phân rã ở góc `base` (sau, không tính lượt bóng): địa hình 1 call / 73 nghìn tam giác; căn cứ gộp 17 / 62 nghìn; đá 2 / 12 nghìn; Trái Đất 3 / 12 nghìn; Mặt Trời 2 / 4 nghìn; rover 12 / 2,4 nghìn; màn hình và hiệu ứng công trình 20 / 2,2 nghìn; phi hành gia 12; vỏ cầu tối 1 / 800.

Thời gian frame trong Chrome headless bị giới hạn bởi vsync 60 Hz (16,7 ms); không suy ra được FPS tối đa.

## So với ngân sách ở mục 10 của đặc tả

| Chỉ tiêu | Mục tiêu | Đo được | Kết luận |
|---|---|---|---|
| Draw call | ≤ 120 | Đỉnh 91 (base, near, region), 25 (wide) | **Đạt** trên máy phát triển |
| Tam giác cùng lúc | ≤ 250.000 | Đỉnh 202–223 nghìn kể cả lượt bóng | **Đạt** trên máy phát triển (dư ~27 nghìn ở góc near) |
| Địa hình tải ban đầu (nén) | ≤ 15 MB | 1,63 MB qua 43 request | Trong ngân sách |
| Toàn bộ địa hình trên đĩa | — | 16,5 MB / 390 tệp; ô 5 m và 10 m chỉ tải khi camera hoặc rover tới gần | — |
| Asset 3D tải ban đầu | ≤ 25 MB | `NOT_MEASURED` cho bản production | — |
| Tổng tải ban đầu Story Mode | ≤ 40 MB | Bản build `dist/` nặng 23 MB tính cả toàn bộ địa hình; lượng thực tải ban đầu của bản production: `NOT_MEASURED` | — |
| FPS trung vị ≥ 45 trên laptop i5/8 GB, GPU tích hợp | ≥ 45 | `NOT_MEASURED` trên máy mục tiêu; máy phát triển chạm trần vsync 60 Hz | Chưa kết luận |
| Thời gian đến tương tác ở 10 Mbps | ≤ 12 s | `NOT_MEASURED` có giới hạn băng thông. Localhost dev server, cache nguội: 8,1 s | Chưa kết luận |
| Chạy ngoại tuyến qua local server | Có | Game chỉ đọc `/lunar/task02/*` cùng máy chủ, không gọi API NASA | Đạt |
| Tự giảm chất lượng, fallback 2D khi WebGL lỗi | Có | Cài đặt "Mượt mà" (ngân sách địa hình thấp hơn, bóng nhỏ hơn). Fallback bản đồ 2D: **chưa làm** | Chưa đạt |
| RAM / bộ nhớ GPU | — | `NOT_MEASURED` | — |

## Việc còn lại

1. Đo trên laptop i5/8 GB với bản `npm run build && npm run preview`, giới hạn 10 Mbps, cache nguội và ấm; ghi FPS p50/p95 và ảnh DevTools.
2. Làm bản đồ 2D nhẹ từ `coverage_20m.bin` cho trường hợp không có WebGL.
