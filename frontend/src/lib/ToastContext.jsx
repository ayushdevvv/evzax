import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react'

const ToastContext = createContext(null)
const icons = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info }

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const timers = useRef(new Map())
  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])
  const recent = useRef(new Map())
  const toast = useCallback((message, type = 'success', title) => {
    // Several requests failing together (or a retry loop) must not stack identical toasts.
    const key = `${type}|${title || ''}|${message}`
    const now = Date.now()
    if (now - (recent.current.get(key) || 0) < 3000) return null
    recent.current.set(key, now)
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const safeType = icons[type] ? type : 'info'
    setItems((current) => [...current.slice(-3), { id, message: String(message || 'Please try again.'), type: safeType, title: title || ({ success: 'Done', error: 'Could not complete', warning: 'Check this', info: 'Notice' }[safeType]) }])
    timers.current.set(id, setTimeout(() => dismiss(id), safeType === 'error' ? 6500 : 4200))
    return id
  }, [dismiss])
  useEffect(() => {
    const handle = (event) => toast(event.detail?.message || 'Something went wrong. Please try again.', event.detail?.type || 'error', event.detail?.title)
    window.addEventListener('evzax:toast', handle)
    return () => { window.removeEventListener('evzax:toast', handle); timers.current.forEach(clearTimeout); timers.current.clear() }
  }, [toast])
  return <ToastContext.Provider value={toast}>{children}<div className="toast-viewport" aria-live="polite" aria-atomic="false">{items.map((item) => {
    const Icon = icons[item.type]
    return <div className={`toast-card toast-${item.type}`} key={item.id} role={item.type === 'error' ? 'alert' : 'status'}>
      <span className="toast-icon"><Icon size={19} strokeWidth={2.2} /></span><span className="toast-copy"><strong>{item.title}</strong><span>{item.message}</span></span><button className="toast-close" onClick={() => dismiss(item.id)} aria-label="Dismiss notification"><X size={15} /></button><span className="toast-progress" />
    </div>
  })}</div></ToastContext.Provider>
}
export function useToast() { const value = useContext(ToastContext); if (!value) throw new Error('useToast must be used inside ToastProvider'); return value }
export function notify(message, type = 'error', title) { window.dispatchEvent(new CustomEvent('evzax:toast', { detail: { message, type, title } })) }
