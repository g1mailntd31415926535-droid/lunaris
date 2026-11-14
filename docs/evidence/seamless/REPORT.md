# Ghép địa hình NASA liền mạch: báo cáo (15/11/2026)

Ảnh trước/sau: `before_*` / `after_*` trong thư mục này (`node scripts/terrain/seamless_views.mjs before|after`).
Mỗi ảnh có hậu tố cho biết kiểu render:

- `none`: render bình thường.
- `wire`: khung dây.
- `flat`: vật liệu xám đồng nhất, không texture.
- `albedo`: chỉ màu, không chiếu sáng.

Mỗi kiểu được chụp ở 5 mức độ cao: 900 m, 6 km, 30 km, 120 km, 600 km.

## 1. Nguyên nhân gốc

| Lỗi quan sát | Nguyên nhân (file) |
|---|---|
| Vùng NASA trông như miếng dán, nền xung quanh phẳng | Chỉ hình tròn 12,5 km quanh Site01/04 là DEM thật. Từ 12,5 đến 50 km là đĩa phẳng `moon-surround` (`planet-geometry.ts › buildMoonSurround`), chỉ tô miệng hố giả bằng shader (`terrain-material.ts › lunarCraterField`). Ngoài 50 km là địa hình hư cấu (`planet-fields.ts`: fbm cộng 180 miệng hố ngẫu nhiên). |
| Mép tối, giống vách dựng | Đĩa nền nằm ở độ cao căn cứ (1.944,8 m), không ở mặt cầu 1737,4 km, nên lệch datum so với DEM. DEM là mặt phẳng, nền là mặt cầu, nên ở mép hình tròn hai bên lệch thêm 45–68 m. Đĩa nền không ghi độ sâu (`depthWrite: false`), nên ở mép NoData nhìn thấy cạnh DEM lơ lửng. |
| Ranh giới thẳng, góc cạnh | 24,7 % hình tròn là NoData (mép hình chữ nhật của Site01/Site04). Ở đó chỉ còn đĩa phẳng. |
| Màu, ánh sáng khác nhau; DEM "biến mất" khi zoom xa | Shader DEM pha màu nền giả vào dải mép, và trộn hẳn sang màu nền giả khi khoảng cách nhìn từ 75 km trở lên (`terrainWeight` cũ trong `DemTerrain.tsx`). |
| Chi tiết đổi đột ngột | Hai hệ khác hẳn nhau: DEM 5 m nhiều mức LOD, và vân shader giả không có hình học. |

Những lỗi không xảy ra:

- Không có z-fighting giữa DEM và nền, vì nền không ghi độ sâu.
- Bóng đổ không phải nguyên nhân: địa hình không đổ bóng, chỉ nhận bóng từ căn cứ.

## 2. Phương án đã làm

**Dữ liệu (thư mục mới `public/lunar/regional/`, 9,4 MB; `public/lunar/task02` không bị đụng):**

| Cấp | Dữ liệu | Nguồn | Phạm vi |
|---|---|---|---|
| Local (giữ nguyên) | LOLA 5 m Site01 + Site04 | PGDA product 78 | Hình tròn 12,5 km |
| Regional g0 | LOLA 40 m | PGDA `LDEM_80S_40MPP_ADJ.TIF` | 48 × 48 km |
| Regional g1 | LOLA 160 m (trung bình 2×2 của bản 80 m) | `LDEM_80S_80MPP_ADJ.TIF` | 160 × 160 km |
| Regional g2 | LOLA 480 m (trung bình 2×2 của bản 240 m) | `LDEM_60S_240MPP_ADJ.TIF` | 640 × 640 km quanh cực |
| Global | LOLA LDEM_4 (0,25°) | PDS `LRO-L-LOLA-4-GDR-V1.0` | Toàn cầu |
| Ảnh quả cầu | LROC WAC color mosaic 2k | NASA SVS CGI Moon Kit | Toàn cầu (ảnh trình bày, không phải số đo) |

