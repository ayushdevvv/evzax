import { useEffect, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import PipelineScene from './PipelineScene'

const phases = [
  'Reading repository',
  'Filtering generated files',
  'Mapping code symbols',
  'Building search index',
  'Preparing workspace',
]

const logs = [
  'read   src/auth/middleware.py',
  'commit a1f9c3e parsed',
  'skip   node_modules/',
  'symbol require_session',
  'read   docs/spec.pdf  p1 to p9',
  'embed  128 passages',
  'commit 7be21d0 parsed',
  'symbol verify_token',
  'read   api/routes.ts',
  'index  passages written',
]

export default function LoadingState(props) {
  const [phase, setPhase] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(function () {
    const id = window.setInterval(function () {
      setPhase(function (value) { return Math.min(value + 1, phases.length - 1) })
    }, 2600)
    return function () { window.clearInterval(id) }
  }, [])

  useEffect(function () {
    const id = window.setInterval(function () { setTick(function (value) { return value + 1 }) }, 650)
    return function () { window.clearInterval(id) }
  }, [])

  function renderPhase(label, index) {
    const done = index < phase
    const current = index === phase
    return (
      <li key={label} className={done ? 'done' : current ? 'current' : ''}>
        <span className="run-mark">{done ? <Check size={13} /> : current ? <LoaderCircle size={13} className="spin" /> : null}</span>
        <span>{label}</span>
      </li>
    )
  }

  function renderLog(offset) {
    const line = logs[(tick + offset) % logs.length]
    return <div key={tick + '-' + offset} className={'run-log-line l' + offset}>{line}</div>
  }

  return (
    <div className="run-backdrop" role="status" aria-live="polite">
      <div className="run-window">
        <div className="run-window-bar"><i /><i /><i /><span>evzax index</span></div>
        <PipelineScene />
        <div className="run-window-body">
          <h2>{props.title || 'Indexing codebase'}</h2>
          <div className="run-cols">
            <ul className="run-steps">{phases.map(renderPhase)}</ul>
            <div className="run-log">{[3, 2, 1, 0].map(renderLog)}</div>
          </div>
          <div className="run-track"><span style={{ width: (14 + phase * 20) + '%' }} /></div>
          <span className="run-note">Keep this tab open</span>
        </div>
      </div>
    </div>
  )
}
