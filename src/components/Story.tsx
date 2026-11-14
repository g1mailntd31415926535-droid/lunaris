// Story Mode UI: opening, decisions, research cards, mission log, return and ending.
// Everything here reads the one GameState; actions go back through the reducer.
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, BatteryCharging, Check, CircleAlert, Clock3, Eye, FlaskConical, Gauge, Lightbulb, Microscope, Rocket, Scale, ScrollText, Send, ShieldCheck, Sprout, TriangleAlert } from 'lucide-react'
import { Modal } from './Common'
import { CAPACITY, CREW, DAY, FOOD, LIFE, MISSION_START, ROVER, decisionCopy, endingReport, missionTime } from '../game'
import type { Decision, GameState, PlayMode, WorldFacts } from '../game'

export type StoryAction = 'a2' | 'observe' | 'harvest' | 'report' | 'ice' | 'submit' | 'follow'

const clock = (minute: number) => { const t = MISSION_START.minuteOfDay + Math.floor(minute); return `Ngày ${Math.floor(minute / DAY) + 1} · ${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }

// ── opening ─────────────────────────────────────────────────────────────────
export function OpeningCinematic({ onStart }: { onStart: (mode: PlayMode) => void }) {
  return <motion.div className="story-opening" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.div className="story-opening-card glass" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6, duration: 0.8 }}>
      <span className="eyebrow">LUNARIS · STORY MODE</span>
      <h1>Chào mừng tới căn cứ Artemis</h1>
      <p>Bạn sẽ điều hành một căn cứ nhỏ ở cực Nam Mặt Trăng cùng 6 phi hành gia. Hãy giữ cho điện, nước, oxy luôn đủ, chăm vườn cây nghiên cứu và cùng rover MILO đi tìm dấu hiệu của băng.</p>
      <p className="story-muted">Địa hình là dữ liệu NASA LOLA thật. Số liệu điện, nước, oxy, thực phẩm là số giả định của trò chơi.</p>
      <div className="story-modes">
        <button onClick={() => onStart('basic')}><Lightbulb size={20} /><strong>Cơ bản</strong><span>Có Commander Luna hướng dẫn. Thời gian tự dừng khi cần quyết định.</span></button>
        <button onClick={() => onStart('advanced')}><Gauge size={20} /><strong>Nâng cao</strong><span>Không có hướng dẫn. Thời gian vẫn trôi khi bạn suy nghĩ.</span></button>
      </div>
    </motion.div>
  </motion.div>
}

// ── decisions ───────────────────────────────────────────────────────────────
export function DecisionDialog({ decision, game, world, onChoose, onInspect }: { decision: Decision; game: GameState; world: WorldFacts; onChoose: (choice: string) => void; onInspect: () => void }) {
  const copy = decisionCopy(decision, game, world)
  return <Modal title={copy.title} eyebrow={`${copy.eyebrow} · ${clock(decision.atMinute)}`} onClose={onInspect} className="game-modal story-decision">
    <p className="dialog-intro">{copy.intro}</p>
    <div className="story-options">{copy.options.map((o) => <button key={o.id} className="story-option" disabled={o.disabled} onClick={() => onChoose(o.id)}>
      <strong>{o.label}</strong>
      <span className="gain"><Check size={13} /> {o.gain}</span>
      {o.risk && <span className="risk"><TriangleAlert size={13} /> {o.risk}</span>}
      {o.disabled && o.reason && <span className="blocked"><CircleAlert size={13} /> {o.reason}</span>}
    </button>)}</div>
    {copy.note && <p className="game-muted"><FlaskConical size={12} /> {copy.note}</p>}
    <div className="game-actions"><button className="secondary-action" onClick={onInspect}><Eye size={14} /> Xem trong căn cứ trước</button>{game.mode === 'advanced' && <span className="story-muted"><Clock3 size={12} /> Thời gian vẫn đang trôi</span>}</div>
  </Modal>
}

export function PendingDecisionChip({ decision, game, world, onOpen }: { decision: Decision; game: GameState; world: WorldFacts; onOpen: () => void }) {
  return <button className="story-pending glass" onClick={onOpen}><TriangleAlert size={15} /><span><small>ĐANG CHỜ BẠN QUYẾT ĐỊNH</small>{decisionCopy(decision, game, world).title}</span><ArrowRight size={14} /></button>
}

// ── building cards (inside the base panel) ──────────────────────────────────
export function StoryCard({ building, game, onStory }: { building: string; game: GameState; onStory: (a: StoryAction) => void }) {
  const f = game.food, i = game.ice, free = game.stage === 'free', sheltered = game.radiation.active
  if (building === 'oxygen') return <div className="a1-card"><small>CHẶNG A2 · NƯỚC + ĐIỆN → OXY</small>{game.a2Enabled ? <p><Check size={13} /> Máy điện phân đang {game.power.electrolysisOn ? 'chạy' : 'chờ (oxy đã đủ hoặc thiếu điện/nước)'}. Mỗi kg oxy cần {LIFE.waterLPerKgO2} lít nước.</p> : <><p>Máy điện phân tách nước thành oxy để thở và hydro.</p><button className="building-action" disabled={game.stage !== 'A2'} onClick={() => onStory('a2')}><Sprout size={15} /><span>{game.stage === 'A2' ? 'Bật máy điện phân' : 'Mở ở chặng A2'}</span><ArrowRight size={15} /></button></>}</div>
  if (building === 'greenhouse') return <div className="a1-card"><small>NGHIÊN CỨU THỰC PHẨM · B1–B4</small>
    <p>Cây lớn {Math.round(f.growth * 100)} % · tưới: {f.irrigation === 'ok' ? 'bình thường' : f.irrigation === 'repairing' ? 'đang sửa' : 'HỎNG'} · đèn: {game.power.greenhouseOn ? 'bật' : 'TẮT'} · {f.observations.length} lần quan sát</p>
    {f.stage === 'growing' && <><button className="building-action" disabled={!free || sheltered} onClick={() => onStory('observe')}><Microscope size={15} /><span>{sheltered ? 'Đang trú bức xạ' : 'Quan sát cây (thiết bị tự ghi)'}</span><ArrowRight size={15} /></button>
      <button className="building-action" disabled={!free || f.growth < FOOD.readyIndex || sheltered} onClick={() => onStory('harvest')}><Scale size={15} /><span>{f.growth < FOOD.readyIndex ? `Thu hoạch khi cây lớn ${Math.round(FOOD.readyIndex * 100)} %` : 'Thu hoạch và cân mẫu'}</span><ArrowRight size={15} /></button></>}
    {f.stage === 'harvested' && <button className="building-action" onClick={() => onStory('report')}><ScrollText size={15} /><span>Lập báo cáo thực phẩm</span><ArrowRight size={15} /></button>}
    {f.report && <p><Check size={13} /> Báo cáo xong: {f.report.grams} g, độ tin cậy {f.report.reliability}.</p>}
    <p className="game-muted">Cây nghiên cứu, không phải nguồn thức ăn của cả đội.</p></div>
  if (building === 'rover') return <div className="a1-card"><small>NGHIÊN CỨU BĂNG · C1–C4</small>
    <p>{iceText(game)}</p>
    <p className="game-muted"><BatteryCharging size={12} /> Pin MILO {Math.round(i.roverBattery)}/{ROVER.batteryKwh} kWh{game.power.roverChargingOn ? ' · đang sạc' : ''}</p>
    {i.stage === 'idle' && <button className="building-action" disabled={!free || game.supply.roverPhase !== 'none'} onClick={() => onStory('ice')}><Rocket size={15} /><span>{i.report ? 'Đã hoàn thành' : 'Bắt đầu nghiên cứu băng'}</span><ArrowRight size={15} /></button>}
    {['outbound', 'surveying', 'returning', 'recalled', 'anomaly'].includes(i.stage) && <button className="building-action" onClick={() => onStory('follow')}><Eye size={15} /><span>Theo dõi MILO</span><ArrowRight size={15} /></button>}</div>
  if (building === 'command') return <div className="a1-card"><small>KẾT THÚC NHIỆM VỤ</small><p>Bạn có thể nộp báo cáo và đưa cả đội về Trái Đất bất cứ lúc nào sau phần hướng dẫn.</p><button className="building-action" disabled={!free || game.phase !== 'playing'} onClick={() => onStory('submit')}><Send size={15} /><span>Nộp báo cáo và trở về</span><ArrowRight size={15} /></button></div>
  if (building === 'solar') return <div className="a1-card"><small>GIÀN PIN MẶT TRỜI</small><p>Đang phát {game.power.productionKw.toFixed(1)} kW · công suất thiết kế {Math.round(game.power.capacityFactor * 100)} %{game.power.capacityFactor < 1 ? ' (đã hư ở A3, không sửa được)' : ''}{game.power.lightFactor < 1 ? ' · ánh sáng đang giảm' : ''}.</p></div>
  if (building === 'battery') return <div className="a1-card"><small>ĐIỆN CỦA CĂN CỨ</small><p>Phát {game.power.productionKw.toFixed(1)} kW · dùng {game.power.loadKw.toFixed(1)} kW. Điện thiết yếu luôn được giữ; đèn nhà kính và sạc rover là tải tùy chọn.</p></div>
  if (building === 'shelter' && sheltered) return <div className="a1-card"><small>BỨC XẠ</small><p><ShieldCheck size={13} /> Cả đội đang trú ẩn tới {clock(game.radiation.endsAt ?? 0)}.</p></div>
  return null
}

export function iceText(g: GameState) {
  const i = g.ice
  const km = (m: number) => (m / 1000).toFixed(1)
  switch (i.stage) {
    case 'locked': return 'Mở sau phần hướng dẫn.'
    case 'idle': return i.report ? `Đã khảo sát khu ${i.zone}.` : 'MILO sẵn sàng. Chọn một khu nghiên cứu.'
    case 'site': case 'route': return 'Đang chờ bạn chọn khu và tuyến.'
    case 'charging': return `Đang sạc pin cho chuyến tới khu ${i.zone}.`
    case 'outbound': return `Đang đến khu ${i.zone}: ${km(i.distanceM)} / ${km((i.route?.lengthM ?? 0) + i.detourM)} km${i.slow ? ' (đi chậm)' : ''}.`
    case 'anomaly': return 'Dừng trước bãi đá vụn, chờ quyết định.'
    case 'surveying': return `Đang khảo sát khu ${i.zone}: ${Math.floor(i.surveyMin / 60)}/${Math.ceil(i.surveyTargetMin / 60)} giờ · ${i.samples.filter((x) => x.valid).length} mẫu hợp lệ.`
    case 'returning': return `Đang về căn cứ: còn ${km(i.distanceM)} km.`
    case 'recalled': return `Được gọi về để chở hàng: còn ${km(i.distanceM)} km.`
    case 'cargo': return 'Đang làm rover vận tải cho chuyến tiếp tế.'
    case 'done': return `Đã khảo sát xong khu ${i.zone}.`
  }
}

// ── missions panel ──────────────────────────────────────────────────────────
type Step = { tag: string; label: string; state: 'done' | 'active' | 'todo' }
export function StoryMissions({ game, onStory, onFocus }: { game: GameState; onStory: (a: StoryAction) => void; onFocus: (id: 'greenhouse' | 'rover' | 'oxygen' | 'command' | 'solar') => void }) {
  const has = (tag: string) => game.log.some((e) => e.tag === tag)
  const decided = (key: string) => game.history.some((h) => h.key === key)
  const st = (done: boolean, active: boolean): Step['state'] => done ? 'done' : active ? 'active' : 'todo'
  const tutorial: Step[] = [
    { tag: 'A1', label: 'Điện dư: lọc nước hay sạc pin', state: st(decided('A1'), game.stage === 'A1') },
    { tag: 'A2', label: 'Bật máy điện phân tạo oxy', state: st(game.a2Enabled, game.stage === 'A2') },
    { tag: 'A3', label: 'Bảo vệ giàn pin khỏi bụi (ngày 3)', state: st(game.stage === 'free', game.stage === 'A3') },
  ]
  const f = game.food, i = game.ice
  const food: Step[] = [
    { tag: 'B1', label: 'Sự cố tưới nước', state: st(decided('B1'), has('B1')) },
    { tag: 'B2', label: 'Đèn nhà kính tự ghi theo điện', state: st(f.stage !== 'growing', game.stage === 'free') },
    { tag: 'B3', label: `Quan sát cây (${f.observations.length} lần, ${new Set(f.observations.map((o) => o.day)).size} ngày)`, state: st(new Set(f.observations.map((o) => o.day)).size >= FOOD.minObservationDays, game.stage === 'free') },
    { tag: 'B4', label: 'Thu hoạch, cân mẫu, báo cáo', state: st(!!f.report, f.stage === 'harvested' || f.growth >= FOOD.readyIndex) },
  ]
  const ice: Step[] = [
    { tag: 'C1', label: `Chọn khu nghiên cứu${i.zone ? `: ${i.zone}` : ''}`, state: st(!!i.zone, i.stage === 'site') },
    { tag: 'C2', label: 'Chọn tuyến khả thi', state: st(!!i.route, i.stage === 'route') },
    { tag: 'C3', label: 'Đi, xử lý tình huống, khảo sát', state: st(['returning', 'done'].includes(i.stage) || !!i.report, ['charging', 'outbound', 'anomaly', 'surveying'].includes(i.stage)) },
    { tag: 'C4', label: 'Về căn cứ an toàn, báo cáo băng', state: st(!!i.report, i.stage === 'returning') },
  ]
  const events: Step[] = [
    { tag: 'D1', label: 'Ánh sáng giảm', state: st(game.fired.includes('D1-end'), game.power.lightFactor < 1) },
    { tag: 'D2', label: 'Tiếp tế', state: st(game.supply.stage === 'delivered', ['announced', 'waiting', 'pickup'].includes(game.supply.stage)) },
    { tag: 'D3', label: 'Bức xạ Mặt Trời', state: st(game.fired.includes('D3') && !game.radiation.active, game.radiation.active) },
  ]
  const daysLeft = Math.max(0, (game.resources.food - LIFE.foodReserveCrewDays) / CREW)
  const list = (title: string, steps: Step[], action?: { label: string; onClick: () => void; disabled?: boolean }) => <section className="story-steps"><h4>{title}</h4><ul>{steps.map((s) => <li key={s.tag} className={s.state}><span>{s.state === 'done' ? <Check size={11} /> : s.tag}</span>{s.label}</li>)}</ul>{action && <button className="secondary-action" disabled={action.disabled} onClick={action.onClick}>{action.label}<ArrowRight size={13} /></button>}</section>
  return <>
    <div className="panel-title"><div><h2>Nhiệm vụ Artemis</h2><p>{game.mode === 'basic' ? 'Chế độ Cơ bản' : game.mode === 'advanced' ? 'Chế độ Nâng cao' : ''} · {missionTime(game).label} ngày {missionTime(game).day}</p></div></div>
    <div className="story-food-days" style={{ '--days': `${Math.min(100, daysLeft / 8 * 100)}%` } as CSSProperties}><span>Thực phẩm đóng gói còn đủ cho</span><strong>{daysLeft.toFixed(1)} ngày</strong><small>trước mức dự trữ tối thiểu · quyết định độ dài nhiệm vụ</small></div>
    {list('Hướng dẫn', tutorial, game.stage === 'A2' ? { label: 'Đến trạm hỗ trợ sự sống', onClick: () => onFocus('oxygen') } : undefined)}
    {list('Nghiên cứu thực phẩm', food, { label: 'Đến nhà kính', onClick: () => onFocus('greenhouse') })}
    {list('Nghiên cứu băng', ice, i.stage === 'idle' && !i.report ? { label: 'Bắt đầu với MILO', onClick: () => onStory('ice'), disabled: game.stage !== 'free' } : { label: 'Đến trạm rover', onClick: () => onFocus('rover') })}
    {list('Sự kiện chung', events)}
    <button className="primary-button story-submit" disabled={game.stage !== 'free' || game.phase !== 'playing'} onClick={() => onStory('submit')}><Send size={15} /> Nộp báo cáo và trở về Trái Đất</button>
  </>
}

// ── mission log (timeline dialog) ───────────────────────────────────────────
export function MissionLogDialog({ game, onClose }: { game: GameState; onClose: () => void }) {
  const byId = new Map(game.log.map((e) => [e.id, e]))
  const decisionTitle = (id: string) => { const h = game.history.find((x) => x.id === id); return h ? `${h.key}: ${game.log.find((e) => e.kind === 'decision' && e.causeIds.includes(id))?.title ?? h.choice}` : id }
  return <Modal title="Nhật ký nhân quả" eyebrow="DÒNG THỜI GIAN NHIỆM VỤ" onClose={onClose} className="game-modal timeline-modal">
    <ol className="story-log">{[...game.log].reverse().map((e) => <li key={e.id} className={`kind-${e.kind}`}>
      <small>{clock(e.atMinute)}{e.tag ? ` · ${e.tag}` : ''}</small><strong>{e.title}</strong>{e.detail && <p>{e.detail}</p>}
      {e.deltas && <p className="story-muted">{Object.entries(e.deltas).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}`).join(' · ')}</p>}
      {e.kind !== 'decision' && e.causeIds.length > 0 && <p className="story-cause">Vì: {e.causeIds.map((c) => byId.get(c)?.title ?? decisionTitle(c)).join('; ')}</p>}
    </li>)}</ol>
    <button className="primary-button" onClick={onClose}>Đóng<ArrowRight size={14} /></button>
  </Modal>
}

