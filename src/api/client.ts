import axios from 'axios'
import env from '../env'

const isGoogleScript = /^https:\/\/script\.google\.com\/macros\//i.test(env.apiUrl)

const api = axios.create({
  baseURL: env.apiUrl,
  headers: { 'Content-Type': isGoogleScript ? 'text/plain;charset=utf-8' : 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (isGoogleScript) {
    const method = String(config.method || 'get').toUpperCase()
    const path = config.url || '/'
    const query = (config.params || {}) as Record<string, unknown>
    config.method = 'post'
    config.data = JSON.stringify({
      path,
      method,
      body: config.data || {},
      token: token || '',
      query,
    })
    config.params = undefined
    delete config.headers.Authorization
    config.headers['Content-Type'] = 'text/plain;charset=utf-8'
    return config
  }
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('currentUser')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
