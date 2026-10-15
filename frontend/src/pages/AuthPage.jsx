import { useState } from 'react'
import { Eye, EyeOff, LoaderCircle, Lock, Mail, User } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Brand from '../components/Brand'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'

export default function AuthPage(props) {
  const signup = props.mode === 'signup'
  const auth = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const target = (location.state && location.state.from) || '/workspace'

  if (auth.loading) return <main className="route-loading"><span className="loading-orbit" /><p>Restoring your workspace</p></main>
  if (auth.user) return <Navigate to={target} replace />

  function handleName(event) { setName(event.target.value) }
  function handleEmail(event) { setEmail(event.target.value) }
  function handlePassword(event) { setPassword(event.target.value) }
  function toggleShow() { setShow(function (value) { return !value }) }

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (signup && name.trim().length < 2) { setError('Enter your name.'); return }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email.'); return }
    if (password.length < (signup ? 8 : 1)) { setError(signup ? 'Use at least 8 characters.' : 'Enter your password.'); return }
    setBusy(true)
    try {
      if (signup) await auth.signUp(name, email, password)
      else await auth.signIn(email, password)
      toast(signup ? 'Your workspace is ready.' : 'Welcome back to EVZAX.', 'success', signup ? 'Account created' : 'Signed in')
      navigate(target, { replace: true })
    } catch (err) {
      setError(err.message || 'Could not sign in. Please try again.')
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <Link to="/" className="auth-back">Home</Link>

      <section className="auth-card">
        <div className="auth-inner">
          <Brand />
          <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="auth-sub">{signup ? 'Start asking your codebase.' : 'Sign in to your workspace.'}</p>

          <form onSubmit={submit} noValidate>
            {signup && (
              <label className="auth-field">
                <span>Name</span>
                <div className="auth-input"><User size={17} /><input value={name} onChange={handleName} placeholder="Your name" autoComplete="name" /></div>
              </label>
            )}
            <label className="auth-field">
              <span>Email</span>
              <div className="auth-input"><Mail size={17} /><input type="email" value={email} onChange={handleEmail} placeholder="you@company.com" autoComplete="email" /></div>
            </label>
            <label className="auth-field">
              <span>Password</span>
              <div className="auth-input">
                <Lock size={17} />
                <input type={show ? 'text' : 'password'} value={password} onChange={handlePassword} placeholder={signup ? 'At least 8 characters' : 'Your password'} autoComplete={signup ? 'new-password' : 'current-password'} />
                <button type="button" className="auth-eye" onClick={toggleShow} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="btn btn-primary btn-lg btn-wide" type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={18} /> : <>{signup ? 'Create account' : 'Sign in'}</>}
            </button>
          </form>

          <p className="auth-switch">
            {signup ? 'Already have an account?' : 'New to Evzax?'}{' '}
            <Link to={signup ? '/login' : '/signup'} state={location.state}>{signup ? 'Sign in' : 'Create account'}</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