// ── return + ending ─────────────────────────────────────────────────────────
export function ReturnCinematic({ reason }: { reason: string }) {
  return <motion.div className="story-return" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}><Rocket size={34} /><h2>Cả đội đang trở về Trái Đất</h2><p>{reason}</p></motion.div>
  </motion.div>
}

export function EndingScreen({ game, onRestart }: { game: GameState; onRestart: () => void }) {
  const report = endingReport(game)
  const branch = (title: string, icon: ReactNode, b: ReturnType<typeof endingReport>['food']) => <section className={`story-branch ${b.done ? 'done' : 'todo'}`}>
    <header>{icon}<h3>{title}</h3><span>{b.status}</span></header>
    <h4>Kết quả</h4><ul>{b.result.map((r) => <li key={r}>{r}</li>)}</ul>
    {b.events.length > 0 && <><h4>Sự kiện đã ảnh hưởng</h4><ul>{b.events.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
    <h4>Tại sao điều này xảy ra?</h4><ul>{(b.why.length ? b.why : ['Chưa có dữ liệu để giải thích.']).map((r) => <li key={r}>{r}</li>)}</ul>
  </section>
  return <motion.div className="story-ending" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <div className="story-ending-card glass">
      <span className="eyebrow">KẾT QUẢ NHIỆM VỤ · {clock(game.ending?.atMinute ?? game.clock.elapsedMinutes)}</span>
      <h1>Chào mừng về nhà!</h1><p>{report.reason}</p>
      <div className="story-branches">{branch('Nghiên cứu thực phẩm', <Sprout size={18} />, report.food)}{branch('Nghiên cứu băng', <Microscope size={18} />, report.ice)}</div>
      <section className="story-base"><h4>Căn cứ</h4><ul>{report.base.map((r) => <li key={r}>{r}</li>)}</ul></section>
      <p className="story-muted">Địa hình, vùng tối vĩnh cửu và tuyến rover dùng dữ liệu NASA. Điện, nước, oxy, thực phẩm và kết quả đo của MILO là mô phỏng trong trò chơi. Băng chưa được xác nhận ở bất kỳ khu nào.</p>
      <button className="primary-button" onClick={onRestart}>Chơi lại<ArrowRight size={14} /></button>
    </div>
  </motion.div>
}

/** Commander Luna (Basic mode only): one hint about what to do next, from the state. */
export function lunaHint(g: GameState): string {
  if (g.decisions.length) return 'Có một quyết định đang chờ bạn. Đọc kỹ điều được và điều mất nhé!'
  if (g.stage === 'A2') return 'Máy điện phân biến nước thành oxy. Hãy chạm vào trạm hỗ trợ sự sống và bật máy!'
  if (g.stage === 'A3') return 'Mọi thứ đang chạy tự động. Hãy cho thời gian trôi (▶) và theo dõi điện, nước, oxy nhé.'
  if (g.radiation.active) return 'Bão bức xạ! Cả đội ở trong nhà trú ẩn cho an toàn. Rover thì không cần trú.'
  if (g.food.irrigation !== 'ok') return 'Cây đang thiếu nước. Thời gian thiếu nước càng dài, cây càng yếu.'
  if (g.food.stage === 'growing' && !g.food.observations.some((o) => o.day === Math.floor(g.clock.elapsedMinutes / DAY) + 1)) return 'Hôm nay chưa ai quan sát cây. Vào nhà kính và bấm “Quan sát cây” nhé.'
  if (g.food.stage === 'harvested') return 'Đã thu hoạch! Lập báo cáo thực phẩm ở nhà kính.'
  if (g.ice.stage === 'idle' && !g.ice.report) return 'MILO đang chờ. Vào trạm rover để chọn khu nghiên cứu băng.'
  if (g.food.report && g.ice.report) return 'Cả hai nghiên cứu đã xong! Bạn có thể nộp báo cáo ở trung tâm chỉ huy.'
  return `Kho thực phẩm còn đủ khoảng ${Math.max(0, (g.resources.food - LIFE.foodReserveCrewDays) / CREW).toFixed(1)} ngày. Hãy hoàn thành nghiên cứu trước khi phải về.`
}
export const resourcePercent = (g: GameState) => ({
  battery: Math.round(g.resources.battery / CAPACITY.battery * 100),
  water: Math.round(g.resources.water / CAPACITY.water * 100),
  oxygen: Math.round(g.resources.oxygen / CAPACITY.oxygen * 100),
  foodDays: Math.max(0, g.resources.food / CREW),
})
