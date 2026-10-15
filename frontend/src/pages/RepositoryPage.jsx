import { useEffect, useRef, useState } from 'react'
import { Bug, CircleHelp, FileText, LoaderCircle, Menu, ScanSearch, Sparkles } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import ChatMessage from '../components/repository/ChatMessage'
import ChatSidebar from '../components/repository/ChatSidebar'
import Brand, { LogoMark } from '../components/Brand'
import CodeViewer from '../components/repository/CodeViewer'
import AnalysisState from '../components/repository/AnalysisState'
import CommandPalette from '../components/CommandPalette'

function historyToMessages(history) {
  const list = history || []
  const out = []
  list.forEach(function (item) {
    out.push({ id: item.id + '-question', question: item.question, created_at: item.created_at })
    out.push({ id: item.id + '-answer', answer: item.answer, citations: item.citations || [], retrieval_mode: item.retrieval_mode, retrieval_policy: item.retrieval_policy, created_at: item.created_at })
  })
  return out
}

const prompts = [
  { label: 'Explain the architecture', icon: CircleHelp, text: 'Explain the main architecture and how the key modules connect.' },
  { label: 'Trace authentication', icon: ScanSearch, text: 'Trace the authentication flow from request to token validation. Cite each relevant file and line.' },
  { label: 'Investigate a bug', icon: Bug, text: 'Show me the most important places to inspect when debugging this codebase. Explain the evidence and avoid guessing.' },
  { label: 'Summarize documents', icon: FileText, text: 'Summarize the attached reference documents and explain how they relate to the code.' },
]

