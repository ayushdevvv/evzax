import { Code2, FileText, FlaskConical, GitBranch, GitCommitHorizontal, LayoutGrid, Menu, Plus } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import Brand from '../Brand'

function navClass(state) {
  return 'side-link' + (state.isActive ? ' active' : '')
}

function RepoLink(props) {
  const repo = props.repo
  const Icon = repo.source_type === 'github' ? GitBranch : Code2
  return (
    <NavLink to={'/repositories/' + repo.id} className={navClass} title={repo.name}>
      <Icon size={16} />
      <span>{repo.name}</span>
    </NavLink>
  )
}

export default function Sidebar(props) {
  const repositories = props.repositories || []
  const visible = repositories.slice(0, 10)
  const location = useLocation()
  const match = location.pathname.match(/^\/repositories\/([^/]+)/)
  const activeRepo = repositories.find(function (repo) { return match && repo.id === match[1] }) || repositories[0]
  const repoBase = activeRepo ? '/repositories/' + activeRepo.id : '/connect' 

  function renderRepo(repo) {
    return <RepoLink key={repo.id} repo={repo} />
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <button className="icon-btn sidebar-toggle" onClick={props.onToggle} aria-label="Toggle sidebar" title="Toggle sidebar"><Menu size={21} /></button>
        <Brand />
      </div>

      <nav className="side-group">
        <span className="side-label">WORKSPACE</span>
        <NavLink to="/workspace" end className={navClass} title="Overview"><LayoutGrid size={16} /><span>Overview</span></NavLink>
        <NavLink to="/connect" className={navClass} title="Connect codebase"><Plus size={16} /><span>Connect codebase</span></NavLink>
        <span className="side-label side-label-spaced">TOOLS</span>
        <NavLink to={repoBase === '/connect' ? '/connect' : repoBase + '/documents'} className={navClass} title="Documents"><FileText size={16} /><span>Documents</span></NavLink>
        <NavLink to={repoBase === '/connect' ? '/connect' : repoBase + '/versions'} className={navClass} title="Versions"><GitCommitHorizontal size={16} /><span>Versions</span></NavLink>
        <NavLink to={repoBase === '/connect' ? '/connect' : repoBase + '/evaluation'} className={navClass} title="Retrieval lab"><FlaskConical size={16} /><span>Retrieval lab</span></NavLink>
      </nav>

      <nav className="side-group side-scroll">
        <span className="side-label">CODEBASES <em>{repositories.length}</em></span>
        {visible.length ? visible.map(renderRepo) : <span className="side-empty">None yet</span>}
      </nav>
    </aside>
  )
}
