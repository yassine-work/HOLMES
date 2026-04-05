import { useCallback, useEffect, useMemo, useState } from 'react'

const TOKEN_KEY = 'holmes_token'
const AUTH_CHANGE_EVENT = 'holmes-auth-change'

function decodePayload(token) {
  try {
    const payload = token.split('.')[1]
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(normalized)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

function emitAuthChange() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
}

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))

  useEffect(() => {
    const handleChange = () => setToken(localStorage.getItem(TOKEN_KEY))
    window.addEventListener('storage', handleChange)
    window.addEventListener(AUTH_CHANGE_EVENT, handleChange)

    return () => {
      window.removeEventListener('storage', handleChange)
      window.removeEventListener(AUTH_CHANGE_EVENT, handleChange)
    }
  }, [])

  const payload = useMemo(() => (token ? decodePayload(token) : null), [token])
  const isAdmin = Boolean(
    payload?.is_admin || payload?.isAdmin || payload?.role === 'admin',
  )

  const login = useCallback((nextToken) => {
    localStorage.setItem(TOKEN_KEY, nextToken)
    setToken(nextToken)
    emitAuthChange()
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    emitAuthChange()
  }, [])

  return {
    token,
    login,
    logout,
    isAdmin,
  }
}
