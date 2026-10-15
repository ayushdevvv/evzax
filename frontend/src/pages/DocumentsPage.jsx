import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, FileText, FileWarning, LoaderCircle, MessageSquareText, RefreshCw, ShieldCheck, Trash2, UploadCloud } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate, formatNumber } from '../lib/format'
import RepoNav from '../components/repository/RepoNav'

const MAX_SIZE = 20 * 1024 * 1024
const ACCEPTED = '.pdf,.docx,.md,.mdx,.txt,.rst,.csv,.json,.yaml,.yml,.html,.log'

function prettySize(bytes) {
  const value = bytes || 0
  if (value < 1024) return value + ' B'
  if (value < 1024 * 1024) return (value / 1024).toFixed(0) + ' KB'
  return (value / (1024 * 1024)).toFixed(1) + ' MB'
}

function DocRow(props) {
  const doc = props.doc
  function handleAsk() { props.onAsk(doc) }
  function handleRemove() { props.onRemove(doc.id) }
  return (
    <article className="doc-row">
      <span className="doc-icon"><FileText size={19} /></span>
      <div className="doc-main">
        <strong>{doc.filename}</strong>
        <span>{prettySize(doc.size_bytes)} · {formatNumber(doc.chunk_count)} passages{doc.page_count ? ' · ' + doc.page_count + ' pages' : ''}</span>
      </div>
      <span className="doc-date">{formatDate(doc.created_at)}</span>
      <button className="btn btn-ghost btn-sm" onClick={handleAsk}><MessageSquareText size={14} /> Ask</button>
      <a className="icon-btn" href={api.documentDownloadUrl(props.repositoryId, doc.id)} aria-label={'Download ' + doc.filename} title="Download"><ArrowDownToLine size={16} /></a>
      <button className="icon-btn danger" onClick={handleRemove} disabled={props.removing === doc.id} aria-label={'Delete ' + doc.filename} title="Remove">
        {props.removing === doc.id ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
      </button>
    </article>
  )
}

export default function DocumentsPage() {
  const { repositoryId } = useParams()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [repository, setRepository] = useState(null)
  const [documents, setDocuments] = useState([])
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async function () {
    setLoading(true)
    try {
      const [detail, docs] = await Promise.all([api.repository(repositoryId), api.documents(repositoryId)])
      setRepository(detail.repository)
      setDocuments(docs.documents || [])
    } catch (err) {
      setError(err.message || 'Could not load documents.')
    } finally {
      setLoading(false)
    }
  }, [repositoryId])

  useEffect(function () { load() }, [load])

  function choose(candidate) {
    if (!candidate) return
    setError(''); setNotice('')
    if (candidate.size > MAX_SIZE) { setError('Choose a file smaller than 20 MB.'); return }
    const ok = ACCEPTED.split(',').some(function (ext) { return candidate.name.toLowerCase().endsWith(ext) })
    if (!ok) { setError('Choose a PDF, DOCX, Markdown, text, CSV, JSON, YAML, HTML, or log file.'); return }
    setFile(candidate)
  }

  async function upload() {
    if (!file || uploading) return
    setUploading(true); setError(''); setNotice('')
    try {
      const result = await api.uploadDocument(repositoryId, file)
      setNotice(result.duplicate ? 'Already indexed.' : 'Indexed. It is now part of chat.')
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      await load()
    } catch (err) {
      setError(err.message || 'The document could not be indexed.')
    } finally {
      setUploading(false)
    }
  }

  async function remove(documentId) {
    if (!window.confirm('Remove this document and its indexed passages?')) return
    setRemoving(documentId); setError(''); setNotice('')
    try {
      await api.deleteDocument(repositoryId, documentId)
      setDocuments(function (current) { return current.filter(function (doc) { return doc.id !== documentId }) })
      setNotice('Document removed.')
    } catch (err) {
      setError(err.message || 'Could not remove the document.')
    } finally {
      setRemoving('')
    }
  }

  function askAbout(doc) {
    const text = 'Summarize ' + doc.filename + ' and explain how it relates to the code. Cite the pages or files you use.'
    navigate('/repositories/' + repositoryId + '?ask=' + encodeURIComponent(text))
  }

  function openPicker() { if (inputRef.current) inputRef.current.click() }
  function handlePicked(event) { choose(event.target.files && event.target.files[0]) }
  function handleDragOver(event) { event.preventDefault(); setDragging(true) }
  function handleDragLeave() { setDragging(false) }
  function handleDrop(event) { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files && event.dataTransfer.files[0]) }
  function clearFile() { setFile(null); if (inputRef.current) inputRef.current.value = '' }
  function dismissError() { setError('') }
  function dismissNotice() { setNotice('') }
  function renderDoc(doc) {
    return <DocRow key={doc.id} doc={doc} repositoryId={repositoryId} removing={removing} onAsk={askAbout} onRemove={remove} />
  }

  return (
    <div className="page-wrap">
      <RepoNav repositoryId={repositoryId} repository={repository} active="documents" />

      {error && <div className="notice notice-error"><span>{error}</span><button onClick={dismissError}>Dismiss</button></div>}
      {notice && <div className="notice notice-info"><span>{notice}</span><button onClick={dismissNotice}>Dismiss</button></div>}

      <section className="block">
        <div className="block-head"><h2>Add a document</h2></div>
        <div className={'doc-drop' + (dragging ? ' dragging' : '') + (file ? ' has-file' : '')} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
          <input ref={inputRef} type="file" accept={ACCEPTED} onChange={handlePicked} hidden />
          <button type="button" className="dropzone-icon" onClick={openPicker} aria-label="Choose document"><UploadCloud size={24} /></button>
          <div className="doc-drop-copy">
            <strong>{file ? file.name : 'Drop a file or browse'}</strong>
            <span>{file ? prettySize(file.size) + ' ready' : 'PDF, DOCX, MD, TXT, CSV, logs · up to 20 MB'}</span>
          </div>
          {file ? <button type="button" className="btn btn-ghost btn-sm" onClick={clearFile}>Remove</button> : <button type="button" className="btn btn-ghost btn-sm" onClick={openPicker}>Browse</button>}
          <button className="btn btn-primary" onClick={upload} disabled={!file || uploading}>
            {uploading ? <LoaderCircle size={16} className="spin" /> : <UploadCloud size={16} />} {uploading ? 'Indexing' : 'Index'}
          </button>
        </div>
        <span className="doc-safe"><ShieldCheck size={14} /> Secret shaped lines are redacted before indexing.</span>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Library <span className="count">{formatNumber(documents.length)}</span></h2>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh</button>
        </div>
        {loading ? (
          <div className="skeleton-list"><div /><div /></div>
        ) : documents.length === 0 ? (
          <div className="empty"><FileWarning size={24} /><h3>No documents yet</h3></div>
        ) : (
          <div className="doc-list">{documents.map(renderDoc)}</div>
        )}
      </section>
    </div>
  )
}
