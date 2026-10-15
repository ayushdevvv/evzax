import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, LoaderCircle, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import RepoNav from '../components/repository/RepoNav'

function newCase() { return { id: Date.now() + '-' + Math.random(), question: '', paths: '' } }
function metric(value, suffix) {
  const unit = suffix || ''
  return Math.round((value || 0) * 100) / 100 + unit
}

const engines = [
  { key: 'semantic', label: 'Semantic', desc: 'Vector similarity' },
  { key: 'hybrid', label: 'Hybrid', desc: 'Vectors plus keywords' },
]

function CaseRow(props) {
  const item = props.item
  function handleQuestion(event) { props.onChange(item.id, 'question', event.target.value) }
  function handlePaths(event) { props.onChange(item.id, 'paths', event.target.value) }
  function handleRemove() { props.onRemove(item.id) }
  return (
    <div className="eval-case">
      <span className="eval-num">{String(props.index + 1).padStart(2, '0')}</span>
      <div className="eval-fields">
        <label>Question<input value={item.question} onChange={handleQuestion} placeholder="Where is the session token validated?" /></label>
        <label>Expected files<input value={item.paths} onChange={handlePaths} placeholder="backend/auth/middleware.py, frontend/api/client.ts" /></label>
      </div>
      <button className="icon-btn danger" onClick={handleRemove} disabled={props.disableRemove} title="Remove test"><Trash2 size={16} /></button>
    </div>
  )
}

