import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { tasksApi, categoryApi, userPreferencesApi } from '../../api'
import { useAuth } from '../../context/AuthContext'
import './PostErrand.css'

const DEFAULT_CATEGORIES = ['Grocery Shopping','Delivery','Cleaning','Gardening','Moving','Repairs','Tutoring','Pet Care','Cooking','Other']

function validateTaskForm(values: {
  taskName: string
  taskDescription: string
  category: string
  customCategory: string
  area: string
  priority: string
  dateNeeded: string
  budget: string
  notes: string
  termsAccepted: boolean
}) {
  const errors: Record<string, string> = {}
  const name = values.taskName.trim()
  if (!name) errors.taskName = 'Task name is required.'
  else if (name.length > 60) errors.taskName = 'Task name must be 60 characters or less.'
  const description = values.taskDescription.trim()
  if (!description) errors.taskDescription = 'Task description is required.'
  else if (description.length < 20 || description.length > 500) errors.taskDescription = 'Task description must be between 20 and 500 characters.'
  const categoryValue = values.category === 'Other' ? values.customCategory.trim() : values.category.trim()
  if (!categoryValue) errors.category = 'Please select a category.'
  const area = values.area.trim()
  if (!area) errors.area = 'Location is required.'
  else if (area.length < 2) errors.area = 'Area must be at least 2 characters long.'
  const priority = values.priority.trim().toLowerCase()
  if (!['standard', 'urgent', 'low', 'medium', 'high'].includes(priority)) errors.priority = 'Please choose a valid priority.'
  const budgetValue = Number(values.budget)
  if (!values.budget || Number.isNaN(budgetValue)) errors.budget = 'Budget is required.'
  else if (budgetValue < 50 || budgetValue > 100000) errors.budget = 'Budget must be between R50 and R100000.'
  if (values.dateNeeded) {
    const date = new Date(values.dateNeeded)
    const now = new Date()
    if (Number.isNaN(date.getTime())) errors.dateNeeded = 'Please enter a valid date.'
    else if (date <= new Date(now.getTime() + 30 * 60 * 1000)) errors.dateNeeded = 'Date needed must be in the future.'
    else if (date > new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)) errors.dateNeeded = 'Date needed cannot be more than 365 days in the future.'
  } else errors.dateNeeded = 'Please select a deadline.'
  if (values.notes.trim().length > 1000) errors.notes = 'Notes must be 1000 characters or less.'
  if (!values.termsAccepted) errors.termsAccepted = 'You must accept the terms and conditions.'
  return { valid: Object.keys(errors).length === 0, errors }
}

function validateStepOne(values: { taskName: string; taskDescription: string; category: string; customCategory: string; area: string; priority: string }) {
  const errors: Record<string, string> = {}
  const name = values.taskName.trim()
  if (!name) errors.taskName = 'Task name is required.'
  else if (name.length > 60) errors.taskName = 'Task name must be 60 characters or less.'
  const description = values.taskDescription.trim()
  if (!description) errors.taskDescription = 'Task description is required.'
  else if (description.length < 20 || description.length > 500) errors.taskDescription = 'Task description must be between 20 and 500 characters.'
  const categoryValue = values.category === 'Other' ? values.customCategory.trim() : values.category.trim()
  if (!categoryValue) errors.category = 'Please select a category.'
  const area = values.area.trim()
  if (!area) errors.area = 'Location is required.'
  else if (area.length < 2) errors.area = 'Area must be at least 2 characters long.'
  const priority = values.priority.trim().toLowerCase()
  if (!['standard', 'urgent', 'low', 'medium', 'high'].includes(priority)) errors.priority = 'Please choose a valid priority.'
  return { valid: Object.keys(errors).length === 0, errors }
}

