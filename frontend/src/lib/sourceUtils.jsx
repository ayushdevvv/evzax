import { FileText, Globe, Instagram, Youtube } from 'lucide-react'

export function formatDate(value) {
  if (!value) return 'Just now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently added'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date)
}

export function sourceLabel(type) {
  if (type === 'youtube') return 'YouTube video'
  if (type === 'instagram') return 'Instagram post'
  if (type === 'web') return 'Web page'
  return 'PDF document'
}

export function sourceIcon(type, size = 17) {
  if (type === 'youtube') return <Youtube size={size} />
  if (type === 'instagram') return <Instagram size={size} />
  if (type === 'web') return <Globe size={size} />
  return <FileText size={size} />
}

export function groupDocuments(sources = []) {
  const groups = new Map()
  for (const item of sources.filter((source) => source.source_type === 'document')) {
    const key = item.document_group_id || item.source_id
    const group = groups.get(key) || { id: key, title: item.title, versions: [] }
    group.versions.push(item)
    groups.set(key, group)
  }
  return Array.from(groups.values()).map((group) => ({ ...group, versions: group.versions.sort((a, b) => (a.version_number || 1) - (b.version_number || 1)), latest: group.versions.at(-1) })).sort((a, b) => new Date(b.latest?.created_at || 0) - new Date(a.latest?.created_at || 0))
}
