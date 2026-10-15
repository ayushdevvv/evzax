import { FileText, Globe, LayoutDashboard, Library, LogIn, LogOut, ShieldCheck, GitCompare, X } from 'lucide-react'
import Brand from './Brand'
import UsageMeter from './UsageMeter'

const NAV = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'documents', label: 'Documents', Icon: FileText, primary: true },
  { id: 'url', label: 'URL chat', Icon: Globe },
  { id: 'library', label: 'Library', Icon: Library },
  { id: 'versions', label: 'Version history', Icon: GitCompare },
]

export default function Sidebar({ view, activeSourceType, user, usage, onNavigate, onSignIn, onSignOut, mobileOpen, onClose }) {
  const handleNavigate = (id) => { onNavigate(id); onClose?.() }
  return (
    <>
      {mobileOpen && <button className="sidebar-scrim" onClick={onClose} aria-label="Close navigation" />}
      <aside className={`app-sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand-row"><Brand /><button className="sidebar-mobile-close" onClick={onClose} aria-label="Close sidebar"><X size={18} /></button></div>
        <button className="workspace-switcher" onClick={() => handleNavigate('overview')}><span className="workspace-avatar">S</span><span><strong>My workspace</strong><small>Personal knowledge base</small></span><span className="workspace-chevron">⌄</span></button>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {NAV.map(({ id, label, Icon, primary }) => <button key={id} className={`sidebar-nav-item ${view === id || (view === 'chat' && id === (activeSourceType === 'document' ? 'documents' : 'url')) ? 'sidebar-nav-active' : ''} ${primary ? 'sidebar-nav-primary' : ''}`} onClick={() => handleNavigate(id)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{primary && <span className="nav-mini-dot" />}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <UsageMeter usage={usage} onUpgrade={onSignIn} compact />
          <div className="sidebar-profile">
            <span className="profile-avatar">{user ? (user.name || user.email || 'U').slice(0, 1).toUpperCase() : 'G'}</span>
            <span className="profile-data"><strong>{user?.name || (user ? user.email : 'Guest workspace')}</strong><small>{user?.email || 'Not synced to an account'}</small></span>
            {user ? <button className="profile-action" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button> : <button className="profile-action profile-action-login" onClick={onSignIn} aria-label="Sign in" title="Sign in"><LogIn size={16} /></button>}
          </div>
          <div className="sidebar-security"><ShieldCheck size={13} /><span>{user ? 'Cloud account connected' : 'Guest data stays in this browser'}</span></div>
        </div>
      </aside>
    </>
  )
}
