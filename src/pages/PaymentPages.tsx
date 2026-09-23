import { useNavigate } from 'react-router-dom'

export function PaymentSuccess() {
  const navigate = useNavigate()
  return (
    <div className="container" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 560 }}>
        <div style={{ fontSize: '3rem', color: 'var(--success)', marginBottom: '1rem' }}><i className="fas fa-clock" /></div>
        <h2>Payment Awaiting Verification</h2>
        <p className="text-muted">Your task remains private until DoForYou verifies the EFT in the business account.</p>
        <button className="btn btn-primary" onClick={() => navigate('/tasks/my-posted')}>View My Tasks</button>
      </div>
    </div>
  )
}

export function PaymentCancelled() {
  const navigate = useNavigate()
  return (
    <div className="container" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 560 }}>
        <div style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '1rem' }}><i className="fas fa-pause-circle" /></div>
        <h2>Payment Not Submitted</h2>
        <p className="text-muted">Your task remains private and can be paid from the task payment page.</p>
        <button className="btn btn-primary" onClick={() => navigate('/tasks/my-posted')}>View My Tasks</button>
      </div>
    </div>
  )
}
