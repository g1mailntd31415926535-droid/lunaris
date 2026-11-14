# Task 02 — ánh sáng Mặt Trời và bóng đổ

**Trạng thái: `PENDING_EPHEMERIS`. Ánh sáng trong game là `ARTISTIC_LIGHTING — NOT PHYSICAL SUNLIGHT`.**

## Hiện trạng trong game

- Hướng đèn "Mặt Trời" là một vector cố định do tác giả chọn trong `World.tsx › SolarLighting`: góc cao 28° trừ 5° cho mỗi giờ của thanh "Dự báo". Nó không được tính từ ngày giờ, kinh vĩ độ hay lịch thiên văn nào.
- Góc 28° **không** phản ánh Mặt Trời thật ở vùng cực Nam Mặt Trăng (ở đó Mặt Trời luôn rất thấp, sát đường chân trời).
- Bóng đổ là bóng của công trình và rover lên mặt đất, phục vụ thẩm mỹ low-poly. Địa hình DEM không tự đổ bóng.
- Vì vậy bóng và độ sáng trong game **không được dùng** để tính điện pin Mặt Trời, nhiệt độ, vùng tối vĩnh viễn (PSR) hay thời gian rover phơi nắng. Chỉ số "Ánh sáng trên tấm pin" ở bảng Dự báo là số minh họa cũ, chưa nối với DEM.

## Dữ liệu còn thiếu để tính Mặt Trời thật

| Cần | Trạng thái |
|---|---|
| Thời điểm UTC của cảnh mô phỏng | Chưa chốt (game dùng "SOL 004 08:24" là nhãn hiển thị) |
| Lịch thiên văn (NASA NAIF/SPICE: kernel `de4xx.bsp`, `pck`, `moon_pa`…) | Chưa tải, chưa kiểm chứng phiên bản |
| Tọa độ điểm tham chiếu | Có: BASE ở −89,463163°, 222,510447°E (tính từ CRS của GeoTIFF) |
| Che khuất bởi địa hình (horizon mask từ DEM) | Chưa tính |

## Cách làm khi có dữ liệu

1. Từ SPICE lấy vector Mặt Trăng → Mặt Trời trong hệ quy chiếu gắn với Mặt Trăng (MOON_ME hoặc MOON_PA) tại thời điểm UTC đã chốt, rồi suy ra vĩ độ điểm dưới Mặt Trời δ và góc giờ H tại kinh độ của BASE. Không dùng lịch hay kinh độ Trái Đất.
2. Góc cao hình học: `sin(h) = sin(φ)·sin(δ) + cos(φ)·cos(δ)·cos(H)`, với φ là vĩ độ điểm quan sát. Trục quay Mặt Trăng chỉ nghiêng khoảng 1,5° so với pháp tuyến hoàng đạo nên |δ| nhỏ; tại φ ≈ −89,46° góc cao hình học chỉ quanh vài độ. Con số cụ thể phải lấy từ bước 1, báo cáo này **không** đưa ra con số nào.
3. So góc cao đó với đường chân trời địa phương dựng từ DEM 5 m (và DEM rộng hơn cho núi xa) theo từng phương vị để biết điểm có được chiếu sáng không.
4. Chỉ sau bước 3 mới được gọi bóng trong game là "bóng Mặt Trời" và mới được dùng cho năng lượng hay nhiệt.

Ảnh `NASA_Moon_South_Pole_Illumination.jpg` và `sp_illum_2deg.tif` trong thư mục dữ liệu là bản đồ chiếu sáng trung bình, chưa được nối vào game ở Task 02.
