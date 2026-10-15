import { ChevronDown, FileText, GitBranch, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatNumber, shortSha } from '../../lib/format'

function PromptRow(props) {
  const item = props.item
  const Icon = item.icon
  function handleClick() { props.onPick(item.text) }
  return (
    <button className="prompt-row" onClick={handleClick}>
      <Icon size={15} />
      <span>{item.label}</span>
    </button>
  )
}

export default function ContextPane(props) {
  const version = props.version || {}
  const documents = props.documents || []
  const repositoryId = props.repositoryId

  function renderOption(item) {
    return <option key={item.id} value={item.id}>{item.revision}{item.is_current ? ' · Current' : ''}</option>
  }
  function renderDoc(doc) {
    return (
      <div className="ctx-doc" key={doc.id}>
        <FileText size={15} />
        <span>{doc.filename}</span>
        <em>{formatNumber(doc.chunk_count)}</em>
      </div>
    )
  }
  function renderPrompt(item) {
    return <PromptRow key={item.label} item={item} onPick={props.onPrompt} />
  }

  return (
    <aside className="context-pane">
      <section className="ctx-section">
        <span className="ctx-label">REVISION</span>
        <div className="select-shell">
          <GitBranch size={15} />
          <select value={props.selectedVersionId} onChange={props.onVersionChange} aria-label="Chat against a revision">
            {props.versions.filter(function (item) { return item.status === 'ready' }).map(renderOption)}
          </select>
          <ChevronDown size={14} />
        </div>
        <div className="ctx-stats">
          <div><strong>{formatNumber(version.file_count || 0)}</strong><span>Files</span></div>
          <div><strong>{formatNumber(version.chunk_count || 0)}</strong><span>Passages</span></div>
          <div><strong>{formatNumber(version.symbol_count || 0)}</strong><span>Symbols</span></div>
        </div>
        <span className="ctx-sub">{shortSha(version.commit_sha || version.revision)}</span>
      </section>

      <section className="ctx-section">
        <div className="ctx-row-head">
          <span className="ctx-label">DOCUMENTS <em>{documents.length}</em></span>
          <Link to={'/repositories/' + repositoryId + '/documents'} className="ctx-add" aria-label="Add document"><Plus size={15} /></Link>
        </div>
        {documents.length ? documents.slice(0, 6).map(renderDoc) : <span className="ctx-empty">None attached</span>}
      </section>

      <section className="ctx-section">
        <span className="ctx-label">PROMPTS</span>
        {props.prompts.map(renderPrompt)}
      </section>
    </aside>
  )
}
