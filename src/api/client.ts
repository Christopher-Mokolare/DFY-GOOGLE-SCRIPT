import axios from 'axios'
import env from '../env'

const isGoogleScript =
  /^https:\/\/script\.google\.com\/macros\//i.test(env.apiUrl) ||
  env.apiUrl.startsWith('/gs/')

const api = axios.create({
  baseURL: env.apiUrl,
  headers: {
    'Content-Type': isGoogleScript
      ? 'text/plain;charset=utf-8'
      : 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || ''

  if (!isGoogleScript) {
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  }

  const method = String(config.method || 'get').toUpperCase()
  const path = config.url || '/'
  const query = (config.params || {}) as Record<string, unknown>

  if (method === 'GET') {
    config.method = 'get'
    config.params = { path, ...query, token }
    if (config.headers.set) config.headers.set('Content-Type', 'text/plain;charset=utf-8')
    else config.headers['Content-Type'] = 'text/plain;charset=utf-8'
    return config
  }

  config.method = 'post'
  config.data = JSON.stringify({
    path,
    method,
    body: config.data || {},
    token,
    query,
  })
  config.params = undefined
  if (config.headers.delete) config.headers.delete('Authorization')
  else delete config.headers.Authorization
  if (config.headers.set) config.headers.set('Content-Type', 'text/plain;charset=utf-8')
  else config.headers['Content-Type'] = 'text/plain;charset=utf-8'
  return config
})

api.interceptors.response.use(
  (res) => {
    if (isGoogleScript && res.data && res.data.success === false) {
      const msg = String(res.data.message || '')
      if (/unauthorized|forbidden|invalid.*token|session/i.test(msg)) {
        localStorage.removeItem('token')
        localStorage.removeItem('currentUser')
        localStorage.removeItem('refreshToken')
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
        }
      }
    }
    return res
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('currentUser')
      localStorage.removeItem('refreshToken')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
