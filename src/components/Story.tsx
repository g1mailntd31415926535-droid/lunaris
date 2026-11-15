// Story Mode UI: opening, decisions, research cards, mission log, return and ending.
// Everything here reads the one GameState; actions go back through the reducer.
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, BatteryCharging, BookOpen, Wrench, Check, CircleAlert, Clock3, Eye, FlaskConical, Gauge, Lightbulb, Microscope, Rocket, Scale, ScrollText, Send, ShieldCheck, Sprout, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Modal } from './Common'
import { EventHeader, GamePanel, ResourceBar, ResultSection } from './GamePanel'
import { DialogueActionButton } from './Onboarding'
import { CAPACITY, CREW, DAY, FOOD, LIFE, MISSION_START, ROVER, b1Resolved, decisionCopy, endingReport, missionTime, reviewFor, roverEnergyNeed, EVENT_TOPIC } from '../game'
import type { Decision, GameState, PlayMode, WorldFacts } from '../game'

export type StoryAction = 'a2' | 'observe' | 'harvest' | 'report' | 'ice' | 'food' | 'repair' | 'submit' | 'follow'

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
  const [picked, setPicked] = useState<string | null>(null)
  const code = decision.key === 'C31' ? 'C3.1' : decision.key
  return <GamePanel label={copy.title} className="decision-panel story-decision" footer={<button className="gp-secondary" onClick={onInspect}><Eye size={14} /> Xem căn cứ</button>}>
    <EventHeader code={code} topic={EVENT_TOPIC[decision.key]} time={clock(decision.atMinute).toUpperCase()} onClose={onInspect} />
    <h2 className="gp-title">{copy.title}</h2>
    {copy.intro && <p className="gp-intro">{copy.intro}</p>}
    {copy.question && <p className="gp-question">{copy.question}</p>}
    <div className="gp-options" role="radiogroup" aria-label="Các lựa chọn">{copy.options.map((o) => <button key={o.id} role="radio" aria-checked={picked === o.id} className={`gp-option story-option ${picked === o.id ? 'selected' : ''}`} disabled={o.disabled} onClick={() => setPicked(o.id)}>
      <span className="gp-option-text"><strong>{o.label}</strong>
        {o.desc && <small>{o.desc}</small>}
        {!o.desc && o.gain && <small className="gain"><Check size={12} /> {o.gain}</small>}
        {!o.desc && o.risk && <small className="risk"><TriangleAlert size={12} /> {o.risk}</small>}
        {o.disabled && o.reason && <small className="blocked"><CircleAlert size={12} /> {o.reason}</small>}</span>
      {o.preview && <span className="gp-option-bars">{o.preview.map((p) => <ResourceBar key={p.key} k={p.key} before={p.before} after={p.after} emphasis={picked === o.id || picked === null} />)}</span>}
    </button>)}</div>
    {copy.note && <p className="gp-note"><FlaskConical size={12} /> {copy.note}</p>}
    {game.mode === 'advanced' && <p className="gp-note"><Clock3 size={12} /> Thời gian vẫn đang trôi</p>}
    <DialogueActionButton label="Xác nhận" disabled={!picked} onClick={() => picked && onChoose(picked)} />
  </GamePanel>
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
    {!f.started && <button className="building-action" disabled={!free} onClick={() => onStory('food')}><Sprout size={15} /><span>{free ? 'Bắt đầu nghiên cứu thực phẩm' : 'Mở sau phần hướng dẫn'}</span><ArrowRight size={15} /></button>}
    {f.started && !game.history.some((h) => h.key === 'B1') && <p className="game-muted">Đang theo dõi cây. Hãy để thời gian trôi.</p>}
    {f.irrigation === 'fault' && f.repairStartsAt !== null && f.repairStartsAt > game.clock.elapsedMinutes && <><p className="game-warn"><TriangleAlert size={13} /> Hệ thống tưới đang hỏng. Theo kế hoạch sẽ sửa lúc {clock(f.repairStartsAt).split(' · ')[1]}.</p>
      <button className="building-action" disabled={sheltered} onClick={() => onStory('repair')}><Wrench size={15} /><span>{sheltered ? 'Đang trú bức xạ, chưa ra sửa được' : 'Sửa ngay bây giờ'}</span><ArrowRight size={15} /></button>
      <p className="game-muted">Một phi hành gia dừng việc đang làm khoảng 2 giờ. Số giờ cây đã thiếu nước không lấy lại được.</p></>}
    {f.irrigation === 'repairing' && <p className="game-muted"><Wrench size={12} /> Đang sửa hệ thống tưới.</p>}
    {f.stage === 'growing' && f.started && game.history.some((h) => h.key === 'B1') && <><button className="building-action" disabled={!free || sheltered} onClick={() => onStory('observe')}><Microscope size={15} /><span>{sheltered ? 'Đang trú bức xạ' : 'Quan sát cây (thiết bị tự ghi)'}</span><ArrowRight size={15} /></button>
      <button className="building-action" disabled={!free || f.growth < FOOD.readyIndex || sheltered} onClick={() => onStory('harvest')}><Scale size={15} /><span>{f.growth < FOOD.readyIndex ? `Thu hoạch khi cây lớn ${Math.round(FOOD.readyIndex * 100)} %` : 'Thu hoạch và cân mẫu'}</span><ArrowRight size={15} /></button></>}
    {f.stage === 'harvested' && <button className="building-action" onClick={() => onStory('report')}><ScrollText size={15} /><span>Lập báo cáo thực phẩm</span><ArrowRight size={15} /></button>}
    {f.report && <p><Check size={13} /> Báo cáo xong: {f.report.grams} g, độ tin cậy {f.report.reliability}.</p>}
    <p className="game-muted">Cây nghiên cứu, không phải nguồn thức ăn của cả đội.</p></div>
  if (building === 'rover') return <div className="a1-card"><small>NGHIÊN CỨU BĂNG · C1–C4</small>
    <p>{iceText(game)}</p>
    <p className="game-muted"><BatteryCharging size={12} /> Pin MILO {Math.round(i.roverBattery)}/{ROVER.batteryKwh} kWh{game.power.roverChargingOn ? ' · đang sạc' : ''}</p>
    {i.stage === 'idle' && !i.report && (() => { const wait = game.mode === 'basic' && !b1Resolved(game); return <><button className="building-action" disabled={!free || game.supply.roverPhase !== 'none' || wait} onClick={() => onStory('ice')}><Rocket size={15} /><span>Bắt đầu khám phá băng</span><ArrowRight size={15} /></button>{wait && free && <p className="game-muted">Mở sau khi xử lý xong sự cố đầu tiên ở nhà kính (B1): mình hướng dẫn từng nhiệm vụ một.</p>}</> })()}
    {['outbound', 'surveying', 'returning', 'recalled', 'anomaly'].includes(i.stage) && <button className="building-action" onClick={() => onStory('follow')}><Eye size={15} /><span>Theo dõi MILO</span><ArrowRight size={15} /></button>}</div>
  if (building === 'command') return <div className="a1-card"><small>KẾT THÚC NHIỆM VỤ</small><p>Bạn có thể nộp báo cáo và đưa cả đội về Trái Đất bất cứ lúc nào sau phần hướng dẫn.</p><button className="building-action" disabled={!free || game.phase !== 'playing'} onClick={() => onStory('submit')}><Send size={15} /><span>Nộp báo cáo và trở về</span><ArrowRight size={15} /></button></div>
  if (building === 'solar') { const stowed = game.power.stowedUntil !== null && game.clock.elapsedMinutes < game.power.stowedUntil; return <div className="a1-card"><small>GIÀN PIN MẶT TRỜI</small>
    <p>Trạng thái: {stowed ? `đang thu gọn, mở lại lúc ${clock(game.power.stowedUntil ?? 0).split(' · ')[1]}` : game.power.capacityFactor < 1 ? 'bề mặt bị trầy, còn 90 % công suất' : 'hoạt động bình thường'}.</p>
    <p>Đang phát {game.power.productionKw.toFixed(1)} kW{game.power.lightFactor < 1 ? ' · ánh sáng đang giảm' : ''}.</p>
    {game.power.capacityFactor < 1 && <p className="game-muted"><Wrench size={12} /> Không bảo trì được trong nhiệm vụ này: tấm pin bị trầy phải thay tấm mới mang từ Trái Đất. Hậu quả của lựa chọn ở A3 được giữ nguyên.</p>}</div> }
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
    { tag: 'A3', label: 'Bảo vệ giàn pin khỏi mảnh đá nhỏ', state: st(game.stage === 'free', game.stage === 'A3') },
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
    {list('Nghiên cứu thực phẩm', food, !f.started ? { label: 'Bắt đầu nghiên cứu', onClick: () => onStory('food'), disabled: game.stage !== 'free' } : { label: 'Đến nhà kính', onClick: () => onFocus('greenhouse') })}
    {list('Nghiên cứu băng', ice, i.stage === 'idle' && !i.report ? { label: 'Bắt đầu khám phá', onClick: () => onStory('ice'), disabled: game.stage !== 'free' } : { label: 'Đến trạm rover', onClick: () => onFocus('rover') })}
    {list('Sự kiện chung', events)}
    <button className="primary-button story-submit" disabled={game.stage !== 'free' || game.phase !== 'playing'} onClick={() => onStory('submit')}><Send size={15} /> Nộp báo cáo và trở về Trái Đất</button>
  </>
}

