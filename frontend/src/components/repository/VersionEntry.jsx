import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Clock3, FileCode2, GitBranch, GitCommitHorizontal, RotateCcw } from 'lucide-react'
import { formatDate, shortSha } from '../../lib/format'

const changeStyles = {
  added: { label: 'Added', className: 'change-added', mark: '+' },
  modified: { label: 'Changed', className: 'change-modified', mark: '~' },
  removed: { label: 'Removed', className: 'change-removed', mark: '−' },
}

export default function VersionEntry(props) {
  const version = props.version
  const [expanded, setExpanded] = useState(false)
  const diff = version.diff || { added: 0, modified: 0, removed: 0, total: 0, files: [] }
  const files = diff.files || []

  function toggle() { setExpanded(function (current) { return !current }) }
  function activate() { props.onActivate(version.id) }

  function renderFile(file) {
    const state = changeStyles[file.status] || changeStyles.modified
    return (
      <div className="changed-file" key={file.status + '-' + file.path}>
        <span className={state.className}>{state.mark}</span>
        <FileCode2 size={14} />
        <code>{file.path}</code>
        <span className={'change-label ' + state.className}>{state.label}</span>
      </div>
    )
  }

  return (
    <article className={'version' + (version.is_current ? ' version-current' : '')}>
      <div className="timeline-gutter">
        <span className={'timeline-node' + (version.is_current ? ' active' : '')}>{version.is_current ? <Check size={13} /> : <GitCommitHorizontal size={14} />}</span>
        {props.index < props.total - 1 && <span className="timeline-stem" />}
      </div>
      <div className="version-main">
        <div className="version-top">
          <div>
            <div className="version-name">
              <h3>Revision {version.version_number}</h3>
              {version.is_current && <span className="chip chip-ok"><i />Active</span>}
              {version.is_latest && !version.is_current && <span className="chip chip-info">Latest</span>}
              {version.status !== 'ready' && <span className="chip chip-warn">{version.status}</span>}
            </div>
            <p className="version-rev"><GitBranch size={14} />{shortSha(version.commit_sha || version.revision)} <span>·</span> {version.source_type === 'github' ? 'GitHub' : 'ZIP snapshot'}</p>
          </div>
          {!version.is_current && version.status === 'ready' && <button className="btn btn-ghost btn-sm" onClick={activate}><RotateCcw size={14} /> Make active</button>}
        </div>
        <div className="version-meta">
          <span><Clock3 size={14} />{formatDate(version.created_at)}</span>
          <span>{version.file_count || 0} files</span>
          <span>{version.chunk_count || 0} passages</span>
          <span>{version.symbol_count || 0} symbols</span>
        </div>
        {diff.total > 0 && (
          <div className="version-diff">
            <div className="diff-counts">
              {diff.added > 0 && <span className="change-added">+{diff.added} added</span>}
              {diff.modified > 0 && <span className="change-modified">~{diff.modified} changed</span>}
              {diff.removed > 0 && <span className="change-removed">−{diff.removed} removed</span>}
            </div>
            <button className="text-btn" onClick={toggle}>{expanded ? 'Hide changes' : 'View changes'}{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          </div>
        )}
        {expanded && (
          <div className="changed-files">
            {files.map(renderFile)}
            {diff.truncated && <div className="changed-note">Showing the first {files.length} changes.</div>}
          </div>
        )}
      </div>
    </article>
  )
}
