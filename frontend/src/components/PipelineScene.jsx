import { FileCode2, GitBranch, GitCommitHorizontal } from 'lucide-react'

const sources = [
  { kind: 'paper', label: 'spec.pdf', y: 14, delay: 0 },
  { kind: 'commit', label: 'a1f9c3e', y: 74, delay: 0.5 },
  { kind: 'code', label: 'auth.py', y: 38, delay: 1 },
  { kind: 'branch', label: 'main', y: 88, delay: 1.5 },
  { kind: 'paper', label: 'notes.md', y: 58, delay: 2 },
  { kind: 'commit', label: '7be21d0', y: 22, delay: 2.5 },
  { kind: 'code', label: 'routes.ts', y: 80, delay: 3 },
  { kind: 'paper', label: 'api.docx', y: 46, delay: 3.5 },
]

const particles = [
  { x: 62, y: 24 }, { x: 70, y: 42 }, { x: 78, y: 18 }, { x: 84, y: 56 },
  { x: 66, y: 70 }, { x: 74, y: 82 }, { x: 90, y: 30 }, { x: 88, y: 74 },
  { x: 58, y: 54 }, { x: 80, y: 38 }, { x: 94, y: 50 }, { x: 70, y: 60 },
]

function SourceItem(props) {
  const item = props.item
  const style = { '--y': item.y + '%', '--d': '-' + item.delay + 's', '--r': (item.delay % 1 === 0 ? -9 : 9) + 'deg' }
  if (item.kind === 'paper') {
    return (
      <div className="pipe-item pipe-paper" style={style}>
        <b><i /><i /><i /></b>
        <span>{item.label}</span>
      </div>
    )
  }
  const Icon = item.kind === 'commit' ? GitCommitHorizontal : item.kind === 'branch' ? GitBranch : FileCode2
  return (
    <div className={'pipe-item pipe-chip pipe-' + item.kind} style={style}>
      <Icon size={14} />
      <span>{item.label}</span>
    </div>
  )
}

function Particle(props) {
  const index = props.index
  const style = { '--ox': props.dot.x + '%', '--oy': props.dot.y + '%', '--d': '-' + (index * 0.33).toFixed(2) + 's' }
  return <i className="pipe-dot" style={style} />
}

function renderSource(item) { return <SourceItem key={item.label} item={item} /> }
function renderParticle(dot, index) { return <Particle key={index} dot={dot} index={index} /> }

export default function PipelineScene(props) {
  const compact = props.variant === 'compact'
  return (
    <div className={'pipe' + (compact ? ' pipe-compact' : '')} aria-hidden="true">
      <div className="pipe-grid" />
      <div className="pipe-rail pipe-rail-in" />
      <div className="pipe-rail pipe-rail-out" />
      <div className="pipe-beam" />
      <span className="pipe-tag pipe-tag-in">SOURCES</span>
      <span className="pipe-tag pipe-tag-out">VECTORS</span>
      {sources.map(renderSource)}
      <div className="pipe-core"><i /></div>
      {particles.map(renderParticle)}
      <div className="pipe-lens" />
    </div>
  )
}
