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
