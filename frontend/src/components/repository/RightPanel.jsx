import { ArrowUpRight, Check, Copy, FileCode2, FileText, FolderTree, PanelRightClose, ScanSearch, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import CitationCard from './CitationCard'
import { apiAbsoluteUrl } from '../../lib/api'

function FileRow(props) {
  const file = props.file
  const [copied, setCopied] = useState(false)
  const parts = file.path.split('/')
  const name = parts.pop()
  const dir = parts.join('/')
  const Icon = file.kind === 'document' ? FileText : FileCode2

  function open() { props.onPick(file.path) }
  function ask() { props.onAsk(file) }
  async function copy() {
    try {
      await navigator.clipboard.writeText(file.path)
      setCopied(true)
      window.setTimeout(function () { setCopied(false) }, 1400)
    } catch (err) {
      setCopied(false)
    }
  }

  return (
    <div className={'file-row' + (props.active ? ' active' : '')}>
      <button className="file-main" onClick={open}>
        <Icon size={16} />
        <span className="file-name"><strong>{name}</strong>{dir && <em>{dir}</em>}</span>
        <span className="file-count">{file.citations.length}</span>
      </button>
      <div className="file-actions">
        <button className="file-act" onClick={ask}><Sparkles size={13} /> Ask</button>
        <button className="file-act" onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Path'}</button>
        {file.url && <a className="file-act" href={apiAbsoluteUrl(file.url)} target="_blank" rel="noreferrer"><ArrowUpRight size={13} /> Open</a>}
      </div>
    </div>
  )
}

export default function RightPanel(props) {
  const citations = props.citations || []
  const files = props.files || []

  function showCode() { props.onTab('code') }
  function showFiles() { props.onTab('files') }

  function renderCitation(citation, index) {
    const key = (citation.source_kind || 'code') + '-' + (citation.document_id || '') + '-' + citation.file_path + '-' + citation.line_start + '-' + index
    return <CitationCard key={key} citation={citation} index={index} expanded={props.activeIndex === index} onToggle={props.onToggle} />
  }
  function renderFile(file) {
    return <FileRow key={file.path} file={file} active={file.path === props.activeFilePath} onPick={props.onPickFile} onAsk={props.onAskFile} />
  }

  return (
    <aside className="right-panel">
      <div className="rp-head">
        <div className="rp-tabs">
          <button className={'rp-tab' + (props.tab === 'code' ? ' active' : '')} onClick={showCode}><ScanSearch size={15} /> Code</button>
          <button className={'rp-tab' + (props.tab === 'files' ? ' active' : '')} onClick={showFiles}><FolderTree size={15} /> Files <em>{files.length}</em></button>
        </div>
        <button className="icon-btn" onClick={props.onClose} aria-label="Close panel"><PanelRightClose size={17} /></button>
      </div>

      {props.tab === 'code' ? (
        <div className="rp-scroll">
          {props.activeFilePath && (
            <div className="rp-context">
              <FileCode2 size={14} /><span>{props.activeFilePath}</span>
              <button className="icon-btn" onClick={props.onClearFile} aria-label="Clear file filter"><X size={14} /></button>
            </div>
          )}
          {citations.length === 0 ? (
            <div className="rp-empty"><ScanSearch size={28} /><strong>Nothing selected</strong><span>Pick a source chip or a file.</span></div>
          ) : citations.map(renderCitation)}
        </div>
      ) : (
        <div className="rp-scroll">
          {files.length === 0 ? (
            <div className="rp-empty"><FolderTree size={28} /><strong>No files yet</strong><span>Files cited in answers appear here.</span></div>
          ) : files.map(renderFile)}
        </div>
      )}
    </aside>
  )
}
