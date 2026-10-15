import { useRef, useState } from 'react'
import { Check, CloudUpload, FileArchive, Github, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { notify } from '../lib/ToastContext'
import LoadingState from './LoadingState'

export default function ConnectPanel(props) {
  const existingRepoId = props.existingRepoId || ''
  const [mode, setMode] = useState(props.defaultMode || 'github')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const navigate = useNavigate()

  function chooseFile(picked) {
    const candidate = picked && picked[0]
    if (!candidate) return
    if (!candidate.name.toLowerCase().endsWith('.zip')) {
      setError('Choose a ZIP archive.')
      return
    }
    if (candidate.size > 40 * 1024 * 1024) {
      setError('ZIP files must be under 40 MB.')
      return
    }
    setError('')
    setFile(candidate)
  }

  function useGithub() { setMode('github'); setError('') }
  function useZip() { setMode('zip'); setError('') }
  function handleUrl(event) { setRepoUrl(event.target.value) }
  function handleBranch(event) { setBranch(event.target.value) }
  function openPicker() { if (fileRef.current) fileRef.current.click() }
  function handlePicked(event) { chooseFile(event.target.files) }
  function handleDragOver(event) { event.preventDefault(); setDragging(true) }
  function handleDragLeave() { setDragging(false) }
  function handleDrop(event) { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files) }

  async function submit(event) {
    if (event) event.preventDefault()
    setError('')
    if (mode === 'github' && !repoUrl.trim()) {
      setError('Paste a GitHub repository URL.')
      return
    }
    if (mode === 'zip' && !file) {
      setError('Choose a project ZIP first.')
      return
    }
    setBusy(true)
    try {
      const result = mode === 'github'
        ? await api.connectGithub(repoUrl.trim(), branch.trim(), existingRepoId)
        : await api.connectZip(file, file.name.replace(/\.zip$/i, ''), existingRepoId)
      const repositoryId = result.repository && result.repository.id
      if (!repositoryId) throw new Error('The index finished without returning a repository ID.')
      notify(existingRepoId ? 'The new revision is indexed and ready.' : 'Your codebase is indexed and ready to explore.', 'success', existingRepoId ? 'Revision ready' : 'Codebase connected')
      if (props.onComplete) props.onComplete(result)
      else navigate('/repositories/' + repositoryId)
    } catch (err) {
      setError(err.message || 'Could not connect this codebase.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {busy && <LoadingState title={existingRepoId ? 'Updating codebase' : 'Indexing codebase'} />}
      <div className="connect-panel">
        <div className="connect-panel-head">
          <div>
            <span className="eyebrow">{existingRepoId ? 'NEW REVISION' : 'NEW CODEBASE'}</span>
            <h2>{existingRepoId ? 'Update codebase' : 'Choose a source'}</h2>
          </div>
          <span className="chip chip-ok"><ShieldCheck size={13} /> Keys stay server side</span>
        </div>

        <div className="source-tabs" role="tablist" aria-label="Source type">
          <button type="button" className={'source-tab' + (mode === 'github' ? ' active' : '')} onClick={useGithub} role="tab" aria-selected={mode === 'github'}>
            <Github size={18} /><span>GitHub</span>{mode === 'github' && <Check size={14} />}
          </button>
          <button type="button" className={'source-tab' + (mode === 'zip' ? ' active' : '')} onClick={useZip} role="tab" aria-selected={mode === 'zip'}>
            <FileArchive size={18} /><span>ZIP upload</span>{mode === 'zip' && <Check size={14} />}
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === 'github' ? (
            <div className="form-block">
              <label htmlFor="github-url">Repository URL</label>
              <div className="input-shell">
                <span className="input-prefix">$</span>
                <input id="github-url" value={repoUrl} onChange={handleUrl} placeholder="https://github.com/owner/repository" autoComplete="url" />
              </div>
              <details className="advanced-ref">
                <summary>Branch or revision</summary>
                <div className="input-shell">
                  <span className="input-prefix">@</span>
                  <input value={branch} onChange={handleBranch} placeholder="Default branch" aria-label="Branch or revision" />
                </div>
              </details>
            </div>
          ) : (
            <div className="form-block">
              <label>Project archive</label>
              <button type="button" className={'dropzone' + (dragging ? ' dragging' : '') + (file ? ' has-file' : '')} onClick={openPicker} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                <span className="dropzone-icon">{file ? <Check size={22} /> : <CloudUpload size={22} />}</span>
                <strong>{file ? file.name : 'Drop your ZIP here'}</strong>
                <span>{file ? (file.size / (1024 * 1024)).toFixed(1) + ' MB ready' : 'or browse · up to 40 MB'}</span>
              </button>
              <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={handlePicked} />
            </div>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn btn-primary btn-lg btn-wide" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : <>{existingRepoId ? 'Index new revision' : 'Analyze codebase'}</>}
          </button>
        </form>
      </div>
    </>
  )
}
