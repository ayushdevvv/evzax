import { useEffect, useState } from 'react'

const phases = ['Analysing', 'Finding relevant code', 'Reading sources', 'Writing answer']

export default function AnalysisState() {
  const [phase, setPhase] = useState(0)
  const [chars, setChars] = useState(0)

  useEffect(function () {
    const timer = window.setInterval(function () {
      setChars(function (value) { return value + 1 })
    }, 45)
    return function () { window.clearInterval(timer) }
  }, [])

  useEffect(function () {
    const label = phases[phase]
    if (chars > label.length + 14 && phase < phases.length - 1) {
      setPhase(phase + 1)
      setChars(0)
    }
  }, [chars, phase])

  const label = phases[phase]
  const shown = label.slice(0, Math.min(chars, label.length))
  return (
    <div className="think" role="status" aria-live="polite">
      <span className="think-text">{shown}</span>
      <span className="think-dots"><i /><i /><i /></span>
    </div>
  )
}
