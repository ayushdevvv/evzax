import { ArrowUpRight, FileText, MessageCircle, Globe } from 'lucide-react'

const ITEMS = [
  { key: 'documents', label: 'PDFs', Icon: FileText },
  { key: 'urls', label: 'URLs', Icon: Globe },
  { key: 'chats', label: 'Chats', Icon: MessageCircle },
]

export default function UsageMeter({ usage, onUpgrade, compact = false }) {
  if (!usage) return null
  return (
    <section className={`usage-card ${compact ? 'usage-card-compact' : ''}`}>
      <div className="usage-head"><span className="usage-plan-label">{usage.is_guest ? 'GUEST ACCESS' : 'FREE PLAN'}</span><span className="usage-period">{usage.period === 'monthly' ? 'Chats monthly' : 'Browser trial'}</span></div>
      <div className="usage-lines">
        {ITEMS.map(({ key, label, Icon }) => {
          const cap = usage.limits?.[key] ?? 0
          const count = usage.usage?.[key] ?? 0
          const percent = cap ? Math.min(100, count / cap * 100) : 0
          return <div className="usage-line" key={key}><div><span className="usage-item-label"><Icon size={13} /> {label}</span><strong>{count}<small> / {cap}</small></strong></div><span className="usage-track"><i style={{ width: `${percent}%` }} /></span></div>
        })}
      </div>
      {usage.is_guest && <button className="usage-upgrade" onClick={onUpgrade}>Create free account <ArrowUpRight size={14} /></button>}
    </section>
  )
}
