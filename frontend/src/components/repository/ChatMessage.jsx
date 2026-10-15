import { useState } from 'react'
import { Check, Copy, FileCode2, FileText } from 'lucide-react'
import { LogoMark } from '../Brand'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatDate } from '../../lib/format'

function SourceChip(props) {
  const citation = props.citation
  const isDocument = citation.source_kind === 'document'
  const name = (citation.file_path || '').split('/').pop()
  const spot = isDocument && citation.page_number ? 'p' + citation.page_number : citation.line_start + '-' + citation.line_end
  function handleClick() { props.onSelect(props.index) }
  return (
    <button className={'source-chip' + (props.active ? ' active' : '')} onClick={handleClick}>
      {isDocument ? <FileText size={13} /> : <FileCode2 size={13} />}
      <span>{name}</span>
      <em>{spot}</em>
    </button>
  )
}

export default function ChatMessage(props) {
  const message = props.message
  const [copied, setCopied] = useState(false)
  const isAssistant = Boolean(message.answer)
  const answer = message.answer || message.content || ''
  const citations = message.citations || []
  const policy = message.retrieval_policy || {}

  async function copy() {
    try {
      await navigator.clipboard.writeText(answer)
      setCopied(true)
      window.setTimeout(function () { setCopied(false) }, 1500)
    } catch (err) {
      setCopied(false)
    }
  }

  function selectSource(index) { props.onOpenSource(message.id, citations, index) }

  function renderChip(citation, index) {
    const key = (citation.source_kind || 'code') + '-' + (citation.document_id || '') + '-' + citation.file_path + '-' + citation.line_start + '-' + index
    return <SourceChip key={key} citation={citation} index={index} active={props.openMessageId === message.id && props.openIndex === index} onSelect={selectSource} />
  }

  if (!isAssistant) {
    return (
      <article className="msg msg-user" id={'msg-' + message.id}>
        <p>{message.question || answer}</p>
      </article>
    )
  }

  return (
    <article className="msg msg-ai" id={'msg-' + message.id}>
      <LogoMark size={34} className="msg-logo" />
      <div className="msg-body">
      <div className="msg-head">
        <strong>Evzax</strong>
        {message.created_at && <span>{formatDate(message.created_at)}</span>}
        <button className="icon-btn msg-copy" onClick={copy} aria-label="Copy answer">{copied ? <Check size={15} /> : <Copy size={15} />}</button>
      </div>
      {message.retrieval_mode && (
        <div className="run-info">
          <i />
          <strong>{message.retrieval_mode === 'no_retrieval' ? 'Direct response' : 'Hybrid retrieval'}</strong>
          {policy.mode && policy.mode !== 'no_retrieval' && <span>{policy.mode.replaceAll('_', ' ')}</span>}
          {policy.code_k > 0 && <span>{policy.code_k} code</span>}
          {policy.document_k > 0 && <span>{policy.document_k} docs</span>}
        </div>
      )}
      <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown></div>
      {citations.length > 0 && (
        <div className="source-row">
          <span className="source-row-label">{citations.length} sources</span>
          {citations.map(renderChip)}
        </div>
      )}
      </div>
    </article>
  )
}
