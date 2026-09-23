#!/usr/bin/env bash
set -e

echo ""
echo "================================================================"
echo " DFY — Full local setup"
echo "================================================================"
echo ""

# ---------------------------------------------------------------
# 1. Ensure Node 20 (Vite 8 breaks on Node 26)
# ---------------------------------------------------------------
echo "▶ [1/7] Checking Node version..."

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi

if command -v nvm >/dev/null 2>&1; then
  nvm install 20 >/dev/null
  nvm use 20 >/dev/null
fi

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
echo "   Node version: $(node -v)"

if [ "$NODE_MAJOR" -lt 20 ] || [ "$NODE_MAJOR" -gt 22 ]; then
  echo "   ⚠  Node $NODE_MAJOR detected. Vite 8 needs Node 20–22."
  echo "   ⚠  Install nvm, then re-run this script:"
  echo "        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "        source ~/.zshrc"
  echo "        nvm install 20 && nvm use 20"
  exit 1
fi

# ---------------------------------------------------------------
# 2. Write .env.local
# ---------------------------------------------------------------
echo "▶ [2/7] Writing .env.local..."

cat > .env.local <<'ENV_EOF'
VITE_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/AKfycbzp9A6rA94K3WWJfrOlynr7c1W83KOUCvKoNO0tUq59ii7gNBuuBBpayyz4HMkWUSmA5w/exec
ENV_EOF

echo "   ✓ .env.local written"

# ---------------------------------------------------------------
# 3. Replace src/api/client.ts
# ---------------------------------------------------------------
echo "▶ [3/7] Writing src/api/client.ts..."

[ -f src/api/client.ts ] && cp src/api/client.ts src/api/client.ts.bak

cat > src/api/client.ts <<'CLIENT_EOF'
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
CLIENT_EOF

echo "   ✓ src/api/client.ts written (backup at src/api/client.ts.bak)"

# ---------------------------------------------------------------
# 4. Replace src/context/AuthContext.tsx
# ---------------------------------------------------------------
echo "▶ [4/7] Writing src/context/AuthContext.tsx..."

[ -f src/context/AuthContext.tsx ] && cp src/context/AuthContext.tsx src/context/AuthContext.tsx.bak

cat > src/context/AuthContext.tsx <<'AUTH_EOF'
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { User } from '../types'
import { authApi } from '../api'


interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  loginTransitioning: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => void
  refreshUser: () => void
  isAuthenticated: () => boolean
  isAdmin: () => boolean
  isProfileComplete: () => boolean
  isProfileIncomplete: () => boolean
  canPostErrands: () => boolean
  canAcceptTasks: () => boolean
  getProfileCompletion: () => number
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session] = useState(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('currentUser')
    if (!storedToken || !storedUser) return { token: null as string | null, user: null as User | null }
    try {
      return { token: storedToken, user: JSON.parse(storedUser) as User }
    } catch {
      localStorage.removeItem('token')
      localStorage.removeItem('currentUser')
      return { token: null as string | null, user: null as User | null }
    }
  })
  const [user, setUser] = useState<User | null>(session.user)
  const [token, setToken] = useState<string | null>(session.token)
  const [loading, setLoading] = useState(false)
  const [loginTransitioning, setLoginTransitioning] = useState(false)

  useEffect(() => {
    if (!session.token || !session.user?.id) return
    authApi.getProfile()
      .then(r => {
        const d = r.data?.data || r.data
        if (d) {
          const merged = { ...session.user, ...d }
          localStorage.setItem('currentUser', JSON.stringify(merged))
          setUser(merged)
        }
      })
      .catch(() => { /* keep the synchronously restored user */ })
  }, [session.token, session.user])

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    setLoginTransitioning(true)
    try {
      const res = await authApi.login({ email, password })
      const data = res.data
      if (!data.success || !data.token || !data.user) {
        throw new Error(data.message || 'Login failed')
      }
      localStorage.setItem('token', data.token)
      setToken(data.token)
      let fullUser = data.user
      try {
        const profileRes = await authApi.getProfile()
        const profileData = profileRes.data?.data || profileRes.data
        if (profileData) fullUser = { ...data.user, ...profileData }
      } catch { /* fall back to login user */ }
      localStorage.setItem('currentUser', JSON.stringify(fullUser))
      setUser(fullUser)
      setTimeout(() => setLoginTransitioning(false), 0)
      return fullUser
    } catch (error) {
      setLoginTransitioning(false)
      throw error
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('currentUser')
    localStorage.removeItem('refreshToken')
    setToken(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(() => {
    authApi.getProfile()
      .then(r => {
        const d = r.data?.data || r.data
        if (d) {
          localStorage.setItem('currentUser', JSON.stringify(d))
          setUser(d)
        }
      })
      .catch(() => { /* retain current state on transient refresh failure */ })
  }, [])

  // Apps Script tokens are opaque (uuid-uuid), not JWTs.
  // The backend validates on every request; here we just check presence.
  const isAuthenticated = useCallback(() => {
    if (!token) return false
    return !!user
  }, [token, user])

  const isAdmin = useCallback(() => {
    if (!user) return false
    if (typeof user.isAdmin === 'boolean' && user.isAdmin) return true
    if (user.roles?.includes('Admin')) return true
    return user.userType === 'Admin'
  }, [user])

  const isProfileComplete = useCallback(() => user?.profileCompleted === true, [user])

  const isProfileIncomplete = useCallback(() => !isProfileComplete(), [isProfileComplete])

  const canPostErrands = useCallback(() => (
    isAuthenticated() && !isAdmin() && user?.canCreateTasks === true
  ), [user, isAuthenticated, isAdmin])

  const canAcceptTasks = useCallback(() => (
    isAuthenticated() && !isAdmin() && user?.canAcceptTasks === true
  ), [user, isAuthenticated, isAdmin])

  const getProfileCompletion = useCallback(() => user?.profileCompletion ?? 0, [user])

  return (
    <AuthContext.Provider value={{
      user, token, loading, loginTransitioning,
      login, logout, refreshUser,
      isAuthenticated, isAdmin,
      isProfileComplete, isProfileIncomplete,
      canPostErrands, canAcceptTasks,
      getProfileCompletion,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
AUTH_EOF

echo "   ✓ src/context/AuthContext.tsx written (backup at src/context/AuthContext.tsx.bak)"

# ---------------------------------------------------------------
# 5. Clean reinstall
# ---------------------------------------------------------------
echo "▶ [5/7] Cleaning node_modules and reinstalling (1–3 min)..."

rm -rf node_modules package-lock.json
npm cache clean --force >/dev/null 2>&1
npm install --no-audit --no-fund

echo "   ✓ Dependencies installed"

# ---------------------------------------------------------------
# 6. TypeScript check (fail fast before dev server)
# ---------------------------------------------------------------
echo "▶ [6/7] Running TypeScript check..."

npx tsc --noEmit || {
  echo ""
  echo "   ⚠  TypeScript errors found above."
  echo "   ⚠  Fix them, then run: npm run dev"
  exit 1
}

echo "   ✓ TypeScript clean"

# ---------------------------------------------------------------
# 7. Verify edits landed
# ---------------------------------------------------------------
echo "▶ [7/7] Verifying configuration..."

grep -q 'return !!user' src/context/AuthContext.tsx \
  && echo "   ✓ AuthContext.tsx has the fix" \
  || { echo "   ✗ AuthContext.tsx fix missing"; exit 1; }

grep -q 'isGoogleScript' src/api/client.ts \
  && echo "   ✓ client.ts has the fix" \
  || { echo "   ✗ client.ts fix missing"; exit 1; }

grep -q 'VITE_GOOGLE_SCRIPT_URL' .env.local \
  && echo "   ✓ .env.local configured" \
  || { echo "   ✗ .env.local missing"; exit 1; }

echo ""
echo "================================================================"
echo " ✅ Everything is ready."
echo ""
echo " Start the dev server:"
echo "    npm run dev"
echo ""
echo " Then open:"
echo "    http://localhost:3000/login"
echo ""
echo " Login with:"
echo "    2co.mokolare@gmail.com"
echo "    ewew00f0E#"
echo "================================================================"
echo ""
