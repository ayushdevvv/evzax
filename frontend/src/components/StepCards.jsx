import { motion } from 'framer-motion'
import { ArrowRight, GitBranch, ScanSearch, Waypoints } from 'lucide-react'

const steps = [
  { index: '01', title: 'Connect', body: 'ZIP or GitHub', icon: GitBranch },
  { index: '02', title: 'Understand', body: 'Symbols and context', icon: ScanSearch },
  { index: '03', title: 'Explore', body: 'Answers with source lines', icon: Waypoints },
]

export default function StepCards() {
  return (
    <div className="step-flow">
      {steps.map((step, index) => {
        const Icon = step.icon
        return (
          <motion.div className="step-card glass-card" key={step.index} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}>
            <span className="step-number">{step.index}</span>
            <div className="step-icon"><Icon size={20} /></div>
            <strong>{step.title}</strong>
            <span>{step.body}</span>
            {index < steps.length - 1 && <ArrowRight className="step-arrow" size={17} />}
          </motion.div>
        )
      })}
    </div>
  )
}
