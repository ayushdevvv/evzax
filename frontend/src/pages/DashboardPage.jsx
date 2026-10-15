import { useEffect, useState } from 'react'
import { Boxes, Code2, FileText, FlaskConical, GitBranch, GitCommitHorizontal, MessageSquareText, Plus, RefreshCw } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate, formatNumber, shortSha } from '../lib/format'

function RepoTile(props) {
  const repo = props.repo
  const navigate = useNavigate()
  function open() { navigate('/repositories/' + repo.id) }
  const Icon = repo.source_type === 'github' ? GitBranch : Code2
  return (
    <button className="repo-tile" onClick={open}>
      <div className="repo-tile-top">
        <span className="repo-icon"><Icon size={18} /></span>
        <span className={'chip ' + (repo.status === 'ready' || !repo.status ? 'chip-ok' : 'chip-warn')}><i />{repo.status || 'ready'}</span>
      </div>
      <h3>{repo.name}</h3>
      <p>{repo.source_url ? repo.source_url.replace('https://github.com/', '') : 'ZIP upload'}</p>
      <div className="repo-tile-stats">
        <span><Code2 size={14} />{formatNumber(repo.file_count)} files</span>
        <span><Boxes size={14} />{formatNumber(repo.chunk_count)} passages</span>
      </div>
      <div className="repo-tile-foot">
        <span><GitCommitHorizontal size={14} />{shortSha(repo.current_revision)}</span>
        <span>{formatDate(repo.updated_at)}</span>
      </div>
    </button>
  )
}

export default function DashboardPage() {
  const [repositories, setRepositories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    api.repositories()
      .then(function (data) { setRepositories(data.repositories || []) })
      .catch(function (err) { setError(err.message) })
      .finally(function () { setLoading(false) })
  }
  useEffect(function () { load() }, [])

  function dismiss() { setError('') }
  function renderRepo(repo) { return <RepoTile key={repo.id} repo={repo} /> }

  const first = repositories[0]
  const base = first ? '/repositories/' + first.id : '/connect'

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div><span className="eyebrow">WORKSPACE</span><h1>Overview</h1></div>
        <Link className="btn btn-primary btn-lg" to="/connect"><Plus size={18} /> Connect codebase</Link>
      </div>

      <section className="block">
        <div className="block-head">
          <h2>Codebases</h2>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh</button>
        </div>
        {error && <div className="notice notice-error"><span>{error}</span><button onClick={dismiss}>Dismiss</button></div>}
        {loading && repositories.length === 0 ? (
          <div className="skeleton-grid"><div /><div /><div /></div>
        ) : repositories.length === 0 ? (
          <div className="empty">
            <code>$ evzax connect</code>
            <h3>No codebases yet</h3>
            <Link to="/connect" className="btn btn-primary">Connect first codebase</Link>
          </div>
        ) : (
          <div className="repo-grid">{repositories.map(renderRepo)}</div>
        )}
      </section>

      <section className="block">
        <div className="block-head"><h2>Toolkit</h2></div>
        <div className="tool-grid">
          <Link to={base} className="tool"><MessageSquareText size={20} /><strong>Chat</strong><span>Ask your code</span></Link>
          <Link to={first ? base + '/documents' : '/connect'} className="tool"><FileText size={20} /><strong>Documents</strong><span>Specs and logs</span></Link>
          <Link to={first ? base + '/versions' : '/connect'} className="tool"><GitCommitHorizontal size={20} /><strong>Versions</strong><span>Compare revisions</span></Link>
          <Link to={first ? base + '/evaluation' : '/connect'} className="tool"><FlaskConical size={20} /><strong>Retrieval lab</strong><span>Measure search</span></Link>
        </div>
      </section>
    </div>
  )
}
