import type { BuildingData, BuildingId, CameraMode, Section } from './types'

// This is an authored presentation plan, not a resource economy or scientific site.
// Scene convention: right-handed, +Y up, front of a building = +Z, 1 unit ≈ 1 m.
export const BUILDINGS: BuildingData[] = [
  { id: 'command', name: 'Trung tâm chỉ huy', shortName: 'Chỉ huy', code: 'CMD–01', category: 'TRÁI TIM CĂN CỨ', accent: '#b8a0ff', position: [-0.8, 0, -2], radius: 3.05, description: 'Một ngôi nhà nhỏ, kết nối những cuộc khám phá lớn.', fact: 'Tín hiệu từ Mặt Trăng mất khoảng 1,3 giây để tới Trái Đất.', action: 'Gửi tín hiệu về Trái Đất', metric: 'Kết nối Trái Đất', unit: '%', value: 98 },
  { id: 'solar', name: 'Trạm năng lượng', shortName: 'Năng lượng', code: 'SOL–02', category: 'NĂNG LƯỢNG SẠCH', accent: '#ffd75e', position: [-9, 0, -5.2], radius: 3.1, description: 'Hứng những tia nắng để thắp sáng ngôi nhà trên Mặt Trăng.', fact: 'Một ngày trên Mặt Trăng dài gần 29,5 ngày trên Trái Đất.', action: 'Lau tấm pin mặt trời', metric: 'Hiệu suất tấm pin', unit: '%', value: 86 },
  { id: 'water', name: 'Trạm tái chế nước', shortName: 'Tái chế nước', code: 'H₂O–03', category: 'MỖI GIỌT ĐỀU QUÝ', accent: '#59c9ff', position: [1.2, 0, 6.6], radius: 2.15, description: 'Biến nước đã dùng thành những giọt nước sạch cho cả căn cứ.', fact: 'Trên ISS, hệ thống có thể thu hồi khoảng 98% lượng nước.', action: 'Tăng sản xuất', metric: 'Nước trong bể', unit: '%', value: 56 },
  { id: 'oxygen', name: 'Trạm hỗ trợ sự sống', shortName: 'Hỗ trợ sự sống', code: 'O₂–04', category: 'MỘT HƠI THỞ XANH', accent: '#5edc88', position: [5.5, 0, -5.7], radius: 1.75, description: 'Không khí trong lành để các nhà thám hiểm luôn khỏe mạnh.', fact: 'Điện có thể tách nước thành hydro và oxy. Quá trình này gọi là điện phân.', action: 'Kiểm tra không khí', metric: 'Oxy dự trữ', unit: '%', value: 68 },
  { id: 'battery', name: 'Trạm pin dự trữ', shortName: 'Pin dự trữ', code: 'BAT–05', category: 'NĂNG LƯỢNG ĐỂ DÀNH', accent: '#ffd75e', position: [-7.4, 0, 2.6], radius: 1.9, description: 'Cất những tia nắng hôm nay cho những giờ tối mai sau.', fact: 'Bóng núi ở cực Nam có thể rất dài vì Mặt Trời luôn ở thấp trên đường chân trời.', action: 'Sạc pin dự trữ', metric: 'Dung lượng pin', unit: '%', value: 72 },
  { id: 'shelter', name: 'Nhà ở phi hành gia', shortName: 'Nhà trú ẩn', code: 'HAB–06', category: 'AN TOÀN & ẤM ÁP', accent: '#ff9d8d', position: [-4.8, 0, 7.7], radius: 1.85, description: 'Một góc ấm áp để nghỉ ngơi và trú ẩn khi có bức xạ.', fact: 'Đất Mặt Trăng có thể giúp che chắn căn cứ khỏi bức xạ không gian.', action: 'Diễn tập trú ẩn', metric: 'Khả năng che chắn', unit: '%', value: 94 },
  { id: 'greenhouse', name: 'Vườn không gian', shortName: 'Nhà kính', code: 'BIO–07', category: 'MẦM XANH TRÊN TRĂNG', accent: '#a5e887', position: [8, 0, 0.2], radius: 2.65, description: 'Những mầm xanh đầu tiên, lớn lên dưới mái vòm đầy sao.', fact: 'Cây trồng ngoài không gian vẫn cần ánh sáng, nước và chất dinh dưỡng.', action: 'Chăm sóc vườn cây', metric: 'Độ ẩm nhà kính', unit: '%', value: 78 },
  { id: 'rover', name: 'Trạm thám hiểm', shortName: 'Trạm rover', code: 'ROV–08', category: 'KHÁM PHÁ TỪNG BƯỚC NHỎ', accent: '#ffc67e', position: [8.6, 0, 7.6], radius: 2.2, description: 'Gặp MILO, chiếc rover nhỏ với một hành trình khám phá lớn.', fact: 'Rover có thể khám phá những nơi quá nguy hiểm với con người.', action: 'Đi cùng MILO', metric: 'Pin của MILO', unit: '%', value: 89 },
]

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((item) => [item.id, item])) as Record<BuildingId, BuildingData>

