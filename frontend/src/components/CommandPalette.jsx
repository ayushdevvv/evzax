import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, FlaskConical, GitCommitHorizontal, LayoutGrid, MessageSquareText, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function buildItems(repositories) {
  const items = [
    { id: 'overview', label: 'Overview', hint: 'Go to', to: '/workspace', icon: LayoutGrid },
    { id: 'connect', label: 'Connect codebase', hint: 'Go to', to: '/connect', icon: Plus },
  ]
  repositories.forEach(function (repo) {
    items.push({ id: repo.id + '-chat', label: repo.name + ' chat', hint: 'Open', to: '/repositories/' + repo.id, icon: MessageSquareText })
    items.push({ id: repo.id + '-docs', label: repo.name + ' documents', hint: 'Open', to: '/repositories/' + repo.id + '/documents', icon: FileText })
    items.push({ id: repo.id + '-versions', label: repo.name + ' versions', hint: 'Open', to: '/repositories/' + repo.id + '/versions', icon: GitCommitHorizontal })
    items.push({ id: repo.id + '-lab', label: repo.name + ' retrieval lab', hint: 'Open', to: '/repositories/' + repo.id + '/evaluation', icon: FlaskConical })
  })
  return items
}

function PaletteRow(props) {
  const item = props.item
  const Icon = item.icon
  function handleClick() { props.onPick(item) }
  function handleHover() { props.onHover(props.index) }
  return (
    <button className={'palette-row' + (props.active ? ' active' : '')} onClick={handleClick} onMouseEnter={handleHover}>
      <Icon size={16} />
      <span>{item.label}</span>
      <em>{item.hint}</em>
    </button>
  )
}

export default function CommandPalette(props) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  const items = useMemo(function () {
    const all = buildItems(props.repositories || [])
    const text = query.trim().toLowerCase()
    if (!text) return all.slice(0, 12)
    return all.filter(function (item) { return item.label.toLowerCase().includes(text) }).slice(0, 12)
  }, [props.repositories, query])

  useEffect(function () {
    if (props.open) {
      setQuery('')
      setCursor(0)
      window.setTimeout(function () { if (inputRef.current) inputRef.current.focus() }, 20)
    }
  }, [props.open])

  if (!props.open) return null

  function pick(item) {
    props.onClose()
    navigate(item.to)
  }

  function handleChange(event) {
    setQuery(event.target.value)
    setCursor(0)
  }

  function handleKey(event) {
    if (event.key === 'Escape') { props.onClose(); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(function (value) { return Math.min(value + 1, items.length - 1) }) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(function (value) { return Math.max(value - 1, 0) }) }
    if (event.key === 'Enter' && items[cursor]) { event.preventDefault(); pick(items[cursor]) }
  }

  function renderItem(item, index) {
    return <PaletteRow key={item.id} item={item} index={index} active={index === cursor} onPick={pick} onHover={setCursor} />
  }

  return (
    <div className="palette-backdrop" onMouseDown={props.onClose}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={function (event) { event.stopPropagation() }}>
        <input ref={inputRef} value={query} onChange={handleChange} onKeyDown={handleKey} placeholder="Search codebases and pages" aria-label="Search" />
        <div className="palette-list">
          {items.length ? items.map(renderItem) : <div className="palette-empty">No matches</div>}
        </div>
        <div className="palette-foot"><span><kbd>Up</kbd><kbd>Down</kbd> Move</span><span><kbd>Enter</kbd> Open</span><span><kbd>Esc</kbd> Close</span></div>
      </div>
    </div>
  )
}