// ── result review (reference 7; no timeout: waits for "Tiếp tục") ──────────
export function ReviewPanel({ entryId, game, onContinue }: { entryId: string; game: GameState; onContinue: () => void }) {
  const entry = game.log.find((e) => e.id === entryId)
  if (!entry) return null
  const r = reviewFor(entry, game)
  const kind = entry.kind === 'decision' ? 'KẾT QUẢ' : entry.kind === 'event' ? 'SỰ KIỆN' : entry.kind === 'consequence' ? 'HỆ QUẢ' : entry.kind === 'research' ? 'NGHIÊN CỨU' : 'NHIỆM VỤ'
  const accent = entry.kind === 'decision' ? '#59c9ff' : entry.kind === 'event' ? '#ffb45a' : entry.kind === 'consequence' ? '#b8a0ff' : '#5edc88'
  const happened = r.happened.filter(Boolean)
  return <GamePanel label={r.title} className={`result-panel tone-${r.tone}`}>
    <EventHeader code={kind} topic={entry.tag && entry.tag !== 'FREE' ? entry.tag : undefined} time={clock(entry.atMinute).toUpperCase()} accent={accent} />
    <h2 className="gp-title">{r.title}</h2>
    {r.chose && <ResultSection label="ĐÃ CHỌN"><strong>{r.chose}</strong></ResultSection>}
    {(happened.length > 0 || r.bars?.length) && <ResultSection label="ĐÃ XẢY RA">{happened.map((x) => <p key={x}>{x}</p>)}{r.bars?.map((b) => <ResourceBar key={b.key} k={b.key} before={b.before} after={b.after} delta={b.delta} emphasis />)}</ResultSection>}
    {r.why.length > 0 && <ResultSection label="VÌ SAO">{r.why.map((x) => <p key={x}>{x}</p>)}</ResultSection>}
    {r.future && <ResultSection label="SAU NÀY"><p>{r.future}</p></ResultSection>}
    {r.lesson && <ResultSection label="BÀI HỌC"><p className="gp-lesson">{r.lesson}</p></ResultSection>}
    <DialogueActionButton label={game.mode === 'basic' ? 'Tiếp tục' : 'Đã hiểu'} onClick={onContinue} />
  </GamePanel>
}