function validateStepTwo(values: { dateNeeded: string; budget: string }) {
  const errors: Record<string, string> = {}
  const budgetValue = Number(values.budget)
  if (!values.budget || Number.isNaN(budgetValue)) errors.budget = 'Budget is required.'
  else if (budgetValue < 50 || budgetValue > 100000) errors.budget = 'Budget must be between R50 and R100000.'
  if (values.dateNeeded) {
    const date = new Date(values.dateNeeded)
    const now = new Date()
    if (Number.isNaN(date.getTime())) errors.dateNeeded = 'Please enter a valid date.'
    else if (date <= new Date(now.getTime() + 30 * 60 * 1000)) errors.dateNeeded = 'Date needed must be in the future.'
    else if (date > new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)) errors.dateNeeded = 'Date needed cannot be more than 365 days in the future.'
  } else errors.dateNeeded = 'Please select a deadline.'
  return { valid: Object.keys(errors).length === 0, errors }
}

export default function PostErrand() {
  const { user, isAuthenticated, canPostErrands } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const isEdit = !!editId

  useEffect(() => {
    if (isAuthenticated() && !canPostErrands()) navigate('/dashboard')
  }, [isAuthenticated, canPostErrands, navigate])

  const [step, setStep] = useState(1)
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [showCustom, setShowCustom] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [minAmount, setMinAmount] = useState(50)
  const [maxAmount, setMaxAmount] = useState(5000)
  const [form, setForm] = useState({ taskName: '', taskDescription: '', category: '', customCategory: '', area: '', priority: 'standard', dateNeeded: '', budget: '', notes: '', termsAccepted: false })

  useEffect(() => {
    categoryApi.getAll().then(r => {
      const cats = r.data?.data || r.data
      if (Array.isArray(cats) && cats.length) setCategories([...cats.map((c: any) => c.name || c), 'Other'])
    }).catch(() => {})
    userPreferencesApi.get().then(r => {
      const d = r.data?.data
      if (d?.minTaskAmount) setMinAmount(d.minTaskAmount)
      if (d?.maxTaskAmount) setMaxAmount(d.maxTaskAmount)
    }).catch(() => {})
    if (editId) {
      tasksApi.getById(editId).then(r => {
        const t = r.data?.data || r.data
        if (t) setForm(f => ({ ...f, taskName: DOMPurify.sanitize(t.taskName || t.title || '', { ALLOWED_TAGS: [] }), taskDescription: DOMPurify.sanitize(t.taskDescription || t.description || '', { ALLOWED_TAGS: [] }), category: DOMPurify.sanitize(t.category || '', { ALLOWED_TAGS: [] }), area: DOMPurify.sanitize(t.area || t.location || '', { ALLOWED_TAGS: [] }), priority: t.priority || 'standard', dateNeeded: (t.dateNeeded || t.dueDate) ? (t.dateNeeded || t.dueDate).substring(0, 16) : '', budget: String(t.budget || ''), notes: DOMPurify.sanitize(t.notes || '', { ALLOWED_TAGS: [] }) }))
      }).catch(() => {})
    }
  }, [editId])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
    setForm(f => ({ ...f, [field]: val }))
    if (field === 'category') setShowCustom(e.target.value === 'Other')
    const result = validateTaskForm({ ...form, [field]: val } as any)
    setFieldErrors(prev => ({ ...prev, [field]: result.errors[field] || '' }))
    if (field === 'termsAccepted' && result.errors.termsAccepted) setError(result.errors.termsAccepted)
  }

  const isStep1Valid = () => validateStepOne({ taskName: form.taskName, taskDescription: form.taskDescription, category: form.category, customCategory: form.customCategory, area: form.area, priority: form.priority }).valid
  const isStep2Valid = () => validateStepTwo({ dateNeeded: form.dateNeeded, budget: form.budget }).valid
  const budget = parseFloat(form.budget) || 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.termsAccepted) { setError('Please accept the terms and conditions.'); return }
    setSubmitting(true); setError('')
    try {
      const payload = {
        taskName: DOMPurify.sanitize(form.taskName, { ALLOWED_TAGS: [] }),
        taskDescription: DOMPurify.sanitize(form.taskDescription, { ALLOWED_TAGS: [] }),
        category: DOMPurify.sanitize(form.category === 'Other' ? form.customCategory : form.category, { ALLOWED_TAGS: [] }),
        area: DOMPurify.sanitize(form.area, { ALLOWED_TAGS: [] }),
        priority: form.priority,
        dateNeeded: form.dateNeeded,
        budget: parseFloat(form.budget),
        notes: DOMPurify.sanitize(form.notes, { ALLOWED_TAGS: [] }),
        termsAccepted: form.termsAccepted,
      }
      const res = isEdit ? await tasksApi.update(editId!, payload) : await tasksApi.create(payload)
      const data = res.data
      if (data.success === false) { setError(data.message || 'Failed to create task.'); return }
      if (isEdit) { navigate('/tasks/my-posted'); return }
      const taskId = String(data.data?.taskId || '')
      if (!taskId) { setError('Task was created but no task reference was returned. Please contact support.'); return }
      navigate('/tasks/payment?taskId=' + encodeURIComponent(taskId))
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to submit task.')
    } finally { setSubmitting(false) }
  }

  if (!isAuthenticated()) {
    return <div className="post-page"><div className="container"><div className="login-required-card"><i className="fas fa-user-lock" /><h3>Join the Community</h3><p>Sign in to start posting tasks and connecting with helpers</p><button className="btn btn-primary btn-lg" onClick={() => navigate('/login')}><i className="fas fa-sign-in-alt" /> Sign In</button></div></div></div>
  }

  return (
    <div className="post-page">
      <section className="post-page-heading">
        <div>
          <div className="admin-eyebrow"><i className="fas fa-plus-circle" /> TASK CREATION</div>
          <h1>{isEdit ? 'Edit Your Task' : 'Create Your Task'}</h1>
          <p>{isEdit ? 'Update your task details and keep your task information current.' : "Turn a task on your list into an opportunity for someone in your community."}</p>
        </div>
        <div className="post-page-heading-meta">
          <span><i className="fas fa-university" /> Manual EFT</span>
          <span><i className="fas fa-shield-halved" /> Admin verified</span>
        </div>
      </section>
      <section className="post-form-card admin-panel">
        <div className="form-steps">{['Details', 'Budget', 'Payment'].map((s, i) => <div key={i} className={`form-step ${step > i + 1 ? 'done' : ''} ${step === i + 1 ? 'active' : ''}`}><span className="step-num">{step > i + 1 ? <i className="fas fa-check" /> : i + 1}</span><span>{s}</span></div>)}</div>
        {error && <div className="alert alert-error mb-4"><i className="fas fa-exclamation-circle" /> {error}</div>}
        <form onSubmit={handleSubmit}>
          {step === 1 && <div className="form-section">
            <h3><i className="fas fa-clipboard-list" /> What do you need done?</h3>
            <div className="form-group"><label className="form-label">Task Name * <small className="text-muted">(short title, max 60 chars)</small></label><input className="form-input" placeholder="e.g. Car Wash Vereeniging, Grocery Run Sandton" value={form.taskName} onChange={set('taskName')} maxLength={60} required /><small className="text-muted text-xs">{form.taskName.length}/60 characters</small></div>
            <div className="form-group"><label className="form-label">Describe your task *</label><textarea className="form-textarea" rows={4} placeholder="Tell us what you need help with..." value={form.taskDescription} onChange={set('taskDescription')} required minLength={10} /><small className="text-muted text-xs">Be specific - the more details, the better matches!</small>{fieldErrors.taskDescription && <small className="text-error">{fieldErrors.taskDescription}</small>}</div>
            <div className="form-group"><label className="form-label">Category *</label><div className="input-with-icon"><i className="fas fa-tags" /><select className="form-select" value={form.category} onChange={set('category')} required><option value="">Select a category...</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>{fieldErrors.category && <small className="text-error">{fieldErrors.category}</small>}{showCustom && <input className="form-input mt-2" placeholder="Enter custom category..." value={form.customCategory} onChange={set('customCategory')} required={showCustom} />}</div>
            <div className="form-row-2"><div className="form-group"><label className="form-label">Location *</label><div className="input-with-icon"><i className="fas fa-map-marker-alt" /><input className="form-input" placeholder="Area / Suburb" value={form.area} onChange={set('area')} required /></div>{fieldErrors.area && <small className="text-error">{fieldErrors.area}</small>}</div><div className="form-group"><label className="form-label">Urgency *</label><div className="priority-options">{[{ v: 'standard', icon: 'fa-clock', label: 'Standard', sub: '48 hours' }, { v: 'urgent', icon: 'fa-bolt', label: 'Urgent', sub: '24 hours' }].map(p => <label key={p.v} className={`priority-card ${form.priority === p.v ? 'selected' : ''}`}><input type="radio" name="priority" value={p.v} checked={form.priority === p.v} onChange={set('priority')} /><i className={`fas ${p.icon}`} /><span>{p.label}</span><small>{p.sub}</small></label>)}</div></div></div>
            <div className="step-nav"><button type="button" className="btn btn-primary" onClick={() => isStep1Valid() && setStep(2)} disabled={!isStep1Valid()}>Next <i className="fas fa-arrow-right" /></button></div>
          </div>}
          {step === 2 && <div className="form-section"><h3><i className="fas fa-calendar-alt" /> When & How Much?</h3><div className="form-row-2"><div className="form-group"><label className="form-label">Deadline *</label><div className="input-with-icon"><i className="fas fa-calendar" /><input type="datetime-local" className="form-input" value={form.dateNeeded} onChange={set('dateNeeded')} required /></div>{fieldErrors.dateNeeded && <small className="text-error">{fieldErrors.dateNeeded}</small>}</div><div className="form-group"><label className="form-label">Your Budget (R) *</label><div className="budget-input-wrap"><span className="currency-prefix">R</span><input type="number" className="form-input budget-input" placeholder="100.00" min={minAmount} max={maxAmount} step={0.01} value={form.budget} onChange={set('budget')} required /></div><small className="text-muted text-xs">R{minAmount} minimum · R{maxAmount} maximum</small>{fieldErrors.budget && <small className="text-error">{fieldErrors.budget}</small>}{budget >= 50 && <div className="commission-breakdown"><div className="breakdown-row total"><span>Task Budget:</span><span>R{budget.toFixed(2)}</span></div><small className="text-muted">Final platform fee and runner payout are calculated by DFY and confirmed by the backend.</small></div>}</div></div><div className="step-nav"><button type="button" className="btn btn-secondary" onClick={() => setStep(1)}><i className="fas fa-arrow-left" /> Previous</button><button type="button" className="btn btn-primary" onClick={() => isStep2Valid() && setStep(3)} disabled={!isStep2Valid()}>Next <i className="fas fa-arrow-right" /></button></div></div>}
          {step === 3 && <div className="form-section"><div className="form-group"><label className="form-label">Anything else? (Optional)</label><textarea className="form-textarea" rows={3} placeholder="Special requirements, preferences..." value={form.notes} onChange={set('notes')} /></div><label className="terms-check"><input type="checkbox" checked={form.termsAccepted} onChange={set('termsAccepted')} /><span>I agree to the <a href="/terms" target="_blank">Terms & Conditions</a></span></label><div className="payment-info-card"><div className="payment-info-header"><i className="fas fa-university" /><h4>Manual EFT payment</h4></div><div className="payment-features"><span><i className="fas fa-building-columns" /> Capitec Business</span><span><i className="fas fa-shield-halved" /> Admin verified</span><span><i className="fas fa-clock" /> 24-hour payment window</span></div><p className="text-muted text-xs text-center mt-2">After creating the task, you will receive the bank details. Your task remains private until an administrator confirms the EFT.</p></div><div className="step-nav"><button type="button" className="btn btn-secondary" onClick={() => setStep(2)}><i className="fas fa-arrow-left" /> Previous</button><button type="submit" className="btn btn-primary btn-lg" disabled={submitting || !form.termsAccepted}>{submitting ? <><span className="spinner spinner-sm" /> {isEdit ? 'Saving...' : 'Creating...'}</> : <><i className={`fas ${isEdit ? 'fa-save' : 'fa-file-invoice-dollar'}`} /> {isEdit ? 'Save Changes' : 'Create Task & Pay by EFT'}</>}</button></div></div>}
        </form>
      </section>
    </div>
  )
}