export const NAVIGATION: { id: Section; label: string; tooltip: string; key: string }[] = [
  { id: 'base', label: 'Căn cứ', tooltip: 'Căn cứ của bạn', key: 'B' },
  { id: 'missions', label: 'Nhiệm vụ', tooltip: 'Những cuộc khám phá', key: 'M' },
  { id: 'forecast', label: 'Dự báo', tooltip: 'Nhìn trước một chút', key: 'F' },
  { id: 'journal', label: 'Nhật ký', tooltip: 'Sổ tay khoa học', key: 'J' },
]

export const CAMERA_MODES: { id: CameraMode; label: string; key: string; scale: string }[] = [
  { id: 'orbit', label: 'Mặt Trăng', key: '1', scale: '1.737 km' },
  { id: 'region', label: 'Khu vực', key: '2', scale: '500 m' },
  { id: 'base', label: 'Căn cứ', key: '3', scale: '50 m' },
]

export const FORECASTS = [
  { hour: 0, title: 'Nắng đẹp tại căn cứ', description: 'Các tấm pin đang đón ánh nắng. Một lúc tuyệt vời để khám phá!', power: 86, light: 'Nắng nhẹ', color: '#ffd75e' },
  { hour: 2, title: 'Bóng núi đang đến gần', description: 'Bóng của sườn núi sẽ dần chạm tới trạm năng lượng.', power: 65, light: 'Bóng núi', color: '#ffd75e' },
  { hour: 4, title: 'Ít ánh sáng hơn', description: 'Trạm năng lượng bắt đầu vào bóng tối. Pin dự trữ sẽ rất hữu ích.', power: 38, light: 'Chạng vạng', color: '#b8a0ff' },
  { hour: 8, title: 'Một đêm yên tĩnh', description: 'Căn cứ được thắp sáng bằng năng lượng đã để dành.', power: 12, light: 'Trời tối', color: '#8fa9ff' },
]

export const MISSIONS = [
  { id: 'first-home', number: '01', name: 'Ngôi nhà trên Mặt Trăng', subtitle: 'Làm quen với căn cứ Artemis', progress: 3, total: 4, reward: 'Nhà thám hiểm mới', color: '#b8a0ff', tasks: ['Khám phá trung tâm chỉ huy', 'Gặp đội phi hành gia', 'Xem trạm năng lượng', 'Thử tái chế nước'] },
  { id: 'sunlight', number: '02', name: 'Để dành một tia nắng', subtitle: 'Khám phá ánh sáng và bóng núi', progress: 1, total: 3, reward: 'Người bạn của Mặt Trời', color: '#ffd75e', tasks: ['Mở bảng dự báo', 'Nhìn bóng núi sau 4 giờ', 'Sạc pin dự trữ'] },
  { id: 'milo', number: '03', name: 'MILO và miền đất mới', subtitle: 'Theo chân một người bạn robot', progress: 0, total: 2, reward: 'Đồng đội của MILO', color: '#59c9ff', tasks: ['Ghé thăm trạm thám hiểm', 'Cho MILO đi khám phá'] },
]

export const JOURNAL = [
  { id: 'moon', tag: 'MẶT TRĂNG', title: 'Vì sao có những vùng luôn tối?', text: 'Ở cực Nam, Mặt Trời chiếu rất thấp. Các núi và thành miệng hố tạo ra bóng dài. Một số đáy hố chưa bao giờ nhận được ánh nắng trực tiếp!', extra: 'Những vùng tối này có thể lưu giữ băng nước — một tài nguyên quý cho những căn cứ tương lai.', color: '#b8a0ff' },
  { id: 'water', tag: 'SỰ SỐNG', title: 'Một giọt nước, nhiều hành trình', text: 'Trên trạm vũ trụ, nước không chỉ được dùng một lần. Máy lọc làm sạch nước đã dùng để các phi hành gia có thể sử dụng lại.', extra: 'Thu hồi nước giúp giảm khối lượng phải mang từ Trái Đất lên không gian.', color: '#59c9ff' },
  { id: 'earth', tag: 'KHÁM PHÁ', title: 'Ngôi nhà xanh nhìn từ xa', text: 'Từ Mặt Trăng, Trái Đất trông lớn hơn nhiều so với Mặt Trăng chúng ta thấy trên bầu trời. Khoảng cách trung bình là 384.400 km.', extra: 'Trái Đất trong cảnh là một khối cầu 3D. Lục địa và mây được vẽ bằng mã, không phải ảnh vệ tinh.', color: '#5edc88' },
]