// ── mission journal (decisions, results, causes, lessons) ───────────────────
export function MissionLogDialog({ game, onClose }: { game: GameState; onClose: () => void }) {
  const shown = game.log.filter((e) => e.kind !== 'system')
  return <Modal title="Nhật ký nhiệm vụ" eyebrow="QUYẾT ĐỊNH · KẾT QUẢ · BÀI HỌC" onClose={onClose} className="game-modal timeline-modal">
    <ol className="story-log">{[...shown].reverse().map((e) => { const r = reviewFor(e, game); return <li key={e.id} className={`kind-${e.kind}`}>
      <small>{clock(e.atMinute)}{e.tag && e.tag !== 'FREE' ? ` · ${e.tag}` : ''}</small><strong>{r.chose ? `Bạn chọn: ${r.chose}` : e.title}</strong>
      {r.happened.filter(Boolean).map((x) => <p key={x}>{x}</p>)}
      {r.why.length > 0 && <p className="story-cause"><b>Vì sao:</b> {r.why.join(' ')}</p>}
      {r.future && <p className="story-cause"><b>Ảnh hưởng sau này:</b> {r.future}</p>}
      {r.lesson && <p className="story-lesson"><BookOpen size={12} /> {r.lesson}</p>}
    </li> })}</ol>
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
  if (g.inbox.length) return 'Đọc kết quả bên cạnh rồi bấm “Tiếp tục” nhé. Thời gian đang dừng chờ bạn.'
  if (g.decisions[0]?.key === 'C2') return 'Đây là tuyến đường MILO dự kiến đi tới khu nghiên cứu. Bạn có thể đưa chuột lên đường đi để xem thông tin trước khi quyết định.'
  if (g.decisions.length) return 'Có một quyết định đang chờ bạn. Đọc kỹ điều được và điều mất nhé!'
  if (g.stage === 'A2') return 'Máy điện phân biến nước thành oxy. Hãy chạm vào trạm hỗ trợ sự sống và bật máy!'
  if (g.stage === 'A3') return 'Mọi thứ đang chạy tự động. Hãy cho thời gian trôi (▶) và theo dõi điện, nước, oxy nhé.'
  if (g.radiation.active) return 'Bão bức xạ! Cả đội ở trong nhà trú ẩn cho an toàn. Rover thì không cần trú.'
  if (g.food.irrigation === 'fault' && g.food.repairStartsAt !== null && g.food.repairStartsAt > g.clock.elapsedMinutes) return 'Commander, hệ thống tưới vẫn đang hỏng. Hãy chạm vào nhà kính để kiểm tra nhé!'
  if (g.food.irrigation !== 'ok') return 'Cây đang thiếu nước. Thời gian thiếu nước càng dài, cây càng yếu.'
  if (g.stage === 'free' && !g.food.started && g.ice.stage === 'idle' && !g.ice.report) return 'Chọn một nghiên cứu để bắt đầu: nhà kính (thực phẩm) hoặc rover MILO (băng nước).'
  if (g.food.started && !g.history.some((h) => h.key === 'B1')) return 'Cây đang được theo dõi. Hãy để thời gian trôi (▶) và xem điều gì xảy ra trong nhà kính.'
  if (g.supply.stage === 'pickup') return g.supply.method === 'crew' ? 'Hai phi hành gia đang đẩy xe ra bãi đáp lấy hàng.' : 'MILO đang chở hàng tiếp tế. Hàng chỉ vào kho khi về tới căn cứ.'
  if (g.food.stage === 'growing' && g.food.started && !g.food.observations.some((o) => o.day === Math.floor(g.clock.elapsedMinutes / DAY) + 1)) return 'Hôm nay chưa ai quan sát cây. Vào nhà kính và bấm “Quan sát cây” nhé.'
  if (g.food.stage === 'harvested') return 'Đã thu hoạch! Lập báo cáo thực phẩm ở nhà kính.'
  if (g.ice.stage === 'idle' && !g.ice.report) return 'MILO đang chờ. Vào trạm rover và bấm “Bắt đầu khám phá băng”.'
  if (!g.food.started) return 'Nhà kính vẫn chờ bạn: bấm vào nhà kính để bắt đầu nghiên cứu thực phẩm.'
  if (g.food.report && g.ice.report) return 'Cả hai nghiên cứu đã xong! Bạn có thể nộp báo cáo ở trung tâm chỉ huy.'
  return `Kho thực phẩm còn đủ khoảng ${Math.max(0, (g.resources.food - LIFE.foodReserveCrewDays) / CREW).toFixed(1)} ngày. Hãy hoàn thành nghiên cứu trước khi phải về.`
}
export const resourcePercent = (g: GameState) => ({
  battery: Math.round(g.resources.battery / CAPACITY.battery * 100),
  water: Math.round(g.resources.water / CAPACITY.water * 100),
  oxygen: Math.round(g.resources.oxygen / CAPACITY.oxygen * 100),
  foodDays: Math.max(0, g.resources.food / CREW),
})

