// Result review and "Tại sao điều này xảy ra?" text. Built only from the real log entry and the decisions
// it cites (causeIds → DecisionRecord), so an explanation never names a choice the player did not make.
import type { DecisionKey, DecisionRecord, EventLogEntry, GameState } from './types.ts'
import { CAPACITY, CREW, FOOD, POWER, SCHEDULE } from './scenario.ts'
import { roverEnergyNeed } from './reducer.ts'

export interface Review {
  eyebrow: string
  title: string
  /** "Bạn đã chọn gì?" (decisions only) */
  chose?: string
  /** "Điều gì xảy ra?" */
  happened: string[]
  /** "Vì sao xảy ra?" — tied to the player's earlier choices when there are any */
  why: string[]
  /** "Điều gì có thể ảnh hưởng tới tương lai?" */
  future?: string
  /** One key idea per event (STEM) */
  lesson?: string
  /** A short reflection question (not a quiz) */
  reflect?: string
  tone: 'decision' | 'event' | 'consequence' | 'good' | 'stage'
}

const LABEL: Record<string, string> = {
  'A1:recycle': 'Dùng điện dư để lọc thêm nước', 'A1:battery': 'Dùng điện dư để sạc pin dự trữ',
  'A3:keep': 'Giữ giàn pin mở', 'A3:stow': 'Thu gọn giàn pin',
  'B1:now': 'Sửa hệ thống tưới ngay', 'B1:later': 'Để sửa sau ca làm việc',
  'C2:go': 'Đi tuyến A* đã kiểm tra', 'C31:slow': 'Đi chậm qua bãi đá', 'C31:detour': 'Đi vòng quanh bãi đá', 'C31:return': 'Cho MILO quay về',
  'D1:greenhouse': 'Ưu tiên đèn nhà kính', 'D1:rover': 'Ưu tiên sạc rover',
  'D2:rover': 'Dùng rover MILO chở hàng', 'D2:crew': 'Cho phi hành gia ra nhận hàng',
  'D3:wait': 'Cho MILO chờ hết bức xạ để đo lại', 'D3:return': 'Cho MILO về sớm',
}
export const choiceLabel = (r: Pick<DecisionRecord, 'key' | 'choice'>) => r.key === 'C1' ? `Chọn khu nghiên cứu ${r.choice}` : LABEL[`${r.key}:${r.choice}`] ?? r.choice

/** One key idea per event: the lesson the situation is built around. */
export const LESSON: Partial<Record<DecisionKey | 'A2' | 'B4' | 'C4' | 'D2L', string>> = {
  A1: 'Điện có hạn, nên phải chọn việc nào làm trước.',
  A2: 'Điện phân: dùng điện tách nước thành oxy để thở (và hydro). Tạo oxy thì tốn cả nước lẫn điện.',
  A3: 'Bảo vệ thiết bị cũng là một quyết định chia nguồn lực: an toàn hôm nay đổi lấy điện hôm nay.',
  B1: 'Cây cần nước đều đặn. Thiếu nước càng lâu, cây càng yếu.',
  B4: 'Một thí nghiệm đáng tin khi có số đo thật và quan sát nhiều ngày.',
  C1: 'Chọn nơi khảo sát là bước đầu của mọi chuyến nghiên cứu.',
  C2: 'Rover chỉ đi được nơi đủ thoải (dốc ≤ 15°). Đường càng xa càng tốn pin và thời gian.',
  C31: 'Bản đồ không thấy hết mọi thứ: đá nhỏ hơn ô 5 m chỉ camera rover mới thấy.',
  C4: 'Kết quả đo là bằng chứng gián tiếp: chỉ số hydro cao chưa có nghĩa là chắc chắn có băng.',
  D1: 'Khi thiếu điện, hệ thống giữ sự sống luôn được ưu tiên trước.',
  D2: 'Hàng chỉ có ích khi đã về tới căn cứ. Vận chuyển tốn thời gian và năng lượng.',
  D3: 'Bức xạ làm nhiễu máy đo neutron. Dữ liệu bị nhiễu phải loại bỏ, không được dùng.',
}
const REFLECT: Partial<Record<DecisionKey | 'A2', string>> = {
  A1: 'Nếu ngày mai trời tối lâu, bạn muốn có thêm nước hay thêm điện?',
  A2: 'Vì sao tạo oxy lại làm lượng nước giảm?',
  A3: 'Bạn chấp nhận mất điện vài giờ để bảo vệ giàn pin không?',
  B1: 'Nếu là cây của bạn, bạn có để nó khát cả buổi không?',
  C1: 'Vì sao vùng tối vĩnh cửu có thể giữ được băng?',
  C31: 'Tại sao một bản đồ rất tốt vẫn có thể bỏ sót đá nhỏ?',
  D1: 'Nếu chỉ còn ít điện, việc nào phải giữ trước tiên?',
  D2: 'Đi bằng rover hay đi bộ: mỗi cách tốn thứ gì?',
  D3: 'Một số đo sai có thể làm kết luận sai như thế nào?',
}