export default function EvaluationPage() {
  const { repositoryId } = useParams()
  const [repository, setRepository] = useState(null)
  const [versions, setVersions] = useState([])
  const [versionId, setVersionId] = useState('')
  const [k, setK] = useState(5)
  const [cases, setCases] = useState([newCase(), newCase()])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async function () {
    setLoading(true)
    try {
      const [detail, versionResponse, previous] = await Promise.all([api.repository(repositoryId), api.versions(repositoryId), api.latestEvaluation(repositoryId)])
      setRepository(detail.repository)
      const available = versionResponse.versions || []
      setVersions(available)
      setVersionId(function (current) { return current || detail.repository.current_version_id || (available[0] && available[0].id) || '' })
      setResult(previous.evaluation || null)
    } catch (err) {
      setError(err.message || 'Could not load retrieval lab.')
    } finally {
      setLoading(false)
    }
  }, [repositoryId])

  useEffect(function () { load() }, [load])

  function updateCase(id, field, value) {
    setCases(function (current) { return current.map(function (item) { return item.id === id ? Object.assign({}, item, { [field]: value }) : item }) })
  }
  function removeCase(id) { setCases(function (current) { return current.filter(function (row) { return row.id !== id }) }) }
  function addCase() { setCases(function (current) { return current.concat([newCase()]) }) }

  async function run() {
    setError('')
    const normalized = cases.map(function (item) {
      return {
        question: item.question.trim(),
        relevant_paths: item.paths.split(/[\n,;]/).map(function (part) { return part.trim() }).filter(Boolean),
      }
    }).filter(function (item) { return item.question || item.relevant_paths.length })
    const bad = normalized.some(function (item) { return item.question.length < 3 || item.relevant_paths.length === 0 })
    if (!normalized.length || bad) {
      setError('Each test needs a question and at least one exact file path.')
      return
    }
    setRunning(true)
    try {
      setResult(await api.runEvaluation(repositoryId, { version_id: versionId || null, k: Number(k), cases: normalized }))
    } catch (err) {
      setError(err.message || 'Evaluation could not run.')
    } finally {
      setRunning(false)
    }
  }

  function handleVersion(event) { setVersionId(event.target.value) }
  function handleK(event) { setK(Number(event.target.value)) }
  function clearResult() { setResult(null) }
  function dismissError() { setError('') }

  function renderVersionOption(version) {
    return <option key={version.id} value={version.id}>{version.revision}{version.is_current ? ' · Current' : ''}</option>
  }
  function renderK(value) { return <option key={value} value={value}>{value} passages</option> }
  function renderCase(item, index) {
    return <CaseRow key={item.id} item={item} index={index} onChange={updateCase} onRemove={removeCase} disableRemove={cases.length === 1} />
  }
  function renderPath(path, i) { return <code key={path + '-' + i}>{path}</code> }
  function renderEngine(entry) {
    const data = result[entry.key]
    return (
      <article className={'metric' + (entry.key === 'hybrid' ? ' featured' : '')} key={entry.key}>
        <div className="metric-top"><div><h3>{entry.label}</h3><p>{entry.desc}</p></div>{entry.key === 'hybrid' && <span className="chip chip-info">RRF fusion</span>}</div>
        <div className="metric-main"><span>Recall@{result.k}</span><strong>{metric(data.recall_at_k * 100, '%')}</strong></div>
        <div className="metric-grid">
          <div><span>Precision@{result.k}</span><strong>{metric(data.precision_at_k * 100, '%')}</strong></div>
          <div><span>MRR</span><strong>{metric(data.mrr)}</strong></div>
          <div><span>Mean latency</span><strong>{metric(data.mean_latency_ms, ' ms')}</strong></div>
          <div><span>p95 latency</span><strong>{metric(data.p95_latency_ms, ' ms')}</strong></div>
        </div>
      </article>
    )
  }
  function renderResultCase(item, index) {
    return (
      <details className="eval-result" key={item.question + '-' + index}>
        <summary>
          <span className="eval-num">{String(index + 1).padStart(2, '0')}</span>
          <span className="eval-q">{item.question}</span>
          <span className="eval-recall">Hybrid {metric(item.hybrid.recall_at_k * 100, '%')}</span>
          <ChevronDown size={16} />
        </summary>
        <div className="eval-detail">
          <div><span className="eyebrow">EXPECTED</span>{item.relevant_paths.map(renderPath)}</div>
          <div><span className="eyebrow">SEMANTIC</span>{item.semantic.retrieved_paths.map(renderPath)}</div>
          <div><span className="eyebrow">HYBRID</span>{item.hybrid.retrieved_paths.map(renderPath)}</div>
        </div>
      </details>
    )
  }

  if (loading && !repository) return <div className="page-loading"><LoaderCircle className="spin" size={22} /> Opening retrieval lab</div>

  return (
    <div className="page-wrap">
      <RepoNav repositoryId={repositoryId} repository={repository} active="evaluation" />
      {error && <div className="notice notice-error"><span>{error}</span><button onClick={dismissError}>Dismiss</button></div>}

      <section className="block">
        <div className="block-head"><h2>Test set</h2></div>
        <div className="eval-builder">
          <div className="eval-options">
            <label>Revision<select value={versionId} onChange={handleVersion}>{versions.filter(function (v) { return v.status === 'ready' }).map(renderVersionOption)}</select></label>
            <label>Results per query<select value={k} onChange={handleK}>{[3, 5, 8, 10, 12, 15].map(renderK)}</select></label>
          </div>
          <div className="eval-cases">{cases.map(renderCase)}</div>
          <div className="eval-foot">
            <button className="btn btn-ghost btn-sm" onClick={addCase} disabled={cases.length >= 30}><Plus size={14} /> Add test</button>
            <button className="btn btn-primary" onClick={run} disabled={running || !versionId || cases.length === 0}>
              {running ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />} {running ? 'Running' : 'Run evaluation'}
            </button>
          </div>
        </div>
      </section>

      {result && (
        <section className="block">
          <div className="block-head">
            <h2>{result.case_count} queries measured</h2>
            <button className="btn btn-ghost btn-sm" onClick={clearResult}><RotateCcw size={14} /> Clear</button>
          </div>
          <div className="metric-pair">{engines.map(renderEngine)}</div>
          <p className="eval-note">Measured against your labels. Latency covers retrieval only.</p>
          <div className="eval-results">{result.cases.map(renderResultCase)}</div>
        </section>
      )}
    </div>
  )
}
