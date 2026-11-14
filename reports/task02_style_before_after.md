# Task 02 — phong cách trước / sau khi thay địa hình bằng DEM NASA

## Cách chụp (giống hệt nhau cho BEFORE và AFTER)

| Thông số | Giá trị |
|---|---|
| Script | `node scripts/capture_views.mjs before\|after` |
| Trình duyệt | Chrome 157 headless (Playwright, kênh `chrome`), GPU Intel Iris Xe (ANGLE D3D11) |
| Viewport / DPR | 1366 × 768, DPR 1 |
| FOV | 40° (mặc định của game) |
| Góc camera | yaw 0,61 rad, polar gần 0,925 rad (mặc định của game); chỉ đổi độ cao qua `__LUNARIS_CONTROLS__.altitude()` |
| Thời gian cảnh | Dừng ở chặng A1 (sau khi bấm "Mình hiểu rồi"), nên thời gian hoạt ảnh đứng yên |
| Commit BEFORE | `f0af09f` (trước mọi thay đổi địa hình) |
| Commit AFTER | `f0af09f` + thay đổi Task 02 chưa commit |

Thông số đầy đủ từng ảnh (vị trí camera, điểm nhìn, số tam giác, draw call) nằm trong `reports/screenshots/before_views.json` và `after_views.json`.

| Góc | Độ cao | Vị trí camera BEFORE (m) | Vị trí camera AFTER (m) | Ảnh |
|---|---|---|---|---|
| `base` | 27 m | 22,7 · 27,0 · 28,9 | 22,7 · 26,9 · 28,9 | `before_base_*.png` / `after_base_*.png` |
| `near` | 90 m | 70,5 · 90,0 · 97,2 | 70,5 · 89,9 · 97,2 | `before_near_*.png` / `after_near_*.png` |
| `region` | 900 m | 361,7 · 900,0 · 513,8 | 361,7 · 899,9 · 513,8 | `before_region_*.png` / `after_region_*.png` |
| `wide` | 6000 m | 8231,6 · 5941,1 · 11774,0 | 8231,6 · 5941,0 · 11774,0 | `before_wide_*.png` / `after_wide_*.png` |

Mỗi góc có hai ảnh: `_ui` (có HUD) và `_world` (chỉ cảnh 3D). Camera lệch nhau dưới 0,1 m vì điểm nhìn bám theo mặt đất thật thay cho mặt đất cũ.

## Giữ nguyên

| Yếu tố | Ghi chú |
|---|---|
| Mô hình căn cứ, phi hành gia pixel, rover MILO | Không sửa file mô hình nào (`models.ts`, `model-kit.ts`, `Buildings.tsx`, `Actors.tsx`). |
| Tông đất tím/lavender ở tầm gần | Cùng texture hạt và cùng hệ số màu `(0.49, 0.48, 0.73)` như bản cũ; chuyển sang xám khi lên cao theo đúng `styleDetail` cũ. |
| Bóng xanh navy, đèn nền, đèn công trình | `SolarLighting` không đổi. Công trình vẫn đổ bóng lên mặt đất. |
| HUD, bảng thông tin, hội thoại, phím tắt | Không đổi bố cục. Chỉ đổi vài dòng chữ (xem dưới). |
| Điều khiển camera | Kéo xoay, cuộn zoom, kéo phải để dịch, phím 1/2/3, theo dõi MILO. Thêm `focusPoint` để bay tới điểm A–D. |
| Đá nhỏ quanh căn cứ | Giữ nguyên vị trí và hình dạng, gắn nhãn `ILLUSTRATIVE_RECONSTRUCTION` ("chi tiết minh họa tái dựng"). |
| Quả cầu Mặt Trăng nhìn từ quỹ đạo, Trái Đất, Mặt Trời, sao | Giữ nguyên cho góc nhìn xa (đây là phần mỹ thuật, không phải dữ liệu NASA). |

## Buộc phải đổi vì dùng DEM thật

| Thay đổi | Lý do |
|---|---|
| Hố và núi quanh căn cứ biến mất | Chúng là công thức sin/cos trong `terrain-field.ts`, không có trên Mặt Trăng. Địa hình thật tại BASE là sườn thoải ~4°. |
| Căn cứ nằm nghiêng theo sườn dốc thật | Thay vì san phẳng địa hình, cả cụm công trình được đặt lên mặt phẳng khớp với DEM quanh BASE (dốc 4,04°, sai lệch RMS 0,13 m). |
| Mặt đất có các mặt phẳng tam giác rõ (flat shading) | Lưới là mẫu DEM thật, không làm mượt. Ô lưới 5 m ở gần, thưa dần tới 320 m ở xa. |
| Không còn bề mặt Mặt Trăng liền mạch tới chân trời | Ngoài hai tile LOLA không có dữ liệu 5 m, nên không dựng gì. Phần đó là nền tối, có nhãn "Ngoài vùng dữ liệu NASA". |
| Mép địa hình là đường thẳng và cung tròn | Đó là mép thật của Site01/Site04 và đường tròn bán kính 12,5 km. Màu mờ dần về nền tối trong 80 m sát mép dữ liệu và 700 m sát đường tròn. |
| Không dùng ảnh albedo thủ tục trên mặt đất | Ảnh đó vẽ hố giả lên địa hình. Mặt đất thật chỉ dùng màu nền và hạt nhiễu (thuần mỹ thuật). |
| Địa hình không tự đổ bóng | Ánh sáng là mỹ thuật (xem `task02_sunlight.md`); bóng địa hình tính từ đèn này sẽ bị hiểu nhầm là bóng Mặt Trời thật. |
| MILO đi tới điểm cách hàng km thay vì loanh quanh 65–85 m | 20 điểm khảo sát cũ là điểm bịa bị kéo sát căn cứ. Nay chỉ còn bốn điểm A–D ở tọa độ thật. |
| Chữ: "UI PROTOTYPE" → "ĐỊA HÌNH NASA LOLA 5 m"; mục Về LUNARIS; trạng thái rover | Mô tả cũ nói địa hình là minh họa, nay không còn đúng. |

## Chưa xử lý

- Ở góc `wide` (6 km) camera của game đứng lệch ra ngoài bản đồ nên thấy nhiều nền tối. Đây là hành vi camera sẵn có; chưa chỉnh vì yêu cầu là giữ nguyên camera.
- Nơi hai cấp LOD gặp nhau có thể lộ khe hở dưới 1 pixel trên địa hình gồ ghề (không dùng dải che "skirt" để tránh thêm hình học không phải địa hình).
- Bản đồ nhỏ (minimap) trong bảng thông tin vẫn là hình minh họa căn cứ, chưa vẽ từ DEM.