/** Future impact of a choice, as the engine actually models it. */
function future(r: DecisionRecord, s: GameState): string | undefined {
  switch (`${r.key}:${r.choice}`) {
    case 'A1:recycle': return 'Nước lọc thêm ở lại trong bể. Pin không có phần sạc thêm này.'
    case 'A1:battery': return `Pin chỉ chứa tối đa ${CAPACITY.battery} kWh: khi pin đầy, phần sạc thêm không cất được nữa. Nước đã dùng vẫn chờ trong bể lọc.`
    case 'A3:keep': return `Nếu bụi bắn vào, giàn pin mất ${POWER.a3LossFraction * 100} % công suất mãi mãi. Lúc thiếu sáng (D1) sẽ còn ít điện hơn.`
    case 'A3:stow': return `Khoảng ${Math.round((SCHEDULE.a3PrepMin + SCHEDULE.a3HazardMin + SCHEDULE.a3RedeployMin) / 60)} giờ không có điện mặt trời; căn cứ dùng pin dự trữ. Sau đó giàn pin vẫn đủ 100 %.`
    case 'B1:now': return 'Cây chỉ thiếu nước thêm khoảng 2 giờ. Khối lượng khi thu hoạch sẽ cho thấy điều này.'
    case 'B1:later': return `Cây thiếu nước thêm khoảng ${Math.round((SCHEDULE.b1DelayMin + SCHEDULE.b1RepairMin) / 60)} giờ, nên khi thu hoạch có thể nhẹ hơn.`
    case 'C2:go': return 'MILO chờ sạc đủ pin cho cả đi và về rồi mới xuất phát.'
    case 'C31:slow': return 'Phần đường còn lại đi chậm hơn và tốn thêm pin.'
    case 'C31:detour': return 'Đường dài hơn một chút, nhưng tránh hẳn bãi đá.'
    case 'C31:return': return 'MILO về an toàn nhưng chưa đo được gì ở khu đã chọn.'
    case 'D1:greenhouse': return 'Đèn nhà kính được giữ; rover có thể sạc chậm, chuyến khảo sát phải chờ.'
    case 'D1:rover': return 'Rover sạc trước; đèn nhà kính có thể tắt nhiều giờ, cây lớn chậm hơn.'
    case 'D2:rover': return s.ice.stage === 'recalled' ? 'Khảo sát băng bị gián đoạn cho tới khi chở hàng xong.' : 'MILO bận chở hàng vài giờ và tốn một ít pin.'
    case 'D2:crew': return `Hai phi hành gia ra ngoài khoảng ${SCHEDULE.d2CrewPickupMin / 60} giờ; cả đội dùng thêm oxy trong lúc đó.`
    case 'D3:wait': return 'Chuyến khảo sát kéo dài hơn, nhưng có thêm mẫu neutron sạch.'
    case 'D3:return': return 'Về sớm và an toàn, nhưng ít mẫu neutron hơn.'
  }
  return r.key === 'C1' ? 'Bước tiếp theo: chọn tuyến đường an toàn tới khu này.' : undefined
}

