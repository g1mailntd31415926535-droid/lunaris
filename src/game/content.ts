// Player-facing text for every decision and the ending report (Vietnamese, for ages 7–12).
// Kept apart from the engine so wording can change without touching gameplay rules.
import type { Decision, GameState, RouteFacts, Zone } from './types.ts'
import { A1, CAPACITY, CREW, FOOD, POWER, ROVER, SCHEDULE, SUPPLY } from './scenario.ts'
import { roverEnergyNeed } from './reducer.ts'

export interface ZoneInfo { zone: Zone; name: string; route: RouteFacts | null; reason?: string }
export interface WorldFacts { zones: ZoneInfo[]; detourM?: number | null; detourReason?: string }
export interface OptionCopy { id: string; label: string; gain: string; risk: string; disabled?: boolean; reason?: string }
export interface DecisionCopy { eyebrow: string; title: string; intro: string; options: OptionCopy[]; note?: string; building?: string }

const km = (m: number) => `${(m / 1000).toFixed(1)} km`

export function decisionCopy(d: Decision, _s: GameState, world: WorldFacts): DecisionCopy {
  switch (d.key) {
    case 'A1': return {
      eyebrow: 'CHẶNG A1 · ĐIỆN VÀ NƯỚC', building: 'water',
      title: 'Hôm nay pin mặt trời làm ra một ít điện dư',
      intro: `Có thêm ${A1.surplusKwh} kWh điện. Nước đã dùng không biến mất: nó nằm trong bể chờ máy lọc biến lại thành nước sạch. Bạn dùng điện dư cho việc nào?`,
      options: [
        { id: 'recycle', label: 'Lọc thêm nước', gain: `Biến tối đa ${A1.extraRecycleL} lít nước đã dùng thành nước sạch.`, risk: 'Pin dự trữ không được sạc thêm.' },
        { id: 'battery', label: 'Sạc pin dự trữ', gain: `Cất thêm khoảng ${Math.round(A1.surplusKwh * A1.chargeEfficiency)} kWh vào pin.`, risk: 'Nước đã dùng vẫn chờ trong bể.' },
      ],
      note: 'Đây là bài hướng dẫn: lựa chọn nào cũng an toàn.',
    }
    case 'A3': return {
      eyebrow: 'CHẶNG A3 · GIÀN PIN MẶT TRỜI', building: 'solar',
      title: 'Bụi có thể bắn vào giàn pin!',
      intro: `Một tàu đổ bộ sắp hạ cánh gần căn cứ. Luồng khí của động cơ có thể hất bụi và sỏi vào giàn pin trong khoảng ${Math.round(SCHEDULE.a3HazardMin / 60)} giờ.`,
      options: [
        { id: 'keep', label: 'Giữ giàn pin mở', gain: 'Vẫn có điện suốt lúc nguy hiểm.', risk: `Giàn pin bị trầy: mất ${POWER.a3LossFraction * 100} % công suất mãi mãi, không sửa được.` },
        { id: 'stow', label: 'Thu gọn giàn pin', gain: 'Giàn pin an toàn, sau đó chạy lại đủ 100 %.', risk: `Không có điện từ pin mặt trời khoảng ${Math.round((SCHEDULE.a3PrepMin + SCHEDULE.a3HazardMin + SCHEDULE.a3RedeployMin) / 60)} giờ; căn cứ dùng pin dự trữ.` },
      ],
      note: 'Tình huống giả định cho trò chơi, không phải một sự kiện NASA có thật.',
    }
    case 'B1': return {
      eyebrow: 'NGHIÊN CỨU THỰC PHẨM · B1', building: 'greenhouse',
      title: 'Ống tưới trong nhà kính bị tắc',
      intro: 'Cây đang không được tưới. Càng thiếu nước lâu, cây càng yếu.',
      options: [
        { id: 'now', label: 'Sửa ngay', gain: `Cây chỉ thiếu nước khoảng ${SCHEDULE.b1RepairMin / 60} giờ nữa.`, risk: 'Một phi hành gia phải dừng việc đang làm.' },
        { id: 'later', label: 'Sửa sau ca làm việc', gain: 'Cả đội làm xong việc đang dở.', risk: `Cây thiếu nước khoảng ${Math.round((SCHEDULE.b1DelayMin + SCHEDULE.b1RepairMin) / 60)} giờ, có thể nhỏ hơn khi thu hoạch.` },
      ],
    }
    case 'C1': return {
      eyebrow: 'NGHIÊN CỨU BĂNG · C1', building: 'rover',
      title: 'Chọn khu để MILO khảo sát',
      intro: 'Bốn khu A–D đến từ dữ liệu NASA. Vùng tối vĩnh cửu (PSR) là nơi lạnh, có thể giữ băng, nhưng chưa ai xác nhận có băng ở đây.',
      options: world.zones.map((z) => ({ id: z.zone, label: `Khu ${z.zone} · ${z.name}`, gain: z.route ? `${z.route.inPsr ? 'Trong vùng tối vĩnh cửu (PSR)' : 'Không nằm trong PSR'} · tuyến ${km(z.route.lengthM)}.` : 'Không có tuyến an toàn.', risk: z.route ? `Đường xa thì tốn nhiều pin và thời gian hơn.` : z.reason ?? 'Chưa có tuyến đã kiểm tra.', disabled: !z.route, reason: z.route ? undefined : z.reason })),
    }
    case 'C2': {
      const zone = world.zones.find((z) => z.zone === d.context.zone)
      const r = zone?.route
      const need = r ? roverEnergyNeed(r.lengthM) : 0
      return {
        eyebrow: 'NGHIÊN CỨU BĂNG · C2', building: 'rover',
        title: `Tuyến tới khu ${d.context.zone}`,
        intro: r ? 'Đây là tuyến A* tính trên bản đồ độ dốc 5 m của NASA: mọi ô đều dốc ≤ 15°, không đi qua vùng thiếu dữ liệu. Đó là tuyến khả thi duy nhất đã kiểm tra.' : 'Không có tuyến khả thi.',
        options: [
          ...(r ? [{ id: 'go', label: `Đi tuyến A* · ${km(r.lengthM)}`, gain: `Cần khoảng ${Math.round(need)} kWh / ${ROVER.batteryKwh} kWh pin rover · khoảng ${Math.round(r.lengthM / 1000 / ROVER.speedKmh * 2)} giờ đi về.`, risk: `Dốc lớn nhất ${r.maxSlopeDeg.toFixed(1)}°; ${r.uncertainPercent.toFixed(0)} % quãng đường có thể vượt 15° nếu tính sai số đo. Chưa xét ánh sáng, nhiệt, liên lạc.`, disabled: need > ROVER.batteryKwh, reason: need > ROVER.batteryKwh ? 'Pin rover không đủ cho cả đi và về.' : undefined }] : []),
          { id: 'back', label: 'Chọn khu khác', gain: 'Xem lại các khu.', risk: 'Chưa xuất phát.' },
        ],
      }
    }
    case 'C31': return {
      eyebrow: 'NGHIÊN CỨU BĂNG · C3.1', building: 'rover',
      title: 'MILO gặp bãi đá vụn trên tuyến',
      intro: 'Camera của rover thấy đá vụn nhỏ hơn ô 5 m của bản đồ nên bản đồ không thể hiện. Tuyến cũ vẫn trong giới hạn độ dốc. (Tình huống giả định.)',
      options: [
        { id: 'slow', label: 'Đi tiếp chậm trên tuyến cũ', gain: 'Vẫn là tuyến đã kiểm tra độ dốc.', risk: `Chậm hơn và tốn thêm ${Math.round((ROVER.slowEnergyFactor - 1) * 100)} % pin cho phần đường còn lại.` },
        { id: 'detour', label: world.detourM ? `Đi vòng ${Math.round(world.detourM)} m` : 'Đi vòng', gain: 'Tránh hẳn bãi đá.', risk: world.detourM ? 'Đường dài hơn một chút. Đoạn vòng đã được kiểm tra trên DEM 5 m: dốc ≤ 15°, không có vùng thiếu dữ liệu.' : '', disabled: !world.detourM, reason: world.detourReason ?? 'Không tìm được đường vòng đủ an toàn trên dữ liệu NASA.' },
        { id: 'return', label: 'Quay về căn cứ', gain: 'An toàn nhất.', risk: 'Chưa đo được gì ở khu đã chọn.' },
      ],
    }
    case 'D1': return {
      eyebrow: 'SỰ KIỆN D1 · ÁNH SÁNG GIẢM', building: 'battery',
      title: 'Không đủ điện cho mọi thứ',
      intro: `Ánh sáng giảm trong 30 giờ. Giàn pin chỉ còn khoảng ${d.context.productionKw} kW${d.context.lost ? ' (đã mất 10 % công suất từ A3)' : ''}. Điện cho sự sống luôn được giữ trước. Phần còn lại không đủ cho cả hai việc:`,
      options: [
        { id: 'greenhouse', label: 'Ưu tiên đèn nhà kính', gain: 'Cây tiếp tục lớn, dữ liệu thực phẩm liền mạch hơn.', risk: 'Rover sạc chậm hoặc không sạc được, chuyến khảo sát có thể phải chờ.' },
        { id: 'rover', label: 'Ưu tiên sạc rover', gain: 'MILO có đủ pin để đi khảo sát.', risk: 'Đèn nhà kính có thể tắt nhiều giờ, cây lớn chậm hơn.' },
      ],
    }
    case 'D2': {
      const short = !d.context.roverAway && Number(d.context.roverBattery) < Number(d.context.tripKwh)
      return {
        eyebrow: 'SỰ KIỆN D2 · TIẾP TẾ', building: 'rover',
        title: 'Tàu tiếp tế đã hạ cánh ngoài căn cứ',
        intro: `Tàu mang ${SUPPLY.food / CREW} ngày thực phẩm cho cả đội và ${SUPPLY.water} lít nước. Hàng nặng nên phải chở bằng rover hoặc xe đẩy. Hàng chỉ vào kho khi về tới căn cứ. Ai sẽ đi lấy?`,
        options: [
          { id: 'rover', label: 'Dùng rover MILO', gain: 'Phi hành đoàn không phải ra ngoài.', risk: d.context.roverAway ? 'MILO đang đi khảo sát: phải quay về, đổi cấu hình rồi mới chở hàng. Khảo sát băng bị gián đoạn.' : `Đổi cấu hình, đi và về mất khoảng ${Math.round((2 * SCHEDULE.d2RoverConfigMin) / 60 + 2 * SCHEDULE.d2PadKm / ROVER.speedKmh + 1)} giờ, tốn khoảng ${d.context.tripKwh} kWh pin rover.`, disabled: short, reason: short ? `Pin MILO còn ${d.context.roverBattery} kWh, chưa đủ ${d.context.tripKwh} kWh cho chuyến đi.` : undefined },
          { id: 'crew', label: 'Hai phi hành gia với xe đẩy', gain: 'Rover tiếp tục việc của mình.', risk: `Ra ngoài khoảng ${SCHEDULE.d2CrewPickupMin / 60} giờ, cả đội dùng thêm oxy.` },
        ],
      }
    }
    case 'D3': return {
      eyebrow: 'SỰ KIỆN D3 · BỨC XẠ', building: 'shelter',
      title: 'MILO đang đo khi có bão bức xạ',
      intro: 'Cả đội đã vào nơi trú ẩn. Bức xạ làm nhiễu máy đo neutron (dùng để tìm hydro), nhưng không ảnh hưởng máy đo nhiệt và máy quang phổ. Các mẫu đã đo trước đó vẫn được giữ.',
      options: [
        { id: 'wait', label: 'Chờ hết bức xạ rồi đo lại', gain: 'Có thêm mẫu neutron sạch.', risk: 'Chuyến khảo sát kéo dài hơn, tốn thêm pin rover.' },
        { id: 'return', label: 'Kết thúc khảo sát và về', gain: 'MILO về sớm và an toàn.', risk: 'Ít mẫu neutron hơn, báo cáo kém chắc chắn hơn.' },
      ],
    }
  }
}

