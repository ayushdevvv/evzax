import { Boxes, FileText, FlaskConical, GitBranch, GitCommitHorizontal, MessageSquareText } from 'lucide-react'
import { Link } from 'react-router-dom'

const tabs = [
  { key: 'chat', label: 'Chat', path: '', icon: MessageSquareText },
  { key: 'documents', label: 'Documents', path: '/documents', icon: FileText },
  { key: 'versions', label: 'Versions', path: '/versions', icon: GitCommitHorizontal },
  { key: 'evaluation', label: 'Retrieval lab', path: '/evaluation', icon: FlaskConical },
]

export default function RepoNav(props) {
  const repository = props.repository || {}
  const base = '/repositories/' + props.repositoryId
  const Icon = repository.source_type === 'github' ? GitBranch : Boxes

  function renderTab(tab) {
    const TabIcon = tab.icon
    return (
      <Link key={tab.key} to={base + tab.path} className={'repo-tab' + (props.active === tab.key ? ' active' : '')}>
        <TabIcon size={16} />{tab.label}
      </Link>
    )
  }

  return (
    <div className="repo-nav">
      <div className="repo-nav-top">
        <div className="repo-nav-id">
          <span className="repo-icon"><Icon size={18} /></span>
          <h2>{repository.name || 'Codebase'}</h2>
          <span className="chip chip-ok"><i />Indexed</span>
        </div>
        <div className="repo-nav-actions">{props.children}</div>
      </div>
      <nav className="repo-tabs">{tabs.map(renderTab)}</nav>
    </div>
  )
}