- **Trích dẫn:** Barker et al. 2023, doi:10.3847/PSJ/acf3e1. Data doi: 10.60903/gsfcpgda-lola-spole.
- **Cách đọc:** chỉ đọc đúng vùng cần qua HTTP range, không tải nguyên file 181–685 MB. Bản cache nằm ở `raw_regional/`, ngoài thư mục `public/`.
- **Script dựng:** `scripts/terrain/build_regional.py`.
- **Cùng phép chiếu, cùng datum:** mọi lưới cực dùng cùng phép chiếu Polar Stereographic Nam và cùng mặt cầu 1.737.400 m với DEM 5 m (đã so CRS).
- **Kiểm chứng cùng vị trí địa lý:** so trung bình DEM 5 m trong từng ô 40 m với ô LOLA 40 m, trên 230.629 ô:
  - lệch trung bình −0,11 m;
  - RMS 0,53 m;
  - p99 1,7 m.
- Không có NoData nào trong g0, g1, g2. Kết quả nằm trong `reports/regional_terrain_validation.json`.

**Hình học:**

- **Một datum chung:** điểm có độ cao h nằm ở bán kính R + h − h_base. Gần căn cứ (≤ 18 km) lưới được vẽ phẳng, giống hệt DEM 5 m. Từ 60 km trở ra là mặt cầu thật. Ở giữa hai vùng, độ nghiêng hiển thị lệch dưới 1° (có test). Độ cao không bị thay đổi.
- **`RegionalTerrain.tsx` dùng CDLOD:**
  - Cây tứ phân 11 cấp, từ 640 m đến 655 km. Mỗi nút là một lưới 16×16 vẽ bằng instancing; độ cao lấy từ texture LOLA trong vertex shader.
  - Có geomorphing: đỉnh lẻ trượt dần về lưới thô trước khi đổi cấp, nên không nứt, không nhảy hình, không cần skirt.
  - Normal tính theo từng pixel từ cùng dữ liệu.
- **Chỗ chồng với DEM 5 m:**
  - Lưới LOLA chỉ hạ 30 m ở những chỗ nằm sâu trong vùng có dữ liệu 5 m (cách mép từ 150–400 m trở lên), nơi DEM 5 m luôn phủ lên trên.
  - Lưới LOLA được đẩy lùi 0,2 % theo chiều sâu, để DEM 5 m luôn thắng ở chỗ hai lớp trùng nhau.
  - Khe NoData bên trong hình tròn giờ hiện LOLA 40 m thật, liền mép với DEM (sai lệch khoảng 1 m RMS).
- **Quả cầu (`planet-geometry.ts`):**
  - Độ cao từ LDEM_4, và từ lưới 480 m ở phía nam 79,5°S.
  - Xoay đúng theo kinh độ/vĩ độ thật.
  - Bên trong 80°S không vẽ quả cầu. Riêng vành 3 km cuối được hạ 1,5 km dưới lưới cực, để khe hở ở đường chân trời vẫn là bề mặt NASA chứ không lộ khoảng đen.
- **Đã xóa:** đĩa `moon-surround`, `planet-fields.ts` (địa hình hư cấu), các miệng hố giả trong shader, và phần shader pha màu nền giả vào DEM.

**Màu và ánh sáng:**

- DEM 5 m và lưới LOLA dùng chung một đoạn shader (`terrain-material.ts`).
- Ảnh LROC trên quả cầu được chuẩn hóa độ sáng về đúng albedo của địa hình ở dải 75–80°S, và mờ dần về giá trị trung bình sát cực, nơi ảnh bị vệt hội tụ.
- Ở dải 200–300 km, chi tiết ánh sáng của lưới cực chuyển dần sang tỉ lệ của quả cầu. Đây chỉ là chuyển tiếp ánh sáng, áp dụng sau khi hình học đã liền.

**Camera:** `PlanetCameraRig` dùng độ cao LOLA thật (DEM 5 m, rồi lưới cực, rồi LDEM_4) để giữ khoảng cách với mặt đất, thay cho trường hư cấu cũ.

## 3. NASA Layer và Game Layer

Cả hai lớp dùng cùng hình học, cùng độ cao.

