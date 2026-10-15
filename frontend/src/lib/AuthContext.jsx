import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { notify } from './ToastContext'

const AuthContext = createContext(null)
const BOOT_RETRY_DELAYS = [1500, 3000, 6000]   // free-tier hosts can take a while to wake up
const FOCUS_RECHECK_MS = 60_000

const transient = (err) => !err.status || err.status >= 500

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [waking, setWaking] = useState(false)          // first check failed, retrying
  const [unavailable, setUnavailable] = useState(false) // server unreachable, session state unknown
  // Every sign in/out/expiry bumps the epoch. A slower, older /auth/me answer must not overwrite it.
  const epoch = useRef(0)
  const lastCheck = useRef(0)
  const userRef = useRef(null)
  userRef.current = user

  const refresh = useCallback(async ({ boot = false } = {}) => {
    const mine = epoch.current
    if (boot) { setLoading(true); setWaking(false) }
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await api.authMe()
        if (mine !== epoch.current) return
        setUser(result.user || null)
        setUnavailable(false)
        lastCheck.current = Date.now()
        break
      } catch (err) {
        if (mine !== epoch.current) return
        if (!transient(err)) { setUser(null); setUnavailable(false); break }
        if (boot && attempt < BOOT_RETRY_DELAYS.length) {
          setWaking(true)
          await new Promise((resolve) => setTimeout(resolve, BOOT_RETRY_DELAYS[attempt]))
          if (mine !== epoch.current) return
          continue
        }
        // Unknown, not "logged out": keep whoever is signed in rather than bouncing them to /login.
        setUnavailable(true)
        break
      }
    }
    if (boot) { setLoading(false); setWaking(false) }
  }, [])

  useEffect(() => { refresh({ boot: true }) }, [refresh])

  // Any API call that comes back 401 means the session is gone (expired, revoked, signed out elsewhere).
  useEffect(() => {
    const onUnauthorized = () => {
      if (!userRef.current) return
      epoch.current += 1
      setUser(null)
      notify('Your session expired. Sign in again to continue.', 'warning', 'Signed out')
    }
    window.addEventListener('evzax:unauthorized', onUnauthorized)
    return () => window.removeEventListener('evzax:unauthorized', onUnauthorized)
  }, [])

  // Pick up sign-outs and sign-ins made in another tab when this one regains focus.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'hidden') return
      if (Date.now() - lastCheck.current < FOCUS_RECHECK_MS) return
      refresh()
    }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', recheck)
    return () => { window.removeEventListener('focus', recheck); document.removeEventListener('visibilitychange', recheck) }
  }, [refresh])

  const adopt = useCallback((next) => {
    epoch.current += 1
    lastCheck.current = Date.now()
    setUnavailable(false)
    setUser(next)
    return next
  }, [])
  const signUp = useCallback(async (name, email, password) => adopt((await api.signUp(name, email, password)).user), [adopt])
  const signIn = useCallback(async (email, password) => adopt((await api.signIn(email, password)).user), [adopt])
  const signOut = useCallback(async () => {
    // Clear local state first and always: a failed network call must not leave the UI signed in.
    epoch.current += 1
    setUser(null)
    try { await api.signOut() } catch { /* cookie expires on its own; server logout is idempotent */ }
  }, [])

  return <AuthContext.Provider value={{ user, loading, waking, unavailable, signUp, signIn, signOut, refresh }}>{children}</AuthContext.Provider>
}
export function useAuth() { return useContext(AuthContext) }
