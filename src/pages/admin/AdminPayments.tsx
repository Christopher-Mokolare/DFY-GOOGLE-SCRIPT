import { useEffect, useState } from 'react'
import { adminApi } from '../../api'

export default function AdminPayments() {
  const [pending, setPending] = useState<any[]>([])
  const [allPayments, setAllPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [pendingRes, allRes] = await Promise.all([adminApi.getPendingManualPayments(), adminApi.getPayments()])
      setPending(pendingRes.data?.data || [])
      setAllPayments(allRes.data?.data || [])
    } catch (e: any) {
      setMessage(e.response?.data?.message || 'Unable to load payments.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const verify = async (payment: any) => {
    if (!window.confirm(`Verify EFT of R${Number(payment.amount).toFixed(2)} for ${payment.taskId}?`)) return
    setBusyId(payment.paymentId); setMessage('')
    try {
      const r = await adminApi.verifyManualPayment(payment.paymentId, Number(payment.amount), '')
      if (r.data?.success === false) throw new Error(r.data.message || 'Verification failed')
      setMessage(`Payment verified. Task ${payment.taskId} is now posted.`)
      await load()
    } catch (e: any) { setMessage(e.response?.data?.message || e.message || 'Verification failed.') }
    finally { setBusyId(null) }
  }

  const reject = async (payment: any) => {
    const reason = window.prompt('Reason for rejecting this payment submission:', 'Payment could not be matched to the Capitec business account')
    if (!reason) return
    setBusyId(payment.paymentId); setMessage('')
    try {
      const r = await adminApi.rejectManualPayment(payment.paymentId, reason)
      if (r.data?.success === false) throw new Error(r.data.message || 'Rejection failed')
      setMessage(`Payment submission rejected. Task ${payment.taskId} remains private.`)
      await load()
    } catch (e: any) { setMessage(e.response?.data?.message || e.message || 'Rejection failed.') }
    finally { setBusyId(null) }
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>

  return (
    <div style={{ paddingBottom: '3rem' }}>
      <div className="page-header">
        <div className="container">
          <h1><i className="fas fa-university" /> Manual EFT Payments</h1>
          <p>Check the Capitec business account before verifying a customer payment.</p>
        </div>
      </div>
      <div className="container">
        {message && <div className="alert alert-info mb-4">{message}</div>}

        <div className="section-card">
          <div className="section-header">
            <div><h2><i className="fas fa-hourglass-half" /> Awaiting verification</h2><p className="text-muted">Verification is the only action that publishes a task.</p></div>
            <span className="badge badge-warning">{pending.length} pending</span>
          </div>
          {pending.length === 0 ? (
            <div className="empty-state"><i className="fas fa-circle-check" /><p>No manual EFT payments are awaiting verification.</p></div>
          ) : (
            <div className="admin-table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead><tr>{['Task','Task name','Customer','Amount','Bank reference','Paid date','PoP note','Status','Action'].map(h => <th key={h} style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)' }}>{h}</th>)}</tr></thead>
                <tbody>{pending.map(p => (
                  <tr key={p.paymentId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{p.taskId}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{p.taskName}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{p.customerName}<div className="text-muted text-xs">{p.customerEmail}</div></td>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>R{Number(p.amount).toFixed(2)}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{p.senderReference || '—'}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{p.paidAt || '—'}</td>
                    <td style={{ padding: '0.75rem 0.5rem', maxWidth: 180 }}>{p.proofOfPayment || 'Sent via WhatsApp'}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{p.status}</td>
                    <td style={{ padding: '0.75rem 0.5rem', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => verify(p)} disabled={busyId === p.paymentId}><i className="fas fa-check" /> Verify & Post</button>
                      {p.status === 'AWAITING_VERIFICATION' && <button className="btn btn-secondary btn-sm" style={{ marginLeft: '.4rem' }} onClick={() => reject(p)} disabled={busyId === p.paymentId}>Reject</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>

        <div className="section-card" style={{ marginTop: '1.5rem' }}>
          <div className="section-header"><h2><i className="fas fa-list" /> Payment ledger</h2><span className="text-muted text-sm">{allPayments.length} records</span></div>
          <div className="admin-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead><tr>{['ID','Task ID','Type','Amount','Status','Reference','Updated'].map(h => <th key={h} style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)' }}>{h}</th>)}</tr></thead>
              <tbody>{allPayments.slice().reverse().map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem .5rem' }}>{p.id}</td><td style={{ padding: '0.75rem .5rem' }}>{p.taskId}</td><td style={{ padding: '0.75rem .5rem' }}>{p.type}</td><td style={{ padding: '0.75rem .5rem' }}>R{Number(p.amount || 0).toFixed(2)}</td><td style={{ padding: '0.75rem .5rem' }}>{p.status}</td><td style={{ padding: '0.75rem .5rem' }}>{p.reference}</td><td style={{ padding: '0.75rem .5rem' }}>{p.updatedAt || p.createdAt}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
