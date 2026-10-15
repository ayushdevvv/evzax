const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/$/, '')
export const apiAbsoluteUrl = (path) => path?.startsWith('/api/') ? `${API_BASE.replace(/\/api$/, '')}${path}` : path

function safeMessage(status) {
  if (status === 400 || status === 422) return 'Please check the information and try again.'
  if (status === 401 || status === 403) return 'Please sign in again to continue.'
  if (status === 404) return 'We could not find that item. Refresh and try again.'
  if (status === 409) return 'This change conflicts with the current state. Refresh and try again.'
  if (status === 413) return 'This file is too large. Choose a smaller file.'
  if (status === 429) return 'You are doing that too often. Wait a moment and try again.'
  if (status >= 500) return 'Something went wrong on our side. Please try again shortly.'
  return 'The request could not be completed. Please try again.'
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options })
  } catch {
    const error = new Error('Could not reach EVZAX. Check your connection and try again.')
    window.dispatchEvent(new CustomEvent('evzax:toast', { detail: { type: 'error', title: 'Connection failed', message: error.message } }))
    throw error
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = safeMessage(response.status)
    window.dispatchEvent(new CustomEvent('evzax:toast', { detail: { type: 'error', title: response.status >= 500 ? 'Service temporarily unavailable' : 'Could not complete that', message } }))
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return body
}

export const api = {
  health: () => request('/health'),
  authMe: () => request('/auth/me'),
  signUp: (name, email, password) => request('/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) }),
  signIn: (email, password) => request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }),
  signOut: () => request('/auth/logout', { method: 'POST' }),
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
