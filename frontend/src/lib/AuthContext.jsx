import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api'

const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try { const result = await api.authMe(); setUser(result.user || null) }
    catch { setUser(null) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { refresh() }, [refresh])
  const signUp = useCallback(async (name, email, password) => { const result = await api.signUp(name, email, password); setUser(result.user); return result.user }, [])
  const signIn = useCallback(async (email, password) => { const result = await api.signIn(email, password); setUser(result.user); return result.user }, [])
  const signOut = useCallback(async () => { try { await api.signOut() } finally { setUser(null) } }, [])
  return <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut, refresh }}>{children}</AuthContext.Provider>
}
export function useAuth() { return useContext(AuthContext) }
