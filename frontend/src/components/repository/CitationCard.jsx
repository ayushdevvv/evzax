import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Copy, FileCode2, FileText } from 'lucide-react'
import { apiAbsoluteUrl } from '../../lib/api'

export default function CitationCard(props) {
  const citation = props.citation
  const index = props.index || 0
  const [copied, setCopied] = useState(false)
  const isDocument = citation.source_kind === 'document'
  const spot = isDocument && citation.page_number
    ? citation.file_path + ', page ' + citation.page_number
    : citation.file_path + ':' + citation.line_start + '-' + citation.line_end
  const label = isDocument && citation.page_number ? 'Page ' + citation.page_number : 'Lines ' + citation.line_start + ' to ' + citation.line_end

  async function copy() {
    try {
      await navigator.clipboard.writeText(spot)
      setCopied(true)
      window.setTimeout(function () { setCopied(false) }, 1500)
    } catch (err) {
      setCopied(false)
    }
  }
  function toggle() { props.onToggle(index) }

  function renderLine(line, lineIndex) {
    return <span className="source-line" key={lineIndex}><i>{(citation.line_start || 1) + lineIndex}</i><span>{line || ' '}</span></span>
  }

  return (
    <article className={'citation' + (props.expanded ? ' expanded' : '')}>
      <div className="citation-head">
        <span className="citation-index">{String(index + 1).padStart(2, '0')}</span>
        <span className="citation-icon">{isDocument ? <FileText size={15} /> : <FileCode2 size={15} />}</span>
        <button className="citation-path" onClick={toggle}>
          <strong>{citation.file_path}</strong>
          <span>{label}</span>
        </button>
        {citation.url && <a className="icon-btn" href={apiAbsoluteUrl(citation.url)} target="_blank" rel="noreferrer" aria-label="Open source"><FileText size={15} /></a>}
        <button className="icon-btn" onClick={toggle} aria-label={props.expanded ? 'Collapse' : 'Expand'}>{props.expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
      </div>
      {props.expanded && (
        <div className="citation-body">
          <div className="code-toolbar">
            <span>{citation.language || 'source'}{citation.symbol ? ' · ' + citation.symbol : ''}</span>
            <button onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy location'}</button>
          </div>
          <pre className="citation-code"><code>{(citation.snippet || '').split('\n').map(renderLine)}</code></pre>
        </div>
      )}
    </article>
  )
}