// ── ending report ───────────────────────────────────────────────────────────
export interface BranchReport { done: boolean; status: string; result: string[]; events: string[]; why: string[] }
export function endingReport(s: GameState): { food: BranchReport; ice: BranchReport; reason: string; base: string[] } {
  const f = s.food, i = s.ice
  const tagged = (tags: string[]) => s.log.filter((e) => e.tag && tags.includes(e.tag) && ['decision', 'consequence', 'event'].includes(e.kind)).map((e) => e.title)
  const food: BranchReport = f.report ? {
    done: true, status: 'Hoàn thành',
    result: [`Cân mẫu: ${f.report.grams} g (cây khỏe mạnh khoảng ${f.report.expected} g).`, `Mức sinh trưởng: ${f.report.growthPercent} %.`, `Độ tin cậy của dữ liệu: ${f.report.reliability}.`, 'Đây là kết quả nghiên cứu, không phải nguồn thức ăn đủ nuôi cả đội.'],
    events: tagged(['B1', 'B2', 'D1', 'A3']), why: f.report.reasons,
  } : { done: false, status: f.stage === 'harvested' ? 'Đã thu hoạch, chưa lập báo cáo' : 'Chưa hoàn thành', result: [`Cây đã lớn ${Math.round(f.growth * 100)} %${f.growth < FOOD.readyIndex ? ' (chưa đủ để thu hoạch)' : ''}.`, `${f.observations.length} lần quan sát.`], events: tagged(['B1', 'B2', 'D1']), why: f.waterStressMin ? [`Cây thiếu nước ${Math.round(f.waterStressMin / 60)} giờ.`] : [] }
  const ice: BranchReport = i.report ? {
    done: true, status: 'Hoàn thành',
    result: [`Khu ${i.zone}${i.route ? ` · ${i.route.name}` : ''}.`, `Dữ liệu NASA (đo thật): ${i.route?.inPsr ? 'nằm trong vùng tối vĩnh cửu' : 'không nằm trong vùng tối vĩnh cửu'}, độ dốc tại điểm ${i.route?.slopeDeg.toFixed(1)}°.`, `Kết quả mô phỏng trong game: chỉ số hydro ${i.report.meanIndex} từ ${i.report.validNeutron} mẫu hợp lệ (${i.report.invalidNeutron} mẫu bị loại).`, `Độ tin cậy: ${i.report.confidence}. Băng vẫn CHƯA được xác nhận.`],
    events: tagged(['C3.1', 'D2', 'D3']), why: i.report.reasons,
  } : { done: false, status: i.stage === 'idle' || i.stage === 'locked' ? 'Chưa bắt đầu' : 'Chưa hoàn thành', result: i.zone ? [`Khu đã chọn: ${i.zone}.`, `${i.samples.filter((x) => x.valid && x.instrument === 'neutron').length} mẫu neutron hợp lệ đã thu.`] : ['MILO chưa đi khảo sát.'], events: tagged(['C3.1', 'D2', 'D3']), why: roverReason(s) }
  const base = [
    `Giàn pin: ${s.power.capacityFactor < 1 ? `còn ${Math.round(s.power.capacityFactor * 100)} % công suất vì giữ giàn pin mở ở A3` : '100 % công suất'}.`,
    `Kho: điện ${Math.round(s.resources.battery)}/${CAPACITY.battery} kWh · nước ${Math.round(s.resources.water)} L · oxy ${Math.round(s.resources.oxygen)} kg.`,
  ]
  return { food, ice, base, reason: s.ending?.reason === 'food' ? 'Kho thực phẩm đóng gói chạm mức dự trữ nên nhiệm vụ phải kết thúc.' : 'Bạn đã nộp báo cáo và cho cả đội trở về.' }
}
function roverReason(s: GameState) {
  const out: string[] = []
  if (s.supply.method === 'rover') out.push('MILO phải chở hàng tiếp tế (D2), chuyến khảo sát bị gián đoạn.')
  if (s.power.d1Priority === 'greenhouse') out.push('Lúc thiếu điện (D1) bạn ưu tiên nhà kính nên rover sạc chậm hơn.')
  if (s.ice.stage === 'charging') out.push('MILO đang chờ sạc đủ pin cho cả chuyến đi và về.')
  return out
}
