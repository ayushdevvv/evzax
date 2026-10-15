import { useCallback, useEffect, useState } from 'react'
import { GitCompareArrows, LoaderCircle, RefreshCw, UploadCloud } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import ConnectPanel from '../components/ConnectPanel'
import RepoNav from '../components/repository/RepoNav'
import VersionEntry from '../components/repository/VersionEntry'
import { notify } from '../lib/ToastContext'

export default function VersionsPage() {
  const { repositoryId } = useParams()
  const [repository, setRepository] = useState(null)
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [compareFrom, setCompareFrom] = useState('')
  const [compareTo, setCompareTo] = useState('')
  const [compareResult, setCompareResult] = useState(null)
  const [comparing, setComparing] = useState(false)

  const load = useCallback(async function () {
    setLoading(true)
    try {
      const [detail, result] = await Promise.all([api.repository(repositoryId), api.versions(repositoryId)])
      setRepository(detail.repository)
      const items = result.versions || []
      setVersions(items)
      if (items.length && !compareTo) setCompareTo(items[0].id)
      if (items.length > 1 && !compareFrom) setCompareFrom(items[1].id)
      else if (items.length === 1 && !compareFrom) setCompareFrom(items[0].id)
    } catch (err) {
      setError(err.message || 'Could not load revisions.')
    } finally {
      setLoading(false)
    }
  }, [repositoryId, compareTo, compareFrom])

  useEffect(function () { load() }, [load])

  async function sync() {
    setSyncing(true); setError(''); setNotice('')
    try {
      const result = await api.sync(repositoryId)
      await load()
      setNotice(result.unchanged ? 'Already current.' : 'New revision indexed. The previous one is kept.')
      notify(result.unchanged ? 'This repository is already up to date.' : 'New revision indexed. Previous versions remain available.', result.unchanged ? 'info' : 'success', result.unchanged ? 'Already current' : 'Revision saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  async function activate(versionId) {
    setError(''); setNotice('')
    try {
      const result = await api.activateVersion(repositoryId, versionId)
      setRepository(result)
      await load()
      setNotice('Active revision changed.')
      notify('Retrieval now uses the selected revision.', 'success', 'Active version changed')
    } catch (err) {
      setError(err.message)
    }
  }

  async function updated() {
    setUploading(false)
    await load()
    setNotice('New ZIP revision indexed.')
  }

  async function runCompare() {
    if (!compareFrom || !compareTo || compareFrom === compareTo) { setError('Choose two different revisions.'); return }
    setComparing(true); setError(''); setCompareResult(null)
    try {
      setCompareResult(await api.compareVersions(repositoryId, compareFrom, compareTo))
      notify('Revision comparison is ready.', 'success', 'Comparison complete')
    } catch (err) {
      setError(err.message || 'Could not compare revisions.')
    } finally {
      setComparing(false)
    }
  }

  function toggleUpload() { setUploading(function (value) { return !value }) }
  function closeUpload() { setUploading(false) }
  function dismissError() { setError('') }
  function dismissNotice() { setNotice('') }
  function changeFrom(event) { setCompareFrom(event.target.value); setCompareResult(null) }
  function changeTo(event) { setCompareTo(event.target.value); setCompareResult(null) }

  function renderOption(version) {
    return <option key={version.id} value={version.id}>{version.revision} · {formatDate(version.created_at)}</option>
  }
  function renderVersion(version, index) {
    return <VersionEntry key={version.id} version={version} index={index} total={versions.length} onActivate={activate} />
  }
  function renderChange(change) {
    const mark = change.status === 'added' ? '+' : change.status === 'removed' ? '−' : '~'
    return (
      <details className="diff-file" key={change.status + ':' + change.path}>
        <summary><span className={'diff-status ' + change.status}>{mark}</span><code>{change.path}</code><span className="diff-state">{change.status}</span></summary>
        {change.patch && <pre className="diff-patch">{change.patch}</pre>}
      </details>
    )
  }

  if (loading && !repository) return <div className="page-loading"><LoaderCircle className="spin" size={22} /> Loading versions</div>

  return (
    <div className="page-wrap">
      <RepoNav repositoryId={repositoryId} repository={repository} active="versions">
        {repository && repository.source_type === 'github' && <button className="btn btn-primary btn-sm" onClick={sync} disabled={syncing}>{syncing ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} Sync latest</button>}
        <button className="btn btn-ghost btn-sm" onClick={toggleUpload}><UploadCloud size={14} /> Upload ZIP</button>
      </RepoNav>

      {error && <div className="notice notice-error"><span>{error}</span><button onClick={dismissError}>Dismiss</button></div>}
      {notice && <div className="notice notice-info"><span>{notice}</span><button onClick={dismissNotice}>Dismiss</button></div>}
      {uploading && (
        <div className="block">
          <div className="block-head"><h2>Index a new snapshot</h2><button className="text-btn" onClick={closeUpload}>Close</button></div>
          <ConnectPanel existingRepoId={repositoryId} defaultMode="zip" onComplete={updated} />
        </div>
      )}

      <section className="block">
        <div className="block-head"><h2>Compare</h2></div>
        <div className="compare">
          <div className="compare-controls">
            <label>From<select value={compareFrom} onChange={changeFrom}>{versions.map(renderOption)}</select></label>
            <span className="compare-arrow">vs</span>
            <label>To<select value={compareTo} onChange={changeTo}>{versions.map(renderOption)}</select></label>
            <button className="btn btn-primary" onClick={runCompare} disabled={comparing || versions.length < 2 || !compareFrom || !compareTo || compareFrom === compareTo}>
              {comparing ? <LoaderCircle className="spin" size={15} /> : <GitCompareArrows size={15} />} Compare
            </button>
          </div>
          {compareResult && (
            <div className="compare-results">
              <div className="diff-counts">
                <span className="change-added">+ {compareResult.summary.added} added</span>
                <span className="change-modified">~ {compareResult.summary.modified} changed</span>
                <span className="change-removed">− {compareResult.summary.removed} removed</span>
              </div>
              {compareResult.changes.length ? compareResult.changes.map(renderChange) : <div className="compare-empty">No file changes.</div>}
              {compareResult.truncated && <p className="changed-note">Showing the first 60 changed files.</p>}
            </div>
          )}
        </div>
      </section>

      <section className="block">
        <div className="block-head"><h2>Timeline <span className="count">{versions.length}</span></h2></div>
        {versions.length === 0 && !loading ? <div className="empty"><h3>No revisions yet</h3></div> : <div className="timeline">{versions.map(renderVersion)}</div>}
      </section>
    </div>
  )
}