- **NASA Layer:** albedo xám không đổi, ánh sáng lấy thuần từ normal của DEM. Không thêm hạt bụi, không phóng đại, không có bề mặt tổng hợp nào.
- **Game Layer:** thêm hạt bụi (texture), normal được phóng đại cho ánh sáng, hillshade bản đồ, và tông ấm quanh căn cứ. Chỉ đổi cách tô; đỉnh lưới và dữ liệu cho rover giữ nguyên.

Nhãn ở vùng không có 5 m đổi từ "Bề mặt là minh họa" thành "Ngoài vùng DEM 5 m · địa hình NASA LOLA 40–480 m, thô hơn; rover không đi vào".

## 4. Hiệu năng

Số đo từ Chrome headless (D3D11), 1366×768. Tam giác tính trên toàn khung hình.

| Độ cao | Tam giác trước | Tam giác sau (trong đó LOLA khu vực) | Draw call trước / sau |
|---|---|---|---|
| 900 m | 231k | 245k (34k) | 92 / 71 |
| 6 km | 254k | 318k (20k) | 92 / 93 |
| 30 km | 59k | 117k (14k) | 4 / 5 |
| 120 km | 37k | 89k (8k) | 4 / 5 |
| 600 km | 37k | 83k (2k) | 4 / 4 |

- Phần tăng thêm chủ yếu đến từ quả cầu LOLA (74k tam giác, cố định).
- Ở 6 km tổng số tam giác (318k) vượt ngân sách 250k ghi trong EVIDENCE. Chưa xử lý, xem mục 6.
- **Tải dữ liệu:**
  - Dữ liệu khu vực tải tuần tự theo cấp: 480 m cùng LDEM_4, rồi 160 m, rồi 40 m. Không chặn lúc mở cảnh.
  - Nếu một file lỗi thì giữ lưới thô hơn. Thiếu cả `g2` thì không vẽ lưới LOLA; còn quả cầu (LDEM_4, hoặc mặt cầu trơn) và DEM 5 m.
- **Bộ nhớ:** mỗi lưới được tạo texture một lần. Đổi layer chỉ đổi uniform, không tạo lại mesh.

## 5. Kiểm thử đã chạy

- **`npm test`:** 21/21 đạt. Có 4 test mới trong `tests/regional.test.mjs`:
  - frame: BASE nằm trên trục +Y, trục phép chiếu ánh xạ đúng;
  - vùng phẳng/cầu và độ lệch độ nghiêng dưới 1°;
  - LOLA 40 m khớp DEM 5 m tại A–D (dưới 15 m) và tại BASE;
  - không có NoData, và nguồn của từng lưới là PGDA.
- **`npm run build`:** chạy được.
- **`node scripts/terrain/smoke_check.mjs`:** 35/35. Gồm rover trên DEM (sai số 0 m), marker A–D, đổi layer giữ nguyên hình học, và các kiểm tra camera. Kiểm tra nhãn NoData đã được sửa theo câu chữ mới.
- **Dữ liệu NASA gốc:** `git diff` trên `public/lunar/task02`, `dem.ts`, `terrain-query.ts`, `rover-plan.ts` rỗng.

## 6. Còn tồn tại

- Ở 600 km vẫn thấy ranh giới độ nét tại 80°S: trong là LOLA 480 m, ngoài là LDEM_4 7,6 km. Tông màu đã khớp; phần còn lại là khác biệt độ phân giải thật của hai bộ dữ liệu NASA. Muốn khử hẳn cần lưới khoảng 1–2 km tới 60°S. Bản 240 m tới 60°S nặng 210 MB, nên chưa đọc.
- Ở độ cao 500 m–6 km, DEM 5 m có các mảng ô vuông và hình thoi do LOD thô. Lỗi này có từ trước (xem `before_00900m_none.png`); ảnh chụp không có lớp LOLA cho thấy nguyên nhân không phải lưới mới.
- Trong ảnh khung dây, lưới LOLA khu vực không hiện ở 30–600 km. Script chẩn đoán clone vật liệu nhưng không clone uniform của instancing; chỉ ảnh hưởng ảnh debug.
- Vị trí Trái Đất vẫn là vị trí mỹ thuật cũ, chưa đúng hướng kinh độ 0° thật so với quả cầu LOLA vừa xoay đúng.
- `docs/EVIDENCE.md` chưa được cập nhật. Chưa commit.