export default function RepositoryPage() {
  const { repositoryId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [repository, setRepository] = useState(null)
  const [repositories, setRepositories] = useState([])
  const [version, setVersion] = useState(null)
  const [versions, setVersions] = useState([])
  const [documents, setDocuments] = useState([])
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [leftOpen, setLeftOpen] = useState(function () { return window.innerWidth > 900 })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [viewer, setViewer] = useState(null)
  const feedRef = useRef(null)
  const textareaRef = useRef(null)

  async function loadAll(preferredVersion) {
    setLoading(true)
    setError('')
    try {
      const [detail, versionResult, docs] = await Promise.all([
        api.repository(repositoryId),
        api.versions(repositoryId),
        api.documents(repositoryId).catch(function () { return { documents: [] } }),
      ])
      const repo = detail.repository
      const available = versionResult.versions || []
      setRepository(repo)
      setVersions(available)
      setDocuments(docs.documents || [])
      const nextId = preferredVersion || selectedVersionId || repo.current_version_id || (detail.current_version && detail.current_version.id) || ''
      const selected = available.find(function (item) { return item.id === nextId }) || detail.current_version || available[0] || null
      setVersion(selected)
      setSelectedVersionId(selected ? selected.id : '')
      if (selected && selected.id) {
        const history = await api.messages(repositoryId, selected.id)
        setMessages(historyToMessages(history.messages))
      } else {
        setMessages([])
      }
    } catch (err) {
      setError(err.message || 'Could not load this codebase.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(function () {
    setSelectedVersionId('')
    loadAll('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryId])

  useEffect(function () {
    api.repositories().then(function (data) { setRepositories(data.repositories || []) }).catch(function () { setRepositories([]) })
  }, [])

  useEffect(function () {
    const ask = searchParams.get('ask')
    if (ask) {
      setQuestion(ask)
      setSearchParams({}, { replace: true })
      window.setTimeout(function () { if (textareaRef.current) textareaRef.current.focus() }, 60)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(function () {
    function onKey(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(function (value) { return !value })
      }
    }
    window.addEventListener('keydown', onKey)
    return function () { window.removeEventListener('keydown', onKey) }
  }, [])

  useEffect(function () {
    if (feedRef.current) feedRef.current.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  async function ask(event) {
    if (event) event.preventDefault()
    const text = question.trim()
    if (!text || sending || !selectedVersionId) return
    const optimistic = { id: 'user-' + Date.now(), question: text, created_at: new Date().toISOString() }
    setMessages(function (current) { return current.concat([optimistic]) })
    setQuestion('')
    setSending(true)
    setError('')
    try {
      const answer = await api.chat(repositoryId, text, selectedVersionId)
      const reply = Object.assign({}, answer, { id: answer.message_id, answer: answer.answer, created_at: new Date().toISOString() })
      setMessages(function (current) { return current.concat([reply]) })
    } catch (err) {
      setError(err.message || 'Could not get an answer.')
    } finally {
      setSending(false)
      if (textareaRef.current) textareaRef.current.focus()
    }
  }

  async function pickVersion(nextId) {
    if (!nextId || nextId === selectedVersionId) return
    setSelectedVersionId(nextId)
    setVersion(versions.find(function (item) { return item.id === nextId }) || null)
    setLoading(true)
    try {
      const history = await api.messages(repositoryId, nextId)
      setMessages(historyToMessages(history.messages))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function sync() {
    setSyncing(true)
    setError('')
    try {
      const result = await api.sync(repositoryId)
      await loadAll(result.version ? result.version.id : selectedVersionId)
      if (result.unchanged) setError('Already up to date. No new commit was found.')
    } catch (err) {
      setError(err.message || 'Could not sync this repository.')
    } finally {
      setSyncing(false)
    }
  }

  function handleQuestion(event) { setQuestion(event.target.value) }
  function handleKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      ask(event)
    }
  }
  function pickPrompt(text) {
    setQuestion(text)
    if (textareaRef.current) textareaRef.current.focus()
  }
  function jumpTo(id) {
    const node = document.getElementById('msg-' + id)
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (window.innerWidth <= 900) setLeftOpen(false)
  }
  function openSource(messageId, citations, index) {
    setViewer({ messageId: messageId, citations: citations, index: index })
    setLeftOpen(false)
  }
  function pickViewerIndex(index) { setViewer(function (current) { return current ? Object.assign({}, current, { index: index }) : current }) }
  function closeViewer() { setViewer(null) }
  function toggleLeft() { setLeftOpen(function (value) { return !value }) }
  function closeLeft() { setLeftOpen(false) }
  function closePalette() { setPaletteOpen(false) }
  function dismissError() { setError('') }

  function renderMessage(message, index) {
    return <ChatMessage key={message.id || index} message={message} openMessageId={viewer ? viewer.messageId : ''} openIndex={viewer ? viewer.index : -1} onOpenSource={openSource} />
  }
  function renderPromptCard(item) {
    const Icon = item.icon
    function handleClick() { pickPrompt(item.text) }
    return (
      <button className="start-prompt" key={item.label} onClick={handleClick}>
        <Icon size={18} />
        <span>{item.label}</span>
      </button>
    )
  }

  if (loading && !repository) return <div className="page-loading room-loading"><LoaderCircle className="spin" size={22} /><span>Opening codebase</span></div>
  if (!repository && error) {
    return (
      <div className="page-wrap page-narrow">
        <div className="empty"><h3>Could not open codebase</h3><p>{error}</p><Link to="/workspace" className="btn btn-primary">Back to overview</Link></div>
      </div>
    )
  }

  const history = messages.filter(function (item) { return item.question }).map(function (item) { return { id: item.id, text: item.question } }).reverse()
  const canSend = Boolean(question.trim()) && !sending && Boolean(selectedVersionId)
  const placeholder = selectedVersionId ? 'Ask about a flow, a bug, or a document' : 'Index a revision to start chatting'
  const roomClass = 'room' + (leftOpen ? ' has-left' : '') + (viewer ? ' has-viewer' : '')

  return (
    <div className={roomClass}>
      <ChatSidebar
        open={leftOpen}
        repositoryId={repositoryId}
        repository={repository}
        repositories={repositories}
        version={version}
        versions={versions}
        documents={documents}
        history={history}
        selectedVersionId={selectedVersionId}
        onPickVersion={pickVersion}
        onJump={jumpTo}
        onSync={sync}
        syncing={syncing}
        onClose={closeLeft}
      />
      {leftOpen && <button className="room-scrim" onClick={closeLeft} aria-label="Close sidebar" />}

      <section className="thread">
        <div className="thread-head">
          <div className="thread-left">
            <button className={'icon-btn fold-btn' + (leftOpen ? ' is-open' : '')} onClick={toggleLeft} aria-label="Toggle sidebar" title="Toggle sidebar"><Menu size={21} /></button>
            <span className={'thread-brand' + (leftOpen ? ' hidden' : '')}><Brand /></span>
          </div>
          <div className="thread-title">
            <strong>{repository ? repository.name : 'Codebase'}</strong>
            <span className="chip chip-info">{version && version.revision ? version.revision : 'index'}</span>
          </div>
          <div className="thread-right"><span className="grounded"><i />Grounded</span></div>
        </div>

        {error && <div className={'notice ' + (error.startsWith('Already up to date') ? 'notice-info' : 'notice-error')}><span>{error}</span><button onClick={dismissError}>Dismiss</button></div>}

        <div className="feed" ref={feedRef}>
          <div className="feed-inner">
            {messages.length === 0 && !loading && (
              <div className="start">
                <h3>Ask <span>{repository ? repository.name : 'your code'}.</span></h3>
                <div className="start-grid">{prompts.map(renderPromptCard)}</div>
              </div>
            )}
            {messages.map(renderMessage)}
            {sending && (
              <article className="msg msg-ai">
                <LogoMark size={34} className="msg-logo pulsing" />
                <div className="msg-body"><AnalysisState /></div>
              </article>
            )}
            {loading && repository && <div className="feed-loading"><LoaderCircle size={16} className="spin" /> Loading revision</div>}
          </div>
        </div>

        <form className="composer" onSubmit={ask}>
          <div className="composer-box">
            <textarea ref={textareaRef} value={question} onChange={handleQuestion} onKeyDown={handleKey} placeholder={placeholder} maxLength={4000} rows={3} disabled={!selectedVersionId || sending} />
            <div className="composer-bar">
              <div className="composer-ctx">
                <span className="ctx-pill">{repository ? repository.name : 'repo'}</span>
                {documents.length > 0 && <span className="ctx-pill"><FileText size={12} /> {documents.length} docs</span>}
                <span className="composer-hint"><kbd>Enter</kbd> send <kbd>Shift</kbd> <kbd>Enter</kbd> new line</span>
              </div>
              <button className="btn btn-primary" type="submit" disabled={!canSend}>
                {sending ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Ask
              </button>
            </div>
          </div>
        </form>
      </section>

      {viewer && <CodeViewer citations={viewer.citations} index={viewer.index} onPick={pickViewerIndex} onClose={closeViewer} />}
      <CommandPalette open={paletteOpen} onClose={closePalette} repositories={repositories} />
    </div>
  )
}
