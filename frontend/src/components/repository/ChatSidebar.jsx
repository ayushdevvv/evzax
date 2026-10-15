import { useState } from 'react'
import { Code2, FileText, FlaskConical, GitBranch, GitCommitHorizontal, Menu, MessageSquareText, Plus, RefreshCw, UploadCloud } from 'lucide-react'
import { Link } from 'react-router-dom'
import Brand from '../Brand'
import { formatNumber, shortSha } from '../../lib/format'

function ChatLink(props) {
  const repo = props.repo
  const Icon = repo.source_type === 'github' ? GitBranch : Code2
  return (
    <Link to={'/repositories/' + repo.id} className={'cs-row' + (props.current ? ' active' : '')} title={repo.name}>
      <Icon size={15} />
      <span>{repo.name}</span>
      <em>{formatNumber(repo.file_count || 0)}</em>
    </Link>
  )
}

function HistoryRow(props) {
  function handleClick() { props.onJump(props.item.id) }
  return (
    <button className="cs-row cs-history" onClick={handleClick} title={props.item.text}>
      <MessageSquareText size={14} />
      <span>{props.item.text}</span>
    </button>
  )
}

function VersionRow(props) {
  const version = props.version
  function handleClick() { props.onPick(version.id) }
  return (
    <button className={'cs-version' + (props.selected ? ' selected' : '')} onClick={handleClick}>
      <span className={'cs-node' + (version.is_current ? ' current' : '')}><GitCommitHorizontal size={12} /></span>
      <span className="cs-version-name">r{version.version_number}</span>
      <span className="cs-version-sha">{shortSha(version.commit_sha || version.revision)}</span>
      {version.is_current && <span className="chip chip-ok">Active</span>}
    </button>
  )
}

export default function ChatSidebar(props) {
  const repositoryId = props.repositoryId
  const repository = props.repository || {}
  const version = props.version || {}
  const [showAll, setShowAll] = useState(false)
  const repositories = props.repositories || []
  const versions = (props.versions || []).filter(function (item) { return item.status === 'ready' })
  const documents = props.documents || []
  const history = props.history || []
  const base = '/repositories/' + repositoryId

  function toggleAll() { setShowAll(function (value) { return !value }) }
  function renderChat(repo) { return <ChatLink key={repo.id} repo={repo} current={repo.id === repositoryId} /> }
  function renderHistory(item) { return <HistoryRow key={item.id} item={item} onJump={props.onJump} /> }
  function renderVersion(item) { return <VersionRow key={item.id} version={item} selected={item.id === props.selectedVersionId} onPick={props.onPickVersion} /> }
  function renderDoc(doc) {
    return (
      <div className="cs-doc" key={doc.id}>
        <FileText size={14} />
        <span>{doc.filename}</span>
        <em>{formatNumber(doc.chunk_count)}</em>
      </div>
    )
  }

  const shownHistory = showAll ? history : history.slice(0, 6)

  return (
    <aside className={'chat-sidebar' + (props.open ? ' open' : '')}>
      <div className="cs-top">
        <div className="cs-top-left">
          <button className="icon-btn" onClick={props.onClose} aria-label="Close sidebar"><Menu size={21} /></button>
          <Brand />
        </div>
        <Link to="/connect" className="icon-btn" aria-label="Connect codebase" title="Connect codebase"><Plus size={18} /></Link>
      </div>

      <div className="cs-scroll">
        <section className="cs-section">
          <span className="cs-label">VERSION CONTROL</span>
          <div className="cs-vc-head">
            <div><strong>{repository.name}</strong><span>{formatNumber(version.file_count || 0)} files · {formatNumber(version.chunk_count || 0)} passages · {formatNumber(version.symbol_count || 0)} symbols</span></div>
          </div>
          <div className="cs-versions">{versions.map(renderVersion)}</div>
          <div className="cs-actions">
            {repository.source_type === 'github' && (
              <button className="btn btn-ghost btn-sm" onClick={props.onSync} disabled={props.syncing}>
                <RefreshCw size={14} className={props.syncing ? 'spin' : ''} /> Sync
              </button>
            )}
            <Link className="btn btn-ghost btn-sm" to={base + '/versions'}><UploadCloud size={14} /> Update</Link>
            <Link className="btn btn-ghost btn-sm" to={base + '/versions'}><GitCommitHorizontal size={14} /> Compare</Link>
          </div>
        </section>

        <section className="cs-section">
          <span className="cs-label">TOOLS</span>
          <Link className="cs-row" to={base + '/documents'}><FileText size={15} /><span>Documents</span></Link>
          <Link className="cs-row" to={base + '/versions'}><GitCommitHorizontal size={15} /><span>Versions</span></Link>
          <Link className="cs-row" to={base + '/evaluation'}><FlaskConical size={15} /><span>Retrieval lab</span></Link>
        </section>
        <section className="cs-section">
          <div className="cs-row-head">
            <span className="cs-label">DOCUMENTS <em>{documents.length}</em></span>
            <Link to={base + '/documents'} className="cs-add" aria-label="Add document"><Plus size={14} /></Link>
          </div>
          {documents.length ? documents.slice(0, 5).map(renderDoc) : <span className="cs-empty">None attached</span>}
        </section>

        <section className="cs-section">
          <span className="cs-label">ALL CHATS <em>{repositories.length}</em></span>
          {repositories.map(renderChat)}
        </section>

        <section className="cs-section">
          <span className="cs-label">CHATS ABOUT THIS FILE <em>{history.length}</em></span>
          {history.length === 0 ? <span className="cs-empty">No questions yet</span> : shownHistory.map(renderHistory)}
          {history.length > 6 && <button className="text-btn cs-more" onClick={toggleAll}>{showAll ? 'Show less' : 'Show all ' + history.length}</button>}
        </section>

      </div>

      <div className="cs-bottom">
        <Link to="/workspace" className="btn btn-ghost btn-wide">Back to overview</Link>
      </div>
    </aside>
  )
}
