import api from './client'
import type { LoginModel, RegisterModel, AuthResponse } from '../types'

export const publicApi = {
  getStats: () => api.get('/public/stats'),
}

export const authApi = {
  login: (data: LoginModel) => api.post<AuthResponse>('/auth/login', data),
  register: (data: RegisterModel) => api.post<AuthResponse>('/auth/register', data),
  changePassword: (data: object) => api.post('/auth/change-password', data),
  getProfile: () => api.get('/user/profile'),
  updateProfile: (data: object) => api.put('/user/profile', data),
  validateId: (idNumber: string) => api.post('/user/validate-id', { idNumber }),
}

export const messagesApi = {
  getConversations: () => api.get('/messages/conversations'),
}

export const tasksApi = {
  getAvailable: (page = 1, pageSize = 10, filters: Record<string, string> = {}) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...filters })
    return api.get(`/tasks/available?${params}`)
  },
  getMyPosted: () => api.get('/tasks/my-posted'),
  getMyActive: () => api.get('/tasks/my-active'),
  getMyCompleted: () => api.get('/tasks/my-completed'),
  getById: (id: string) => api.get(`/tasks/${id}`),
  create: (data: object) => api.post('/tasks', data),
  update: (id: string, data: object) => api.put(`/tasks/${id}`, data),
  claim: (id: string, helperName: string, helperContact: string, termsAccepted = false) => api.post(`/tasks/${id}/claim`, { HelperName: helperName, HelperContact: helperContact, TermsAccepted: termsAccepted }),
  complete: (id: string) => api.post(`/tasks/${id}/complete`, {}),
  confirm: (id: string) => api.post(`/tasks/${id}/confirm`, {}),
  cancel: (id: string, reason: string) => api.post(`/tasks/${id}/cancel`, { reason }),
  getMessages: (id: string, params?: object) => api.get(`/tasks/${id}/messages`, { params }),
  sendMessage: (id: string, content: string) => api.post(`/tasks/${id}/messages`, { content }),
  markMessagesRead: (id: string) => api.put(`/tasks/${id}/messages/read`, {}),
  addProgress: (id: string, message: string) => api.post(`/tasks/${id}/progress`, { progressNote: message }),
  getDashboardStats: () => api.get('/tasks/dashboard/stats'),
  getRecentActivity: (limit = 5) => api.get(`/tasks/dashboard/activity?limit=${limit}`),
  getPaymentHistory: () => api.get('/tasks/payment-history'),
  getPaymentUrl: (id: string) => api.get(`/tasks/${id}/payment-url`),
  submitManualPayment: (id: string, data: { paidAmount: number; senderReference: string; paidAt: string; proofOfPayment?: string }) =>
    api.post(`/tasks/${id}/payment-submit`, data),
  cleanup: () => api.post('/tasks/cleanup', {}),
  getFilters: () => api.get('/tasks/filters'),
}

export const bankingApi = {
  getBankAccounts: () => api.get('/banking/accounts'),
  getBanks: () => api.get('/banking/banks'),
  addBankAccount: (data: object) => api.post('/banking/accounts', data),
  verifyBankAccount: (id: number) => api.post(`/banking/bank-accounts/${id}/verify`, {}),
}

export const supportApi = {
  createTicket: (data: { name?: string; email?: string; subject: string; message: string; category?: string; priority?: string }) => api.post('/support/tickets', data),
  getMyTickets: () => api.get('/support/tickets'),
  getTicket: (id: number) => api.get(`/support/tickets/${id}`),
}

export const adminApi = {
  getDashboard: () => api.get('/admin/dashboard'),
  getPayments: () => api.get('/admin/payments'),
  getPendingManualPayments: () => api.get('/admin/payments/pending'),
  verifyManualPayment: (id: number, amount: number, note = '') => api.post(`/admin/payments/${id}/verify`, { amount, note }),
  rejectManualPayment: (id: number, reason: string) => api.post(`/admin/payments/${id}/reject`, { reason }),
  getTasks: (params?: object) => api.get('/admin/tasks', { params }),
  verifyPayment: (id: string, reason: string) => api.patch(`/admin/tasks/${id}/verify`, { reason }),
  unverifyPayment: (id: string, reason: string) => api.patch(`/admin/tasks/${id}/unverify`, { reason }),
  bulkVerify: (ids: string[], reason: string) => api.patch('/admin/tasks/bulk-verify', { taskIds: ids, reason }),
  forceReleaseEscrow: (id: string, reason: string) => api.patch(`/admin/tasks/${id}/force-release-escrow`, { reason }),
  getUsers: (params?: object) => api.get('/admin/users', { params }),
  updateUserStatus: (id: number, isVerified: boolean, reason: string) => api.patch(`/admin/users/${id}/status`, { isVerified, reason }),
  updateUserRole: (id: number, role: string, reason: string) => api.patch(`/admin/users/${id}/role`, { role, reason }),
  getUserTaskHistory: (id: number) => api.get(`/admin/users/${id}/tasks`),
  getAuditLogs: (page = 1, pageSize = 20) => api.get(`/admin/audit-logs?page=${page}&pageSize=${pageSize}`),
  getBankAccounts: (unverifiedOnly?: boolean) => api.get('/admin/bank-accounts', { params: { unverifiedOnly } }),
  verifyBankAccount: (id: number) => api.patch(`/admin/bank-accounts/${id}/verify`, {}),
  getDisputes: (params?: object) => api.get('/disputes', { params }),
  resolveDispute: (id: number, resolution: string, action: string, reason: string) => api.patch(`/disputes/${id}/resolve`, { resolution, action, reason }),
  deleteTask: (taskId: string) => api.delete(`/admin/tasks/${taskId}`),
  deleteUser: (userId: number) => api.delete(`/admin/users/${userId}`),
  getTaskMessages: (taskId: string) => api.get(`/admin/tasks/${taskId}/messages`),
}

export const disputesApi = {
  raise: (taskId: string, issue: string, category: string) => api.post('/disputes', { taskId, issue, category }),
  getMy: () => api.get('/disputes/my'),
}

export const ratingsApi = {
  submit: (taskId: string, ratingValue: number, review?: string) => api.post('/ratings', { taskId, ratingValue, review }),
  getForUser: (userId: number, page = 1, pageSize = 5) => api.get(`/ratings/user/${userId}?page=${page}&pageSize=${pageSize}`),
  canRate: (taskId: string) => api.get(`/ratings/can-rate/${taskId}`),
}

export const categoryApi = { getAll: () => api.get('/categories') }

export const userPreferencesApi = {
  get: () => api.get('/user/preferences'),
  update: (data: object) => api.put('/user/preferences', data),
}

export const notificationsApi = {
  getAll: (page = 1, pageSize = 20, type?: string, unreadOnly?: boolean) => {
    const params: any = { page, pageSize }
    if (type) params.type = type
    if (unreadOnly) params.unreadOnly = true
    return api.get('/notifications', { params })
  },
  markRead: (id: string) => api.post(`/notifications/${id}/mark-read`, {}),
  markAllRead: () => api.post('/notifications/mark-all-read', {}),
  markTaskRead: (taskId: number) => api.post('/notifications/mark-task-read', { taskId }),
  remove: (id: string) => api.delete(`/notifications/${id}`),
  clearRead: () => api.delete('/notifications/clear-read'),
}
