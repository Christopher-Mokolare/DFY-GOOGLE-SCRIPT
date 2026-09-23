import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { tasksApi } from '../api'

type PaymentDetails = {
  taskId: string
  paymentId: number
  amount: number
  paymentStatus: string
  taskStatus: string
  paymentReference: string
  bankReference: string
  bank: { name: string; accountName: string; accountNumber: string; branchCode: string; accountType: string }
  instructions: string
  whatsapp: string
  termsUrl: string
}

export default function ManualPayment() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const taskId = params.get('taskId') || ''
  const [details, setDetails] = useState<PaymentDetails | null>(null)
  const [senderReference, setSenderReference] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [proof, setProof] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!taskId) { setError('No task reference was provided.'); setLoading(false); return }
    tasksApi.getPaymentUrl(taskId)
      .then(r => {
        const d = r.data?.data || r.data
        if (r.data?.success === false) throw new Error(r.data.message || 'Unable to load payment instructions')
        setDetails(d)
        setSubmitted(d?.paymentStatus === 'AwaitingVerification')
      })
      .catch((e: any) => setError(e.message || e.response?.data?.message || 'Unable to load payment instructions'))
      .finally(() => setLoading(false))
  }, [taskId])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!details) return
    setSubmitting(true); setError('')
    try {
      const r = await tasksApi.submitManualPayment(taskId, {
        paidAmount: details.amount,
        senderReference: senderReference.trim(),
        paidAt,
        proofOfPayment: proof.trim(),
      })
      if (r.data?.success === false) throw new Error(r.data.message || 'Payment submission failed')
      setSubmitted(true)
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Payment submission failed')
    } finally { setSubmitting(false) }
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>

  if (submitted) return (
    <div className="container" style={{ padding: '3rem 1rem' }}>
      <div className="section-card" style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', color: 'var(--success)', marginBottom: '1rem' }}><i className="fas fa-clock" /></div>
        <h1>Payment Submitted</h1>
        <p className="text-muted">Your payment is awaiting verification. Your task is still private and will only become visible to helpers after an administrator confirms the EFT.</p>
        <p><strong>Task:</strong> {details?.taskId}</p>
        <button className="btn btn-primary" onClick={() => navigate('/tasks/my-posted')}>View My Tasks</button>
      </div>
    </div>
  )

  return (
    <div className="container" style={{ padding: '2rem 1rem 4rem' }}>
      <div className="section-card" style={{ maxWidth: 760, margin: '0 auto' }}>
        <div className="page-header" style={{ padding: 0, marginBottom: '1.5rem' }}>
          <h1><i className="fas fa-university" /> Pay for your task by EFT</h1>
          <p>Your task stays private until DoForYou verifies the payment.</p>
        </div>
        {error && <div className="alert alert-error mb-4"><i className="fas fa-exclamation-circle" /> {error}</div>}
        {details && <>
          <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card"><div className="stat-content"><p>Amount to pay</p><h3>R{Number(details.amount).toFixed(2)}</h3></div></div>
            <div className="stat-card"><div className="stat-content"><p>Task reference</p><h3 style={{ fontSize: '1rem' }}>{details.paymentReference}</h3></div></div>
          </div>
          <div className="section-card" style={{ background: 'var(--surface-muted)', marginBottom: '1.5rem' }}>
            <h3>Bank details</h3>
            <p><strong>Bank:</strong> {details.bank.name}</p>
            <p><strong>Account name:</strong> {details.bank.accountName}</p>
            <p><strong>Account number:</strong> {details.bank.accountNumber}</p>
            {details.bank.branchCode && <p><strong>Branch code:</strong> {details.bank.branchCode}</p>}
            <p><strong>Account type:</strong> {details.bank.accountType}</p>
            <p><strong>Bank reference:</strong> Your full name</p>
            <p><strong>DoForYou reference:</strong> {details.paymentReference}</p>
            <p className="text-muted">{details.instructions}</p>
          </div>
          <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
            <strong>After the EFT:</strong> send your Proof of Payment to WhatsApp {details.whatsapp}. Then submit the payment details below. Sending a PoP does not publish the task; an administrator must verify the money received in the business account.
          </div>
          <form onSubmit={submit}>
            <div className="form-group"><label className="form-label">Your bank payment reference *</label><input className="form-input" value={senderReference} onChange={e => setSenderReference(e.target.value)} placeholder="Your full name" required /></div>
            <div className="form-group"><label className="form-label">Payment date *</label><input type="date" className="form-input" value={paidAt} onChange={e => setPaidAt(e.target.value)} required /></div>
            <div className="form-group"><label className="form-label">PoP note (optional)</label><textarea className="form-textarea" rows={3} value={proof} onChange={e => setProof(e.target.value)} placeholder="Optional note or PoP reference. Send the actual PoP to WhatsApp." /></div>
            <div className="step-nav">
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/tasks/my-posted')}>Pay later</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? <><span className="spinner spinner-sm" /> Submitting...</> : <><i className="fas fa-paper-plane" /> I have paid</>}</button>
            </div>
          </form>
          <p className="text-muted text-xs" style={{ marginTop: '1rem' }}>Payment window: 24 hours. <a href={details.termsUrl} target="_blank" rel="noreferrer">Terms & Conditions</a></p>
        </>}
      </div>
    </div>
  )
}
