import { PanelRightClose, ScanSearch } from 'lucide-react'
import CitationCard from './CitationCard'

export default function Inspector(props) {
  const citations = props.citations || []

  function renderCitation(citation, index) {
    const key = (citation.source_kind || 'code') + '-' + (citation.document_id || '') + '-' + citation.file_path + '-' + citation.line_start + '-' + index
    return <CitationCard key={key} citation={citation} index={index} expanded={props.activeIndex === index} onToggle={props.onToggle} />
  }

  return (
    <aside className="inspector">
      <div className="pane-head">
        <span className="pane-title"><ScanSearch size={16} /> Evidence</span>
        <button className="icon-btn" onClick={props.onClose} aria-label="Close evidence"><PanelRightClose size={17} /></button>
      </div>
      <div className="inspector-scroll">
        {citations.length === 0 ? (
          <div className="inspector-empty">
            <ScanSearch size={26} />
            <strong>No sources yet</strong>
            <span>Pick a source chip to read the code.</span>
          </div>
        ) : citations.map(renderCitation)}
      </div>
    </aside>
  )
}
