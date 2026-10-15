import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)
const USERS_KEY = 'evzax.users'
const SESSION_KEY = 'evzax.session'

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (err) {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    // storage can be blocked, the session then lives in memory only
  }
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(function (byte) { return byte.toString(16).padStart(2, '0') }).join('')
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

async function hashPassword(password, saltHex) {
  if (!window.crypto || !window.crypto.subtle) throw new Error('Secure sign in needs https or localhost.')
  const encoder = new TextEncoder()
  const material = await window.crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex), iterations: 120000, hash: 'SHA-256' }, material, 256)
  return toHex(bits)
}

export function AuthProvider(props) {
  const [user, setUser] = useState(function () { return readJson(SESSION_KEY, null) })

  async function signUp(name, email, password) {
    const key = email.trim().toLowerCase()
    const users = readJson(USERS_KEY, {})
    if (users[key]) throw new Error('An account with this email already exists.')
    const salt = toHex(window.crypto.getRandomValues(new Uint8Array(16)))
    const hash = await hashPassword(password, salt)
    users[key] = { name: name.trim(), salt: salt, hash: hash }
    writeJson(USERS_KEY, users)
    const session = { name: name.trim(), email: key }
    writeJson(SESSION_KEY, session)
    setUser(session)
  }

  async function signIn(email, password) {
    const key = email.trim().toLowerCase()
    const users = readJson(USERS_KEY, {})
    const record = users[key]
    if (!record) throw new Error('No account found for this email.')
    const hash = await hashPassword(password, record.salt)
    if (hash !== record.hash) throw new Error('Incorrect password.')
    const session = { name: record.name, email: key }
    writeJson(SESSION_KEY, session)
    setUser(session)
  }

  function signOut() {
    try { window.localStorage.removeItem(SESSION_KEY) } catch (err) { /* ignore */ }
    setUser(null)
  }

  return <AuthContext.Provider value={{ user: user, signUp: signUp, signIn: signIn, signOut: signOut }}>{props.children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
