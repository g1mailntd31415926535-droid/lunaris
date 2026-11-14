import { RotateCcw } from 'lucide-react'
import { Modal } from './Common'

export function RestartDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return <Modal title="Chơi lại từ đầu?" eyebrow="BẮT ĐẦU LẠI" onClose={onClose} className="game-modal">
    <p className="dialog-intro">Mọi lựa chọn và chỉ số hiện tại sẽ bị xóa. Bạn sẽ bắt đầu lại từ phần mở đầu.</p>
    <div className="game-actions"><button className="secondary-action" onClick={onClose}>Không, chơi tiếp</button><button className="primary-button danger" onClick={onConfirm}><RotateCcw size={15} />Chơi lại</button></div>
  </Modal>
}

export function SubmitDialog({ onConfirm, onClose, foodDone, iceDone }: { onConfirm: () => void; onClose: () => void; foodDone: boolean; iceDone: boolean }) {
  return <Modal title="Nộp báo cáo và trở về Trái Đất?" eyebrow="KẾT THÚC NHIỆM VỤ" onClose={onClose} className="game-modal">
    <p className="dialog-intro">Nghiên cứu thực phẩm: <strong>{foodDone ? 'đã hoàn thành' : 'chưa hoàn thành'}</strong>. Nghiên cứu băng: <strong>{iceDone ? 'đã hoàn thành' : 'chưa hoàn thành'}</strong>. Sau khi nộp, cả đội sẽ trở về và không quay lại được nữa.</p>
    <div className="game-actions"><button className="secondary-action" onClick={onClose}>Ở lại thêm</button><button className="primary-button" onClick={onConfirm}>Nộp và trở về</button></div>
  </Modal>
}
