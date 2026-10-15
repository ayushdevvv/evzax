import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, ArrowRight, ArrowUp, BookOpen, CalendarClock, Check, ChevronDown, LockKeyhole, Sparkles } from 'lucide-react'
import LoadingState from '../components/LoadingState'
import { sourceIcon, sourceLabel } from '../lib/sourceUtils'

function CitationList({ citations = [], onOpenCitation }) {
  if (!citations.length) return null
  return <div className="citation-list"><div className="citation-list-label">Sources used <span>{citations.length}</span></div>{citations.map((source, i) => <button key={`${source.url}_${i}`} className="citation-item" onClick={() => onOpenCitation(source)}><span className="citation-index">{source.index || i + 1}</span><span className="citation-content"><strong>{source.title || 'Source passage'}</strong><small>{source.page_number ? `Page ${source.page_number}` : source.timestamp ? source.timestamp : source.version_label || 'Source passage'}{source.version_label ? ` · ${source.version_label}` : ''}</small><span>{source.snippet}</span></span><ArrowRight size={14} /></button>)}</div>
}

function MessageBubble({ message, onOpenCitation }) {
  if (message.role === 'user') return <div className="user-message-row"><div className="user-message-bubble">{message.content}</div></div>
  return <div className="assistant-message-row"><span className="assistant-mark"><Sparkles size={16} /></span><div className="assistant-message-content"><div className="assistant-message-brand">SOURCEX <span>ANSWER</span></div><div className="assistant-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children, ...props }) => <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a> }}>{message.content || ''}</ReactMarkdown></div><CitationList citations={message.sources} onOpenCitation={onOpenCitation} />{message.retrievalStrategy && message.retrievalStrategy !== 'skip' && <div className="answer-meta"><Check size={13} /> Grounded in {message.retrievalK || message.sources?.length || 0} passages</div>}</div></div>
}

export default function ChatPage({ source, messages, busy, usage, error, asOfDate, setAsOfDate, onSend, onBack, onOpenCitation, onSignIn, onClearError }) {
  const [question, setQuestion] = useState('')
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [showDate, setShowDate] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const multiVersion = source?.source_type === 'document' && (source.version_count || 1) > 1

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, busy])

  async function submit(event) {
    event.preventDefault()
    const value = question.trim()
    if (value.length < 2 || busy) return
    const sent = await onSend(value, asOfDate || undefined)
    if (sent) {
      setQuestion('')
      inputRef.current?.focus()
    }
  }

  const guestNudge = usage?.is_guest && (usage?.usage?.chats || 0) >= 2 && !nudgeDismissed
  const initialPrompts = source?.source_type === 'document'
    ? ['Summarize this document', 'What are the key takeaways?', 'Explain the main concepts']
    : ['Summarize the key points', 'What should I know?', 'Find the most important details']

  return <div className="chat-page">
    <header className="chat-header"><button className="chat-back-button" onClick={onBack} aria-label="Back to documents"><ArrowLeft size={17} /></button><span className={`chat-source-type source-${source?.source_type || 'document'}`}>{sourceIcon(source?.source_type, 18)}</span><span className="chat-source-head"><strong>{source?.title || 'New conversation'}</strong><small>{sourceLabel(source?.source_type)} · {source?.chunk_count || 0} passages</small></span>{multiVersion && <button className="chat-version-button" onClick={() => setShowDate((v) => !v)}><CalendarClock size={15} /> {showDate ? 'Hide date' : 'As of date'} <ChevronDown size={14} /></button>}</header>
    {multiVersion && showDate && <div className="as-of-bar"><CalendarClock size={15} /><span>Answer using the version effective on</span><input type="date" value={asOfDate || new Date().toISOString().slice(0, 10)} onChange={(e) => setAsOfDate(e.target.value)} /><span className="as-of-note">Use a past date to retrieve an earlier version.</span></div>}
    <div className="chat-transcript">{messages.length === 0 && !busy ? <div className="chat-welcome"><span className="chat-welcome-icon"><Sparkles size={21} /></span><span className="chat-welcome-kicker">SOURCE CONNECTED</span><h1>Ask your source<br /><em>anything useful.</em></h1><p>Answers are grounded in indexed passages and linked to the original source.</p><div className="suggested-questions">{initialPrompts.map((prompt) => <button key={prompt} onClick={() => { setQuestion(prompt); inputRef.current?.focus() }}>{prompt}<ArrowUp size={14} /></button>)}</div></div> : <div className="message-list">{messages.map((message) => <MessageBubble key={message.id} message={message} onOpenCitation={onOpenCitation} />)}{busy && <div className="assistant-message-row"><span className="assistant-mark"><Sparkles size={16} /></span><div className="assistant-message-content"><div className="assistant-message-brand">SOURCEX <span>WORKING</span></div><LoadingState /></div></div>}<div ref={bottomRef} /></div>}</div>
    <div className="chat-compose-area">{error && <div className="chat-error"><span>{error}</span><button onClick={() => onClearError('')}>Dismiss</button></div>}{guestNudge && <div className="guest-nudge"><span className="guest-nudge-icon"><LockKeyhole size={15} /></span><span><strong>Keep your sources and chats.</strong><small>Create an account to save your workspace across devices.</small></span><button onClick={onSignIn}>Save workspace <ArrowRight size={14} /></button><button className="nudge-dismiss" onClick={() => setNudgeDismissed(true)} aria-label="Dismiss">×</button></div>}<form className="chat-composer" onSubmit={submit}><textarea ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value.slice(0, 1500))} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e) } }} placeholder={`Ask about ${source?.source_type === 'document' ? 'this document' : 'this source'}...`} rows={1} maxLength={1500} disabled={busy} /><div className="composer-bottom"><span><BookOpen size={13} /> Source grounded answers <span className="composer-dot" /> {question.length}/1500</span><button type="submit" className="composer-send" disabled={busy || question.trim().length < 2} aria-label="Send question">{busy ? <span className="button-spinner" /> : <ArrowUp size={18} />}</button></div></form><div className="chat-compose-foot">SourceX can make mistakes. Open the cited passages to verify important details.</div></div>
  </div>
}
