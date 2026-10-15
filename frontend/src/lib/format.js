export function shortSha(value) {
  if (!value) return 'Uploaded snapshot'
  return value.length > 10 ? value.slice(0, 10) : value
}

export function formatDate(value) {
  if (!value) return 'Just now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export function formatNumber(value = 0) {
  return new Intl.NumberFormat('en', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

export function repositorySlug(name = 'codebase') {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