/** "Vì sao" for an entry caused by earlier decisions: each cited decision, in the player's own words. */
function causes(e: EventLogEntry, s: GameState): string[] {
  const out: string[] = []
  for (const id of e.causeIds) {
    const r = s.history.find((h) => h.id === id)
    if (!r) continue
    const at = `Lúc trước, bạn chọn “${choiceLabel(r)}” (${r.key === 'C31' ? 'C3.1' : r.key}).`
    switch (`${e.tag}:${r.key}:${r.choice}`) {
      case 'A3:A3:keep': out.push(`${at} Giàn pin vẫn mở khi bụi bay nên bề mặt bị trầy.`); break
      case 'A3:A3:stow': out.push(`${at} Giàn pin được gập lại nên bụi không làm hư.`); break
      case 'D1:A3:keep': out.push(`${at} Giàn pin đã mất 10 % công suất nên lúc thiếu sáng còn ít điện hơn.`); break
      case 'D1:A3:stow': out.push(`${at} Giàn pin còn đủ 100 % công suất nên lúc thiếu sáng vẫn làm ra nhiều điện hơn.`); break
      case 'B1:B1:now': out.push(`${at} Thợ sửa bắt tay vào việc ngay nên cây thiếu nước ít.`); break
      case 'B1:B1:later': out.push(`${at} Việc sửa phải chờ hết ca nên cây thiếu nước lâu hơn.`); break
      case 'B4:B1:now': case 'B4:B1:later': out.push(`${at} Cây đã thiếu nước ${Math.round(s.food.waterStressMin / 60)} giờ, điều này ảnh hưởng tới khối lượng.`); break
      case 'B4:D1:greenhouse': case 'B4:D1:rover': out.push(`${at} Đèn nhà kính đã tắt tổng cộng ${Math.round(s.food.lightDeficitMin / 60)} giờ.`); break
      default: out.push(at)
    }
  }
  return out
}

const tone = (e: EventLogEntry): Review['tone'] => e.kind === 'decision' ? 'decision' : e.kind === 'event' ? 'event' : e.kind === 'consequence' ? 'consequence' : e.kind === 'stage' ? 'stage' : 'good'

export function reviewFor(e: EventLogEntry, s: GameState): Review {
  const tag = e.tag === 'C3.1' ? 'C31' : e.tag
  const deltas = e.deltas ? Object.entries(e.deltas).filter(([k]) => k !== 'wastewater').map(([k, v]) => `${({ battery: 'Pin dự trữ', water: 'Nước sạch', oxygen: 'Oxy', food: 'Thực phẩm' } as Record<string, string>)[k] ?? k} ${v > 0 ? '+' : ''}${k === 'food' ? `${Math.round(v / CREW * 10) / 10} ngày` : `${Math.round(v * 10) / 10} ${k === 'battery' ? 'kWh' : k === 'oxygen' ? 'kg' : 'L'}`}`) : []
  if (e.kind === 'decision') {
    const r = [...s.history].reverse().find((h) => (h.key === tag || (h.key === 'C1' && tag === 'C1')) && h.atMinute <= e.atMinute)
    return {
      eyebrow: `KẾT QUẢ · ${e.tag}`, title: 'Bạn đã quyết định', tone: 'decision',
      chose: r ? choiceLabel(r) : e.title,
      happened: [e.title + '.', ...(e.detail ? [e.detail] : []), ...(deltas.length ? [deltas.join(' · ')] : [])],
      why: r && r.rejected.length ? [`Bạn đã không chọn: ${r.rejected.map((c) => choiceLabel({ key: r.key, choice: c })).join(', ')}. Mỗi lựa chọn có cái được và cái mất.`] : [],
      future: r ? future(r, s) : undefined,
      lesson: LESSON[tag as DecisionKey], reflect: REFLECT[tag as DecisionKey],
    }
  }
  const why = causes(e, s)
  if (e.tag === 'D1' && !why.length) why.push('Pin dự trữ còn đủ để bù phần điện thiếu.')
  if (e.tag === 'A2') return { eyebrow: 'CHẶNG A2 · OXY', title: e.title, tone: 'good', happened: [e.detail ?? ''], why: ['Máy điện phân dùng điện để tách nước thành oxy và hydro.'], future: 'Từ giờ bạn sẽ thấy nước và điện giảm một chút khi oxy tăng.', lesson: LESSON.A2, reflect: REFLECT.A2 }
  const lessonKey = e.tag === 'B4' ? 'B4' : e.tag === 'C4' ? 'C4' : undefined
  return {
    eyebrow: `${e.kind === 'event' ? 'SỰ KIỆN' : e.kind === 'consequence' ? 'HỆ QUẢ' : e.kind === 'research' ? 'NGHIÊN CỨU' : 'NHIỆM VỤ'}${e.tag && e.tag !== 'FREE' ? ` · ${e.tag}` : ''}`,
    title: e.title, tone: tone(e),
    happened: [...(e.detail ? [e.detail] : []), ...(deltas.length ? [deltas.join(' · ')] : [])],
    why, lesson: lessonKey ? LESSON[lessonKey] : e.kind === 'consequence' && e.tag ? LESSON[tag as DecisionKey] : undefined,
  }
}

