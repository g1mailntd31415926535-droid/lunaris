import { ArrowRight, BatteryCharging, Check, ChevronRight, Clock3, Droplets, History, Lightbulb, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react'
import { Modal } from './Common'
import { A1_OPTIONS } from '../game/balance'
import type { A1ChoiceId, DecisionRecord, GameState, ResourceDelta, ResourceKey } from '../game/types'

export const RESOURCE_LABEL: Record<ResourceKey, string> = { electricity: 'Điện dự trữ', water: 'Nước sạch', oxygen: 'Oxy', wastewater: 'Nước đã dùng' }

const fmt = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n * 10) / 10}`
const clockLabel = (minute: number) => { const t = 8 * 60 + 24 + Math.floor(minute); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }

export function DeltaList({ deltas }: { deltas: ResourceDelta }) {
  const entries = Object.entries(deltas) as [ResourceKey, number][]
  if (!entries.length) return <p className="game-muted">Không có nguồn nào thay đổi.</p>
  return <ul className="game-deltas">{entries.map(([key, value]) => <li key={key} className={value > 0 ? 'up' : 'down'}><span>{RESOURCE_LABEL[key]}</span><strong>{fmt(value)}</strong></li>)}</ul>
}

export function TutorialBriefing({ onAcknowledge }: { onAcknowledge: () => void }) {
  return <Modal title="Hôm nay có một chút điện dư." eyebrow="CHẶNG A1 · LỰA CHỌN ĐẦU TIÊN" onClose={onAcknowledge} className="game-modal">
    <div className="game-brief">
      <p><Check size={15} /> Mọi hệ thống quan trọng của căn cứ đang <strong>an toàn</strong>.</p>
      <p><Sparkles size={15} /> Tấm pin vừa tạo ra <strong>một ít điện dư</strong>. Lượng điện này chỉ đủ cho <strong>MỘT</strong> việc:</p>
      <div className="game-brief-options"><span><Droplets size={16} /> Tái chế thêm nước</span><em>hoặc</em><span><BatteryCharging size={16} /> Sạc pin dự phòng</span></div>
      <p><Lightbulb size={15} /> Hãy chạm vào <strong>trạm nước</strong> hoặc <strong>trạm pin</strong> trong căn cứ để xem mỗi việc được gì và mất gì. Không có lựa chọn nào là sai.</p>
      <p className="game-muted"><Clock3 size={13} /> Thời gian nhiệm vụ đang dừng. Bạn có thể xoay và phóng camera thoải mái. Bấm <b>▶ Tiếp tục</b> khi sẵn sàng.</p>
    </div>
    <button className="primary-button" onClick={onAcknowledge}>Mình hiểu rồi<ChevronRight size={15} /></button>
  </Modal>
}

export function A1ConfirmDialog({ choiceId, onConfirm, onClose }: { choiceId: A1ChoiceId; onConfirm: () => void; onClose: () => void }) {
  const option = A1_OPTIONS[choiceId]
  return <Modal title={`${option.title}?`} eyebrow="XÁC NHẬN · CHỈ CHỌN ĐƯỢC MỘT LẦN" onClose={onClose} className="game-modal">
    <div className="game-tradeoff"><div className="gain"><small>BẠN ĐƯỢC</small><p>{option.gain}</p></div><div className="cost"><small>BẠN ĐÁNH ĐỔI</small><p>{option.cost}</p></div></div>
    <p className="game-muted"><TriangleAlert size={13} /> Sau khi xác nhận, phi hành gia sẽ đi tới thiết bị và làm việc. Bạn không đổi được lựa chọn này nữa.</p>
    <div className="game-actions"><button className="secondary-action" onClick={onClose}>Để mình nghĩ thêm</button><button className="primary-button" onClick={onConfirm}><Check size={15} />Xác nhận</button></div>
  </Modal>
}

function DecisionCard({ record }: { record: DecisionRecord }) {
  const option = A1_OPTIONS[record.choiceId]
  return <article className="game-decision">
    <header><span className="game-stage">{record.stage}</span><strong>{option.title}</strong><small><Clock3 size={11} /> {clockLabel(record.atMinute)}</small></header>
    <div className="game-decision-grid">
      <div><small>NGUỒN ĐÃ THAY ĐỔI</small><DeltaList deltas={record.deltas} /></div>
      <div><small>KHÔNG ĐƯỢC ƯU TIÊN</small><ul className="game-skipped">{record.rejectedChoiceIds.map((id) => <li key={id}>{A1_OPTIONS[id].title} <span>— {id === 'charge-battery' ? 'điện dự trữ giữ nguyên' : 'nước đã dùng vẫn chờ tái chế'}</span></li>)}</ul></div>
    </div>
    <p className="game-why"><Lightbulb size={13} /> Vì sao có lựa chọn này? Tấm pin tạo dư một ít điện, chỉ đủ cho một việc.</p>
    <p className="game-muted">Hệ quả về sau: {record.effectEventIds.length ? `${record.effectEventIds.length} sự kiện` : 'chưa có sự kiện nào liên quan. Khi có, chúng sẽ hiện ở đây.'}</p>
  </article>
}

export function TimelineDialog({ game, onClose }: { game: GameState; onClose: () => void }) {
  return <Modal title="Những quyết định của bạn" eyebrow="DÒNG THỜI GIAN NHIỆM VỤ" onClose={onClose} className="game-modal timeline-modal">
    {game.history.length === 0 ? <div className="game-empty"><History size={26} /><p>Bạn chưa đưa ra quyết định nào.{game.a1.phase === 'executing' ? ' Phi hành gia đang thực hiện lựa chọn A1.' : ' Hãy chọn một việc ở chặng A1 nhé!'}</p></div> : game.history.map((record) => <DecisionCard key={record.id} record={record} />)}
    <div className="game-upcoming"><small>SẮP TỚI</small><p><span className="game-stage soon">A2</span> Nước + điện → oxy <em>sẽ triển khai</em></p><p><span className="game-stage soon">A3</span> Bảo trì giàn pin hay giữ nhiệt cho rover <em>sẽ triển khai</em></p></div>
    <button className="primary-button" onClick={onClose}>Đóng<ArrowRight size={14} /></button>
  </Modal>
}

export function RestartDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return <Modal title="Chơi lại từ đầu?" eyebrow="BẮT ĐẦU LẠI" onClose={onClose} className="game-modal">
    <p className="dialog-intro">Mọi lựa chọn và chỉ số hiện tại sẽ bị xóa. Bạn sẽ quay về chặng A1.</p>
    <div className="game-actions"><button className="secondary-action" onClick={onClose}>Không, chơi tiếp</button><button className="primary-button danger" onClick={onConfirm}><RotateCcw size={15} />Chơi lại</button></div>
  </Modal>
}
