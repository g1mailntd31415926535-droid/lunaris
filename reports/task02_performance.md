# Task 02 — hiệu năng (đo sơ bộ)

**Đây là số đo sơ bộ trên máy phát triển, chưa phải nghiệm thu.** Các mục chưa đo ghi rõ `NOT_MEASURED`; không mục nào được tuyên bố "đạt" khi chưa đo.

## Điều kiện đo

| Mục | Giá trị |
|---|---|
| Máy | Máy phát triển Windows 11, GPU tích hợp Intel Iris Xe (ANGLE Direct3D 11). CPU/RAM: `NOT_RECORDED` |
| Trình duyệt | Chrome 157 headless qua Playwright |
| Độ phân giải | 1366 × 768, DPR 1, chất lượng "Đẹp nhất" |
| Máy chủ | Vite dev server trên localhost (module chưa bundle), không giới hạn băng thông, cache nguội |
| Cách đo | `node scripts/capture_views.mjs after`; số tam giác và draw call lấy từ `renderer.info` của một frame; thời gian frame là trung bình trượt của game (`__LUNARIS__.frameMs`) |

## Kết quả theo góc nhìn

| Góc | Tam giác/frame AFTER | Draw call AFTER | ms/frame AFTER | Tam giác/frame BEFORE | Draw call BEFORE | ms/frame BEFORE |
|---|---|---|---|---|---|---|
| `base` (27 m) | 269.806 | 216 | 19,8 | 255.374 | 200 | 30,0 |
| `near` (90 m) | 273.902 | 218 | 16,9 | 149.674 | 134 | 19,8 |
| `region` (900 m) | 285.230 | 221 | 16,7 | 149.674 | 134 | 16,9 |
| `wide` (6000 m) | 50.350 | 21 | 16,7 | 68.864 | 3 | 16,7 |

Cách đọc bảng:

- Số tam giác/frame gồm cả lượt vẽ bóng. Cụm công trình + đá (không đổi so với trước) chiếm khoảng 107 nghìn tam giác và 82 draw call mỗi lượt, và được vẽ hai lượt ở frame có cập nhật bóng. Riêng phần này đã là ~214 nghìn tam giác ở góc `base` từ trước Task 02.
- Địa hình DEM thêm khoảng 55–125 nghìn tam giác nhìn thấy và 13–134 ô lưới tùy góc.
- Thời gian frame trong Chrome headless bị giới hạn bởi vsync 60 Hz (16,7 ms); không suy ra được FPS tối đa.

## So với ngân sách ở mục 10 của đặc tả

| Chỉ tiêu | Mục tiêu | Đo được | Kết luận |
|---|---|---|---|
| Địa hình tải ban đầu (nén) | ≤ 15 MB | 1,71 MB qua 44 request (metadata, mặt nạ, 5 cấp thưa, ô 5–10 m quanh căn cứ) | Trong ngân sách |
| Toàn bộ địa hình trên đĩa | — | 16,5 MB / 390 tệp; ô 5 m và 10 m chỉ tải khi camera hoặc rover tới gần | — |
| Asset 3D tải ban đầu | ≤ 25 MB | `NOT_MEASURED` cho bản production | — |
| Tổng tải ban đầu Story Mode | ≤ 40 MB | Bản build `dist/` nặng 23 MB tính cả toàn bộ địa hình; lượng thực tải ban đầu của bản production: `NOT_MEASURED` | — |
| Tam giác nhìn thấy cùng lúc | ≤ 250.000 | 270–285 nghìn ở frame có lượt bóng (xem cách đọc bảng); ước tính một lượt vẽ: 160–230 nghìn | **Chưa đạt** ở frame có lượt bóng |
| Draw call | ≤ 120 | 216–221 | **Chưa đạt** (trước Task 02 đã là 134–200) |
| FPS trung vị ≥ 45 trên laptop i5/8 GB, GPU tích hợp | ≥ 45 | `NOT_MEASURED` trên máy mục tiêu. Máy phát triển: 51–60 FPS suy từ ms/frame trung bình; chưa có p50/p95 | Chưa kết luận |
| Thời gian đến tương tác ở 10 Mbps | ≤ 12 s | `NOT_MEASURED` có giới hạn băng thông. Localhost dev server, cache nguội: 11,0 s tới khi cảnh 3D sẵn sàng | Chưa kết luận |
| Chạy ngoại tuyến qua local server | Có | Có: game chỉ đọc `/lunar/task02/*` cùng máy chủ, không gọi API NASA | Đạt |
| Tự giảm chất lượng, fallback 2D khi WebGL lỗi | Có | Có cài đặt "Mượt mà" (giảm mật độ lưới và bóng). Fallback bản đồ 2D: **chưa làm**; khi WebGL lỗi chỉ có màn thông báo sẵn có | Chưa đạt |
| RAM / bộ nhớ GPU | — | `NOT_MEASURED` | — |
| Ảnh DevTools | — | Chưa chụp | — |

## Việc cần làm để đạt ngân sách

1. Giảm draw call: gộp các ô lưới cùng cấp LOD thành một mesh (hiện mỗi ô một draw call), và gộp bớt mesh của cụm công trình.
2. Giảm tam giác ở frame có bóng: chỉ cho vật thể gần đổ bóng, hoặc hạ tần suất cập nhật bóng.
3. Đo trên laptop i5/8 GB với bản `npm run build && npm run preview`, có giới hạn 10 Mbps, cache nguội và ấm, ghi FPS p50/p95 và ảnh DevTools.
4. Làm bản đồ 2D nhẹ từ `coverage_20m.bin` cho trường hợp không có WebGL.
