import { useState } from 'react'
import { Check, Copy, FileCode2, FileText, X } from 'lucide-react'
import { apiAbsoluteUrl } from '../../lib/api'

function TabButton(props) {
  const citation = props.citation
  const isDocument = citation.source_kind === 'document'
  const name = (citation.file_path || '').split('/').pop()
  const Icon = isDocument ? FileText : FileCode2
  function handleClick() { props.onPick(props.index) }
  return (
    <button className={'viewer-tab' + (props.active ? ' active' : '')} onClick={handleClick} title={citation.file_path}>
      <Icon size={14} /><span>{name}</span>
    </button>
  )
}

export default function CodeViewer(props) {
  const citations = props.citations || []
  const citation = citations[props.index]
  const [copied, setCopied] = useState(false)
  if (!citation) return null
  const isDocument = citation.source_kind === 'document'
  const spot = isDocument && citation.page_number
    ? citation.file_path + ', page ' + citation.page_number
    : citation.file_path + ':' + citation.line_start + '-' + citation.line_end

  async function copy() {
    try {
      await navigator.clipboard.writeText(spot)
      setCopied(true)
      window.setTimeout(function () { setCopied(false) }, 1400)
    } catch (err) {
      setCopied(false)
    }
  }
  function renderTab(item, index) {
    const key = item.file_path + '-' + item.line_start + '-' + index
    return <TabButton key={key} citation={item} index={index} active={index === props.index} onPick={props.onPick} />
  }
  function renderLine(line, lineIndex) {
    return <div className="viewer-line" key={lineIndex}><i>{(citation.line_start || 1) + lineIndex}</i><span>{line || ' '}</span></div>
  }

  return (
    <aside className="viewer">
      <div className="viewer-tabs">
        <div className="viewer-tab-list">{citations.map(renderTab)}</div>
        <button className="icon-btn" onClick={props.onClose} aria-label="Close viewer"><X size={18} /></button>
      </div>
      <div className="viewer-bar">
        <div className="viewer-path">
          <strong>{citation.file_path}</strong>
          <span>{isDocument && citation.page_number ? 'Page ' + citation.page_number : 'Lines ' + citation.line_start + ' to ' + citation.line_end}{citation.symbol ? ' · ' + citation.symbol : ''}{citation.language ? ' · ' + citation.language : ''}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</button>
        {citation.url && <a className="btn btn-ghost btn-sm" href={apiAbsoluteUrl(citation.url)} target="_blank" rel="noreferrer">Open</a>}
      </div>
      <div className="viewer-body">
        {isDocument ? (
          <div className="viewer-doc"><span className="eyebrow">{citation.page_number ? 'PAGE ' + citation.page_number : 'EXCERPT'}</span><p>{citation.snippet}</p></div>
        ) : (
          <pre className="viewer-code"><code>{(citation.snippet || '').split('\n').map(renderLine)}</code></pre>
        )}
      </div>
    </aside>
  )
}
