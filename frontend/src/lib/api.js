const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/$/, '')
export const apiAbsoluteUrl = (path) => path?.startsWith('/api/') ? `${API_BASE.replace(/\/api$/, '')}${path}` : path

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.detail || body.message || `Request failed with status ${response.status}`)
  }
  return body
}

export const api = {
  health: () => request('/health'),
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
  connectGithub: (repoUrl, ref = '', existingRepoId = '') => request('/repositories/github', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_url: repoUrl, ref: ref || null, existing_repo_id: existingRepoId || null }),
  }),
  connectZip: (file, name = '', existingRepoId = '') => {
    const form = new FormData()
    form.append('file', file)
    if (name) form.append('name', name)
    if (existingRepoId) form.append('existing_repo_id', existingRepoId)
    return request('/repositories/zip', { method: 'POST', body: form })
  },
  chat: (repoId, question, versionId) => request(`/repositories/${encodeURIComponent(repoId)}/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, version_id: versionId || null }),
  }),
  sync: (repoId) => request(`/repositories/${encodeURIComponent(repoId)}/sync`, { method: 'POST' }),
  activateVersion: (repoId, versionId) => request(`/repositories/${encodeURIComponent(repoId)}/activate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version_id: versionId }),
  }),
}