// ── Persistent objective: what the player should do or is waiting for, from the real state only ──
export interface Objective {
  title: string
  detail?: string
  /** 0..1 when something is in progress */
  progress?: number
  /** building the player can click / look at */
  building?: 'oxygen' | 'greenhouse' | 'rover' | 'command' | 'solar' | 'shelter' | 'battery'
  /** pure waiting: offer fast-forward to the next moment that needs the player */
  canSkip?: boolean
}
const hhmm = (minute: number) => { const t = 480 + Math.floor(minute); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
const frac = (a: number, b: number, now: number) => b > a ? Math.min(1, Math.max(0, (now - a) / (b - a))) : 1

export function currentObjective(g: GameState): Objective | null {
  if (g.phase !== 'playing' || g.decisions.length || g.inbox.length) return null
  const now = g.clock.elapsedMinutes, f = g.food, i = g.ice, sup = g.supply
  if (g.stage === 'A1') return null
  if (g.stage === 'A2') return { title: 'Bật máy điện phân', detail: 'Chạm vào trạm hỗ trợ sự sống.', building: 'oxygen' }
  if (g.stage === 'A3' && g.a3Choice === null) return { title: 'Chờ tàu thiết bị khoa học', detail: `Hạ cánh theo lịch: Ngày 3 · ${hhmm(SCHEDULE.a3At)}.`, progress: frac(0, SCHEDULE.a3At, now), canSkip: true, building: 'solar' }
  if (g.a3HazardEndsAt !== null && now < g.a3HazardEndsAt) return { title: g.a3Choice === 'stow' ? 'Giàn pin đang thu gọn chờ tàu đáp' : 'Tàu đang hạ cánh, giàn pin vẫn mở', detail: `Hết nguy cơ bụi lúc ${hhmm(g.a3HazardEndsAt)}.`, progress: frac(g.a3HazardEndsAt - SCHEDULE.a3HazardMin - SCHEDULE.a3PrepMin, g.a3HazardEndsAt, now), canSkip: true, building: 'solar' }
  if (g.radiation.active && g.radiation.endsAt) return { title: 'Bão bức xạ: cả đội đang trú ẩn', detail: `Hết lúc ${hhmm(g.radiation.endsAt)}. Việc ngoài trời tạm dừng.`, progress: frac(g.radiation.endsAt - SCHEDULE.d3Min, g.radiation.endsAt, now), canSkip: true, building: 'shelter' }
  if (sup.stage === 'landing' && sup.landingEndsAt) return { title: 'Tàu tiếp tế đang hạ cánh', progress: frac(sup.landingEndsAt - SCHEDULE.d2LandingMin, sup.landingEndsAt, now), canSkip: true }
  if (sup.stage === 'pickup') {
    const p = sup.phaseStartedAt !== null && sup.jobDoneAt ? frac(sup.phaseStartedAt, sup.jobDoneAt, now) : undefined
    return { title: sup.method === 'crew' ? 'Hai phi hành gia đang chở hàng về' : sup.roverPhase === 'toBase' ? 'MILO đang quay về để chở hàng' : sup.roverPhase === 'trip' ? 'MILO đang chở hàng tiếp tế' : 'MILO đang đổi cấu hình chở hàng', detail: 'Hàng vào kho khi về tới căn cứ.', progress: p, canSkip: true, building: 'rover' }
  }
  if (f.irrigation === 'fault' && f.repairStartsAt !== null && f.repairStartsAt > now) return { title: 'Hệ thống tưới vẫn hỏng', detail: `Theo kế hoạch sẽ sửa lúc ${hhmm(f.repairStartsAt)}. Bạn có thể chạm vào nhà kính để sửa sớm hơn.`, building: 'greenhouse' }
  if (f.irrigation !== 'ok') return { title: 'Đang sửa hệ thống tưới', progress: f.repairDoneAt ? frac(f.repairDoneAt - SCHEDULE.b1RepairMin, f.repairDoneAt, now) : undefined, canSkip: true, building: 'greenhouse' }
  if (i.stage === 'charging' && i.route) return { title: 'MILO đang sạc pin cho chuyến đi', detail: `Cần ${Math.round(roverEnergyNeed(i.route.lengthM + i.detourM))} kWh cho cả đi và về.`, progress: Math.min(1, i.roverBattery / roverEnergyNeed(i.route.lengthM + i.detourM)), canSkip: true, building: 'rover' }
  if ((i.stage === 'outbound' || i.stage === 'returning' || i.stage === 'recalled') && i.route) { const total = i.route.lengthM + i.detourM; return { title: i.stage === 'outbound' ? `MILO đang tới khu ${i.zone}` : 'MILO đang về căn cứ', progress: i.stage === 'outbound' ? i.distanceM / total : 1 - i.distanceM / total, canSkip: true, building: 'rover' } }
  if (i.stage === 'surveying') return { title: `MILO đang khảo sát khu ${i.zone}`, progress: Math.min(1, i.surveyMin / i.surveyTargetMin), canSkip: true, building: 'rover' }
  if (f.started && !g.fired.includes('B1')) return { title: 'Theo dõi nhà kính', detail: 'Cây đang lớn. Hãy để thời gian trôi.', canSkip: true, building: 'greenhouse' }
  if (f.stage === 'harvested') return { title: 'Lập báo cáo thực phẩm', detail: 'Chạm vào nhà kính.', building: 'greenhouse' }
  const day = Math.floor(now / 1440) + 1
  if (f.started && f.stage === 'growing' && !f.observations.some((o) => o.day === day)) return { title: 'Quan sát cây hôm nay', detail: 'Chạm vào nhà kính, chọn “Quan sát cây”.', building: 'greenhouse' }
  if (f.started && f.stage === 'growing' && f.growth >= FOOD.readyIndex) return { title: 'Thu hoạch và cân mẫu', detail: 'Cây đã đủ lớn.', building: 'greenhouse' }
  if (g.stage === 'free' && !f.started) return { title: 'Bắt đầu nghiên cứu thực phẩm', detail: 'Chạm vào nhà kính.', building: 'greenhouse' }
  if (g.stage === 'free' && i.stage === 'idle' && !i.report && (g.mode === 'advanced' || g.history.some((h) => h.key === 'B1'))) return { title: 'Bắt đầu khám phá băng', detail: 'Chạm vào trạm rover.', building: 'rover' }
  if (f.report && i.report) return { title: 'Nộp báo cáo và trở về', detail: 'Chạm vào trung tâm chỉ huy.', building: 'command' }
  if (f.started && f.stage === 'growing') return { title: `Chờ cây lớn tới ${Math.round(FOOD.readyIndex * 100)} %`, detail: `Hiện ${Math.round(f.growth * 100)} %. Quan sát mỗi ngày giúp dữ liệu đáng tin hơn.`, progress: f.growth / FOOD.readyIndex, canSkip: true, building: 'greenhouse' }
  return { title: 'Theo dõi căn cứ', detail: 'Sự kiện tiếp theo sẽ tự báo cho bạn.', canSkip: true }
}