// ── C2 on the map: the real A* route is drawn in 3D; this panel separates measured data from estimates ──
export function RouteCard({ decision, world, onChoose }: { decision: Decision; world: WorldFacts; game: GameState; onChoose: (choice: string) => void }) {
  const zone = world.zones.find((z) => z.zone === decision.context.zone), r = zone?.route
  const need = r ? roverEnergyNeed(r.lengthM) : 0, tooMuch = need > ROVER.batteryKwh
  return <GamePanel label={`Tuyến tới khu ${decision.context.zone}`} className="route-card" footer={<button className="gp-secondary" onClick={() => onChoose('back')}>Chọn khu khác</button>}>
    <EventHeader code="C2" topic={EVENT_TOPIC.C2} time={clock(decision.atMinute).toUpperCase()} />
    <h2 className="gp-title">Tuyến tới khu {decision.context.zone}{zone ? ` · ${zone.name}` : ''}</h2>
    {r ? <>
      <p className="gp-question">Đường vàng trên bản đồ là tuyến A* thật. Di chuột lên đường để xem từng đoạn.</p>
      <ResultSection label="ĐO TỪ NASA"><p>Dài {(r.lengthM / 1000).toFixed(1)} km một chiều · dốc danh nghĩa lớn nhất {r.maxSlopeDeg.toFixed(1)}°, trung bình {r.meanSlopeDeg.toFixed(1)}° (ngưỡng 15°)</p><p>Tính cả sai số đo: khoảng {r.uncertainPercent.toFixed(0)} % quãng đường có thể vượt 15° · đích {r.inPsr ? 'trong' : 'ngoài'} vùng tối vĩnh cửu</p></ResultSection>
      <ResultSection label="ƯỚC TÍNH"><p>Khoảng {Math.round(need)} / {ROVER.batteryKwh} kWh pin rover · {Math.round(r.lengthM / 1000 / ROVER.speedKmh * 2)} giờ lái đi và về (mô hình của game)</p></ResultSection>
      <ResultSection label="CHƯA XÉT"><p>Ánh sáng, nhiệt độ, liên lạc, đá nhỏ hơn ô 5 m. Đây là tuyến khả thi về độ dốc, chưa phải tuyến được đảm bảo an toàn. Chỉ có một tuyến tìm được tới khu này.</p></ResultSection>
      {tooMuch && <p className="game-warn">Pin rover không đủ cho cả đi và về.</p>}
    </> : <p>Không có tuyến khả thi tới khu này.</p>}
    {r && <DialogueActionButton label="Xác nhận tuyến" disabled={tooMuch} onClick={() => onChoose('go')} />}
  </GamePanel>
}
