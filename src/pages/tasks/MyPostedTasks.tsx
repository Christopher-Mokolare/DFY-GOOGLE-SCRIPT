import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { tasksApi, ratingsApi } from '../../api'
import { usePostErrand } from '../../hooks/usePostErrand'
import type { Task } from '../../types'
import './MyPostedTasks.css'

type Section = 'pendingPayment' | 'posted' | 'claimed' | 'completed' | 'runnerPaid'

function getStatusBadge(status: string) {
  const s = status?.toLowerCase().replace(/ /g, '_')
  const map: Record<string, string> = { pendingpayment: 'badge-draft', draft: 'badge-draft', posted: 'badge-posted', claimed: 'badge-claimed', in_progress: 'badge-in_progress', completed: 'badge-completed', confirmed: 'badge-confirmed', runnerpaid: 'badge-runner_paid', runner_paid: 'badge-runner_paid', cancelled: 'badge-cancelled' }
  return `badge ${map[s] || 'badge-draft'}`
}

function getInitials(name: string) { return name?.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || '?' }


export default function MyPostedTasks() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { handlePostErrand, ProfileIncompleteModal } = usePostErrand()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<Section, boolean>>({ pendingPayment: true, posted: true, claimed: true, completed: true, runnerPaid: false })
  const [confirmModal, setConfirmModal] = useState<Task | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [cancelModal, setCancelModal] = useState<Task | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelMessage, setCancelMessage] = useState('')
  const [ratingModal, setRatingModal] = useState<Task | null>(null)
  const [ratingValue, setRatingValue] = useState(5)
  const [ratingReview, setRatingReview] = useState('')
  const [ratingLoading, setRatingLoading] = useState(false)
  const [ratingError, setRatingError] = useState('')
  const [ratedTaskIds, setRatedTaskIds] = useState<Set<string>>(new Set())
  const [detailsModal, setDetailsModal] = useState<Task | null>(null)

  const loadTasks = async () => {
    try {
      const res = await tasksApi.getMyPosted()
      const inner = res.data?.data
      const raw: Task[] = inner?.tasks || inner?.Tasks || []
      setTasks(raw.map(t => ({ ...t, taskDescription: DOMPurify.sanitize(t.taskDescription || '', { ALLOWED_TAGS: [] }), area: DOMPurify.sanitize(t.area || '', { ALLOWED_TAGS: [] }), helperName: DOMPurify.sanitize(t.helperName || '', { ALLOWED_TAGS: [] }), helperContact: DOMPurify.sanitize(t.helperContact || '', { ALLOWED_TAGS: [] }), category: DOMPurify.sanitize(t.category || '', { ALLOWED_TAGS: [] }) })))
    } catch { setError('Failed to load tasks.') } finally { setLoading(false) }
  }

  useEffect(() => { loadTasks() }, [])

  useEffect(() => {
    const target = searchParams.get('taskId')
    if (!target || loading || tasks.length === 0) return
    const task = tasks.find(t => String(t.taskId) === target)
    if (!task) return
    const status = task.taskStatus?.toLowerCase() || ''
    const section: Section = status === 'completed' ? 'completed' : ['claimed', 'in_progress'].includes(status) ? 'claimed' : status === 'posted' ? 'posted' : 'pendingPayment'
    setExpanded(e => ({ ...e, [section]: true }))
    requestAnimationFrame(() => document.getElementById(`posted-task-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    if (searchParams.get('action') === 'confirm' && status === 'completed') setConfirmModal(task)
  }, [searchParams, loading, tasks])

  const grouped = {
    pendingPayment: tasks.filter(t => t.taskStatus?.toLowerCase() === 'pendingpayment'),
    posted: tasks.filter(t => t.taskStatus?.toLowerCase() === 'posted'),
    claimed: tasks.filter(t => ['claimed', 'in_progress'].includes(t.taskStatus?.toLowerCase() || '')),
    completed: tasks.filter(t => t.taskStatus?.toLowerCase() === 'completed'),
    runnerPaid: tasks.filter(t => ['runnerpaid', 'runner_paid', 'confirmed', 'payoutpending'].includes(t.taskStatus?.toLowerCase() || '')),
  }

  const toggle = (s: Section) => setExpanded(e => ({ ...e, [s]: !e[s] }))

  const handleConfirm = async () => {
    if (!confirmModal) return
    setActionLoading(true); setActionError('')
    try {
      const res = await tasksApi.confirm(confirmModal.taskId)
      if (res.data?.success === false) { setActionError(res.data?.message || 'Failed to confirm task'); return }
      setConfirmModal(null); await loadTasks()
    } catch (err: any) { setActionError(err.response?.data?.message || 'Failed to confirm task') } finally { setActionLoading(false) }
  }

  const handleRating = async () => {
    if (!ratingModal) return
    setRatingLoading(true); setRatingError('')
    try {
      const res = await ratingsApi.submit(ratingModal.taskId, ratingValue, ratingReview)
      if (res.data?.success) { setRatedTaskIds(prev => new Set(prev).add(ratingModal.taskId)); setRatingModal(null); setRatingReview(''); setRatingValue(5); setRatingError('') }
      else setRatingError(res.data?.message || 'Failed to submit rating')
    } catch { setRatingError('Failed to submit rating') } finally { setRatingLoading(false) }
  }

  const handleCancel = async () => {
    if (!cancelModal) return
    setCancelLoading(true)
    try {
      const res = await tasksApi.cancel(cancelModal.taskId, 'Cancelled by creator')
      setCancelMessage(DOMPurify.sanitize(res.data?.message || 'Task cancelled.', { ALLOWED_TAGS: [] })); await loadTasks()
    } catch { setCancelMessage('Failed to cancel task.') } finally { setCancelLoading(false) }
  }

  const handlePayNow = (taskId: string) => {
    navigate('/tasks/payment?taskId=' + encodeURIComponent(taskId))
  }

  if (loading) return <div className="loading-state"><div className="spinner" /><p>Loading your posted tasks...</p></div>

  const sections: { key: Section; icon: string; label: string }[] = [
    { key: 'pendingPayment', icon: 'fa-exclamation-circle', label: 'Pending Payment' },
    { key: 'posted', icon: 'fa-bullhorn', label: 'Live on Browse Errands' },
    { key: 'claimed', icon: 'fa-spinner', label: 'In Progress' },
    { key: 'completed', icon: 'fa-clock', label: 'Awaiting Confirmation' },
    { key: 'runnerPaid', icon: 'fa-check-circle', label: 'Completed' },
  ]

  return (
    <>
      <div className="my-posted-page">
        <div className="page-header"><div className="container"><h1><i className="fas fa-list-check" /> My Posted Tasks</h1><p>Manage and track your posted tasks</p></div></div>
        <div className="container">
          {error && <div className="alert alert-error mb-4"><i className="fas fa-exclamation-circle" /> {error}</div>}
          {tasks.length === 0 ? <><div className="empty-state"><i className="fas fa-clipboard-list" /><h3>No Posted Tasks</h3><p>You haven't posted any tasks yet.</p><button className="btn btn-primary" onClick={handlePostErrand}>Post Your First Task</button></div>{ProfileIncompleteModal}</> : sections.map(({ key, icon, label }) => grouped[key].length > 0 && (
            <div key={key} className="status-section">
              <button className="status-heading" onClick={() => toggle(key)}><span><i className={`fas ${icon}`} /> {label} ({grouped[key].length})</span><i className={`fas fa-chevron-${expanded[key] ? 'up' : 'down'}`} /></button>
              {expanded[key] && <div className="tasks-grid">{grouped[key].map(task => (
                <div id={`posted-task-${task.taskId}`} key={task.taskId || task.id} className="task-card">
                  <div className="task-card-header"><span className={getStatusBadge(task.taskStatus)}>{task.taskStatus}</span><div className="task-budget">R{task.budget}</div></div>
                  <div className="task-card-body">
                    <h3 className="task-title">{task.taskName || task.taskDescription}</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.4em' }}>{task.taskName ? task.taskDescription : ''}</p>
                    <div className="task-meta"><div className="task-meta-item"><i className="fas fa-tag" /><span>{task.category || 'General'}</span></div><div className="task-meta-item"><i className="fas fa-calendar" /><span>{new Date(task.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div><div className="task-meta-item"><i className="fas fa-map-marker-alt" /><span>{task.area?.length > 30 ? task.area.substring(0, 30) + '...' : task.area}</span></div></div>
                    {task.helperName ? <div className="runner-info"><div className="runner-avatar">{getInitials(task.helperName)}</div><div><div className="runner-name">{task.helperName}</div><div className="runner-contact">{task.helperContact}</div></div></div> : <div className="runner-info runner-info--empty"><div className="runner-avatar runner-avatar--empty"><i className="fas fa-user" /></div><div className="runner-name" style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>No runner yet</div></div>}
                  </div>
                  <div className="task-card-footer">
                    {key === 'pendingPayment' && <div className="action-row"><button className="btn btn-outline btn-sm" onClick={() => { handlePostErrand(); navigate(`/tasks/post?edit=${task.taskId}`) }}><i className="fas fa-edit" /> Edit</button><button className="btn btn-danger btn-sm" onClick={() => { setCancelModal(task); setCancelMessage('') }}><i className="fas fa-times" /> Cancel</button><button className="btn btn-primary btn-sm" onClick={() => handlePayNow(task.taskId)}><i className="fas fa-credit-card" /> Pay by EFT</button></div>}
                    {key === 'posted' && <div className="action-col"><button className="btn btn-primary btn-block btn-sm" onClick={() => setDetailsModal(task)}>View Details</button><button className="btn btn-outline btn-sm btn-block mt-2" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => { setCancelModal(task); setCancelMessage('') }}><i className="fas fa-times" /> Cancel Task</button></div>}
                    {(key === 'claimed' || key === 'completed') && <div className="action-col"><div className="action-row"><button className="btn btn-outline btn-sm" onClick={() => navigate(`/tasks/${task.taskId}/chat?title=${encodeURIComponent(task.taskName || task.taskDescription || 'Task Chat')}`)}><i className="fas fa-comment" /> Chat</button>{task.helperContact && <a href={`tel:${encodeURIComponent(task.helperContact)}`} className="btn btn-outline btn-sm"><i className="fas fa-phone" /> Call</a>}</div>{key === 'completed' && <button className="btn btn-primary btn-block btn-sm mt-2" onClick={() => setConfirmModal(task)}><i className="fas fa-check" /> Confirm & Pay Runner</button>}{key === 'claimed' && <div className="action-col mt-2"><button className="btn btn-secondary btn-block btn-sm" onClick={() => setDetailsModal(task)}>View Details</button><button className="btn btn-outline btn-sm btn-block mt-2" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', flexDirection: 'column', gap: '0.1rem', lineHeight: 1.2 }} onClick={() => { setCancelModal(task); setCancelMessage('') }}><span><i className="fas fa-times" /> Cancel Task</span></button></div>}</div>}
                    {key === 'runnerPaid' && <div className="action-row"><button className="btn btn-primary btn-sm flex-1" onClick={() => setDetailsModal(task)}>View Details</button>{task.helperContact && <a href={`tel:${task.helperContact}`} className="btn btn-outline btn-sm"><i className="fas fa-phone" /></a>}{!ratedTaskIds.has(task.taskId) && <button className="btn btn-outline btn-sm" onClick={() => { setRatingModal(task); setRatingReview(''); setRatingValue(5); setRatingError('') }}><i className="fas fa-star" /> Rate</button>}</div>}
                  </div>
                </div>
              ))}</div>}
            </div>
          ))}
        </div>

        {confirmModal && <div className="modal-overlay" onClick={() => setConfirmModal(null)}><div className="modal-box" onClick={e => e.stopPropagation()}><div className="modal-header"><h3><i className="fas fa-check-circle" /> Confirm Task Completion</h3><button className="btn-close" onClick={() => setConfirmModal(null)}><i className="fas fa-times" /></button></div><div className="modal-body"><p>Are you satisfied with the completion of:</p><p className="mt-2"><strong>{confirmModal.taskDescription}</strong></p><div className="alert alert-info mt-3"><i className="fas fa-info-circle" /> Confirming will release the runner's 85% payout to their verified bank account through the DFY settlement process.</div></div>{actionError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', padding: '0 1.5rem 0.5rem' }}>{actionError}</p>}<div className="modal-footer"><button className="btn btn-secondary" onClick={() => { setConfirmModal(null); setActionError('') }}>Cancel</button><button className="btn btn-primary" onClick={handleConfirm} disabled={actionLoading}>{actionLoading ? <><span className="spinner spinner-sm" /> Processing...</> : 'Confirm & Release Payout'}</button></div></div></div>}

        {cancelModal && <div className="modal-overlay" onClick={() => { if (!cancelLoading) { setCancelModal(null); setCancelMessage('') } }}><div className="modal-box" onClick={e => e.stopPropagation()}><div className="modal-header"><h3><i className="fas fa-times-circle" /> Cancel Task</h3><button className="btn-close" onClick={() => { setCancelModal(null); setCancelMessage('') }}><i className="fas fa-times" /></button></div><div className="modal-body">{cancelMessage ? <div className={`alert ${cancelMessage.includes('Failed') ? 'alert-error' : 'alert-success'}`}><i className={`fas fa-${cancelMessage.includes('Failed') ? 'exclamation-circle' : 'check-circle'}`} /> {cancelMessage}</div> : <><p style={{ fontWeight: 600, marginBottom: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{cancelModal.taskName || cancelModal.taskDescription}</p>{cancelModal.taskStatus?.toLowerCase() === 'pendingpayment' && <div className="alert alert-info"><i className="fas fa-info-circle" /> No payment was made. This task will be removed at no cost.</div>}{cancelModal.taskStatus?.toLowerCase() === 'posted' && <div className="alert alert-info"><i className="fas fa-info-circle" /> This task is paid and live. Cancellation/refund handling is controlled by DFY's payment policy.</div>}{cancelModal.taskStatus?.toLowerCase() === 'claimed' && <div className="alert alert-warning"><i className="fas fa-exclamation-triangle" /> A runner has already accepted this task. Cancellation may affect the escrow/payout state.</div>}</>}</div><div className="modal-footer">{cancelMessage && !cancelMessage.includes('Failed') ? <button className="btn btn-primary" onClick={() => { setCancelModal(null); setCancelMessage('') }}>Done</button> : <><button className="btn btn-secondary" onClick={() => { setCancelModal(null); setCancelMessage('') }} disabled={cancelLoading}>Keep Task</button><button className="btn btn-danger" onClick={handleCancel} disabled={cancelLoading}>{cancelLoading ? <><span className="spinner spinner-sm" /> Cancelling...</> : 'Yes, Cancel Task'}</button></>}</div></div></div>}

        {ratingModal && <div className="modal-overlay" onClick={() => setRatingModal(null)}><div className="modal-box" onClick={e => e.stopPropagation()}><div className="modal-header"><h3><i className="fas fa-star" /> Rate the Runner</h3><button className="btn-close" onClick={() => setRatingModal(null)}><i className="fas fa-times" /></button></div><div className="modal-body"><p className="mb-3">How was <strong>{ratingModal.helperName}</strong> on: <strong>{ratingModal.taskDescription}</strong>?</p><div className="form-group"><label className="form-label">Rating</label><div style={{ display: 'flex', gap: '0.5rem', fontSize: '1.5rem' }}>{[1,2,3,4,5].map(n => <span key={n} style={{ cursor: 'pointer', color: n <= ratingValue ? '#F59E0B' : 'var(--border)' }} onClick={() => setRatingValue(n)}><i className="fas fa-star" /></span>)}</div></div><div className="form-group"><label className="form-label">Review (optional)</label><textarea className="form-textarea" placeholder="Share your experience..." value={ratingReview} onChange={e => setRatingReview(e.target.value)} rows={3} /></div></div>{ratingError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', padding: '0 1.5rem 0.5rem' }}>{ratingError}</p>}<div className="modal-footer"><button className="btn btn-secondary" onClick={() => { setRatingModal(null); setRatingError('') }}>Skip</button><button className="btn btn-primary" onClick={handleRating} disabled={ratingLoading}>{ratingLoading ? <><span className="spinner spinner-sm" /> Submitting...</> : 'Submit Rating'}</button></div></div></div>}

        {detailsModal && <div className="modal-overlay" onClick={() => setDetailsModal(null)}><div className="modal-box" onClick={e => e.stopPropagation()}><div className="modal-header"><h3><i className="fas fa-info-circle" /> Task Details</h3><button className="btn-close" onClick={() => setDetailsModal(null)}><i className="fas fa-times" /></button></div><div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}><div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Task Name</div><div style={{ fontWeight: 600 }}>{detailsModal.taskName || detailsModal.taskId}</div></div><div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Task Details</div><div style={{ fontSize: '0.8125rem', lineHeight: 1.6 }}>{detailsModal.taskDescription}</div></div><div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}><div style={{ flex: 1 }}><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Status</div><span className={getStatusBadge(detailsModal.taskStatus || detailsModal.status || '')}>{detailsModal.taskStatus || detailsModal.status}</span></div><div style={{ flex: 1 }}><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Budget</div><div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1.1rem' }}>R{detailsModal.budget}</div></div></div><div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}><div style={{ flex: 1 }}><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Category</div><div>{detailsModal.category}</div></div><div style={{ flex: 1 }}><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Area</div><div>{detailsModal.area}</div></div></div>{detailsModal.dateNeeded && <div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Date Needed</div><div>{new Date(detailsModal.dateNeeded).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</div></div>}{(detailsModal.helperName || detailsModal.helperContact) && <div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Runner</div><div style={{ fontWeight: 500 }}>{detailsModal.helperName}</div>{detailsModal.helperContact && <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{detailsModal.helperContact}</div>}</div>}{detailsModal.notes && <div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Notes</div><div style={{ fontSize: '0.8125rem' }}>{detailsModal.notes}</div></div>}</div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setDetailsModal(null)}>Close</button>{detailsModal.helperContact && <a href={`tel:${detailsModal.helperContact}`} className="btn btn-outline"><i className="fas fa-phone" /> Call Runner</a>}{(detailsModal.taskStatus === 'claimed' || (detailsModal.status as string)?.toLowerCase() === 'claimed') && <button className="btn btn-primary" onClick={() => { setDetailsModal(null); navigate(`/tasks/${detailsModal.taskId}/chat`) }}><i className="fas fa-comment" /> Chat</button>}</div></div></div>}
      </div>
      {ProfileIncompleteModal}
    </>
  )
}
