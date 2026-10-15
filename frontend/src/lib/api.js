const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/$/, '')
export const apiAbsoluteUrl = (path) => path?.startsWith('/api/') ? `${API_BASE.replace(/\/api$/, '')}${path}` : path

function fallbackMessage(status) {
  if (status === 400 || status === 422) return 'Please check the information and try again.'
  if (status === 401 || status === 403) return 'Please sign in again to continue.'
  if (status === 404) return 'We could not find that item. Refresh and try again.'
  if (status === 409) return 'This change conflicts with the current state. Refresh and try again.'
  if (status === 413) return 'This file is too large. Choose a smaller file.'
  if (status === 429) return 'You are doing that too often. Wait a moment and try again.'
  if (status >= 500) return 'Something went wrong on our side. Please try again shortly.'
  return 'The request could not be completed. Please try again.'
}

// 4xx details are written for users by the backend ("Email or password is incorrect.").
// Show them when they are short plain strings; 5xx and anything unexpected stay generic.
function safeMessage(status, detail, path) {
  if (status === 401 && !path.startsWith('/auth/')) return 'Your session expired. Please sign in again.'
  if (status >= 400 && status < 500 && typeof detail === 'string' && detail.length > 0 && detail.length <= 220) return detail
  return fallbackMessage(status)
}

function emitToast(detail) { window.dispatchEvent(new CustomEvent('evzax:toast', { detail })) }

// silent: the caller shows its own state (auth form, health dot), so no toast.
async function request(path, options = {}) {
  const { silent = false, ...init } = options
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init })
  } catch {
    const error = new Error('Could not reach EVZAX. Check your connection and try again.')
    error.network = true
    if (!silent) emitToast({ type: 'error', title: 'Connection failed', message: error.message })
    throw error
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = safeMessage(response.status, body && body.detail, path)
    const error = new Error(message)
    error.status = response.status
    // A 401 outside /auth means the session ended: tell AuthContext so the UI leaves stale signed-in state.
    if (response.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('evzax:unauthorized'))
    } else if (!silent) {
      emitToast({ type: 'error', title: response.status >= 500 ? 'Service temporarily unavailable' : 'Could not complete that', message })
    }
    throw error
  }
  return body
}

export const api = {
  health: () => request('/health', { silent: true }),
  authMe: () => request('/auth/me', { silent: true }),
  signUp: (name, email, password) => request('/auth/signup', { silent: true, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) }),
  signIn: (email, password) => request('/auth/login', { silent: true, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }),
  signOut: () => request('/auth/logout', { method: 'POST', silent: true }),
  repositories: () => request('/repositories'),
  repository: (id) => request(`/repositories/${encodeURIComponent(id)}`),
  versions: (id) => request(`/repositories/${encodeURIComponent(id)}/versions`),
  compareVersions: (id, fromVersionId, toVersionId) => request(`/repositories/${encodeURIComponent(id)}/versions/compare?from_version_id=${encodeURIComponent(fromVersionId)}&to_version_id=${encodeURIComponent(toVersionId)}`),
  documents: (id) => request(`/repositories/${encodeURIComponent(id)}/documents`),
  latestEvaluation: (id) => request(`/repositories/${encodeURIComponent(id)}/evaluation`),
  runEvaluation: (id, payload) => request(`/repositories/${encodeURIComponent(id)}/evaluation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  uploadDocument: (id, file) => { const form = new FormData(); form.append('file', file); return request(`/repositories/${encodeURIComponent(id)}/documents`, { method: 'POST', body: form }) },
  deleteDocument: (id, documentId) => request(`/repositories/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' }),
  documentDownloadUrl: (id, documentId) => `${API_BASE}/repositories/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}/download`,
  messages: (id, versionId) => request(`/repositories/${encodeURIComponent(id)}/messages${versionId ? `?version_id=${encodeURIComponent(versionId)}` : ''}`),
  connectGithub: (repoUrl, ref = '', existingRepoId = '') => request('/repositories/github', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo_url: repoUrl, ref: ref || null, existing_repo_id: existingRepoId || null }) }),
  connectZip: (file, name = '', existingRepoId = '') => { const form = new FormData(); form.append('file', file); if (name) form.append('name', name); if (existingRepoId) form.append('existing_repo_id', existingRepoId); return request('/repositories/zip', { method: 'POST', body: form }) },
  chat: (repoId, question, versionId) => request(`/repositories/${encodeURIComponent(repoId)}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, version_id: versionId || null }) }),
  sync: (repoId) => request(`/repositories/${encodeURIComponent(repoId)}/sync`, { method: 'POST' }),
  activateVersion: (repoId, versionId) => request(`/repositories/${encodeURIComponent(repoId)}/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version_id: versionId }) }),
}
