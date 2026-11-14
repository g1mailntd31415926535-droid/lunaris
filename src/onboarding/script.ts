// Onboarding script: every line the mascot (Basic) or the captions (Advanced) say, in one place.
// Presentation only: nothing here changes the simulation. The game itself starts after the last step.
import type { RobotMood } from '../world/textures'

export type HudItem = 'battery' | 'water' | 'oxygen' | 'food'
export type CameraCue = 'base' | 'tour' | 'solar' | 'crew'
export interface TourStep {
  id: string
  lines: string[]
  mood?: RobotMood
  /** HUD items shown from this step on (they appear in order and stay). */
  reveal?: HudItem[]
  /** Items glowing while this step is on screen (cycled one after another if several). */
  highlight?: HudItem[]
  /** Camera cue when the step starts ('tour' runs after the last line, then the next step starts by itself). */
  camera?: CameraCue
  /** The player may look around freely; the step waits for "Tiếp tục". */
  explore?: boolean
  crewGreeting?: boolean
}

export const WELCOME = {
  title: 'LUNARIS',
  lines: ['Chào mừng đến với hành trình khám phá Mặt Trăng.', 'Bạn sẽ trở thành người chỉ huy một căn cứ nghiên cứu tại cực Nam Mặt Trăng.', 'Những quyết định của bạn sẽ ảnh hưởng đến tương lai của cả nhiệm vụ.'],
}

export const MODES = {
  basic: { title: 'Cơ bản', lines: ['Dành cho người mới.', 'Robot trợ lý hướng dẫn từng bước.', 'Thời gian tự dừng khi cần quyết định.'] },
  advanced: { title: 'Nâng cao', lines: ['Tự điều hành, không có trợ lý đi kèm.', 'Thời gian không tự dừng.', 'Vẫn có giải thích rủi ro và kết quả ở mỗi quyết định.'] },
}

export const BASIC_TOUR: TourStep[] = [
  { id: 'hello', mood: 'happy', camera: 'base', lines: ['Xin chào, Commander!', 'Chào mừng đến với căn cứ Artemis!', 'Đây sẽ là ngôi nhà và nơi làm việc của chúng ta trên Mặt Trăng.'] },
  { id: 'place', camera: 'tour', lines: ['Chúng ta đang ở khu vực cực Nam của Mặt Trăng.', 'Từ đây, chúng ta sẽ điều hành căn cứ, nghiên cứu và khám phá những vùng đất mới.'] },
  { id: 'explore', explore: true, lines: ['Bạn có thể thử xoay và phóng to để quan sát căn cứ của chúng ta.'] },
  { id: 'power', camera: 'solar', reveal: ['battery'], highlight: ['battery'], lines: ['Đầu tiên là điện năng!', 'Điện giúp duy trì các hệ thống trong căn cứ, từ xử lý nước đến sản xuất oxy.', 'Năng lượng không phải là vô hạn, nên chúng ta phải sử dụng thật hợp lý!'] },
  { id: 'water', camera: 'base', reveal: ['water'], highlight: ['water'], lines: ['Tiếp theo là nước!', 'Nước rất quan trọng cho sinh hoạt, nghiên cứu và nhiều hệ thống hỗ trợ sự sống.', 'Chúng ta có thể tái chế nước, nhưng quá trình này cần năng lượng và thiết bị hoạt động.'] },
  { id: 'oxygen', reveal: ['oxygen'], highlight: ['oxygen'], lines: ['Và đây là oxy!', 'Oxy giúp các phi hành gia hô hấp và duy trì sự sống trong căn cứ.', 'Chúng ta có thể tạo oxy từ nước bằng điện phân, nhưng quá trình đó cũng tiêu thụ nước và điện.'] },
  { id: 'links', highlight: ['battery', 'water', 'oxygen'], lines: ['Bạn thấy không? Điện, nước và oxy liên quan chặt chẽ với nhau.', 'Một quyết định hôm nay có thể ảnh hưởng đến những gì chúng ta làm được sau này.'] },
  { id: 'food', reveal: ['food'], highlight: ['food'], lines: ['Chúng ta cũng cần quản lý nguồn thực phẩm cho các phi hành gia.', 'Số này là số ngày thực phẩm mang từ Trái Đất còn đủ dùng. Khi gần hết, nhiệm vụ phải kết thúc.', 'Cây trong nhà kính là để nghiên cứu, giúp chuẩn bị cho những nhiệm vụ dài hơn sau này.'] },
  { id: 'crew', camera: 'crew', crewGreeting: true, mood: 'happy', lines: ['Tất nhiên, bạn sẽ không phải làm mọi việc một mình!', 'Đây là những người đồng đội sẽ cùng bạn nghiên cứu và vận hành căn cứ.'] },
  { id: 'go', camera: 'base', mood: 'happy', lines: ['Mình sẽ ở góc này và nhắc bạn khi cần.', 'Sẵn sàng nhận nhiệm vụ đầu tiên chưa, Commander?'] },
]

/** Advanced: short captions, no mascot, no step-by-step resource lesson. */
export const ADVANCED_TOUR: TourStep[] = [
  { id: 'arrive', camera: 'tour', lines: ['Căn cứ Artemis · cực Nam Mặt Trăng · địa hình NASA LOLA'] },
  { id: 'hud', reveal: ['battery', 'water', 'oxygen', 'food'], highlight: ['battery', 'water', 'oxygen', 'food'], lines: ['Điện · nước · oxy (%) và số ngày thực phẩm từ Trái Đất. Mọi quyết định đều có hệ quả.'] },
]

/** Basic gameplay: the mascot keeps one short hint (lines come from components/Story.tsx lunaHint). */
export const MASCOT_NAME = 'LUNA-01'
