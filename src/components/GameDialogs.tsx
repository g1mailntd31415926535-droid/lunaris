import { RotateCcw } from 'lucide-react'
import { Modal } from './Common'

export function RestartDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return <Modal title="Start over from the beginning?" eyebrow="RESTART" onClose={onClose} className="game-modal">
    <p className="dialog-intro">All your choices and current levels will be erased. You will start again from the opening.</p>
    <div className="game-actions"><button className="secondary-action" onClick={onClose}>No, keep playing</button><button className="primary-button danger" onClick={onConfirm}><RotateCcw size={15} />Restart</button></div>
  </Modal>
}

export function SubmitDialog({ onConfirm, onClose, foodDone, iceDone }: { onConfirm: () => void; onClose: () => void; foodDone: boolean; iceDone: boolean }) {
  return <Modal title="Submit your reports and return to Earth?" eyebrow="END THE MISSION" onClose={onClose} className="game-modal">
    <p className="dialog-intro">Food research: <strong>{foodDone ? 'complete' : 'not complete'}</strong>. Ice research: <strong>{iceDone ? 'complete' : 'not complete'}</strong>. Once you submit, the crew goes home and cannot come back.</p>
    <div className="game-actions"><button className="secondary-action" onClick={onClose}>Stay longer</button><button className="primary-button" onClick={onConfirm}>Submit and return</button></div>
  </Modal>
}
