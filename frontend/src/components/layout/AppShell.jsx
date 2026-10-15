import { useEffect, useState } from 'react'
import { LogOut, Menu, Plus, Search } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuth } from '../../lib/AuthContext'
import CommandPalette from '../CommandPalette'
import { api } from '../../lib/api'

export default function AppShell() {
  const location = useLocation()
  const auth = useAuth()
  const [userMenu, setUserMenu] = useState(false)
  const [repositories, setRepositories] = useState([])
  const [health, setHealth] = useState('checking')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [railOpen, setRailOpen] = useState(true)

  useEffect(function () {
    let active = true
    api.repositories()
      .then(function (data) { if (active) setRepositories(data.repositories || []) })
      .catch(function () { /* keep the last good list; a blip must not empty the sidebar */ })
    return function () { active = false }
  }, [location.pathname, auth.user && auth.user.id])

  useEffect(function () {
    let active = true
    function check() {
      api.health()
        .then(function () { if (active) setHealth('online') })
        .catch(function () { if (active) setHealth('offline') })
    }
    check()
    const timer = window.setInterval(check, 30000)
    return function () { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(function () {
    function onKey(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(function (value) { return !value })
      }
    }
    window.addEventListener('keydown', onKey)
    return function () { window.removeEventListener('keydown', onKey) }
  }, [])

  useEffect(function () { setMenuOpen(false) }, [location.pathname])

  function openPalette() { setPaletteOpen(true) }
  function closePalette() { setPaletteOpen(false) }
  function toggleSidebar() {
    if (window.innerWidth <= 900) setMenuOpen(function (value) { return !value })
    else setRailOpen(function (value) { return !value })
  }
  function closeMenu() { setMenuOpen(false) }
  function toggleUserMenu() { setUserMenu(function (value) { return !value }) }
  function logout() { setUserMenu(false); setRepositories([]); auth.signOut() }
  const initial = auth.user && auth.user.name ? auth.user.name.trim().charAt(0).toUpperCase() : 'U'

  const healthLabel = health === 'online' ? 'API online' : health === 'offline' ? 'API offline' : 'Checking API'

  return (
    <div className={'app-shell' + (menuOpen ? ' menu-open' : '') + (railOpen ? '' : ' rail')}>
      <Sidebar repositories={repositories} onToggle={toggleSidebar} />
      <button className="shell-scrim" onClick={closeMenu} aria-label="Close menu" />
      <div className="app-main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={toggleSidebar} aria-label="Open menu"><Menu size={21} /></button>
          <button className="palette-trigger" onClick={openPalette}>
            <Search size={15} />
            <span><b className="pt-long">Search codebases and pages</b><b className="pt-short">Search</b></span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-right">
            <span className={'health health-' + health}><i />{healthLabel}</span>
            <Link to="/connect" className="btn btn-primary btn-sm"><Plus size={15} /> Connect</Link>
            <div className="user-wrap">
              <button className="avatar-btn" onClick={toggleUserMenu} aria-label="Account">{initial}</button>
              {userMenu && (
                <div className="user-menu">
                  <div className="user-menu-id"><strong>{auth.user ? auth.user.name : ''}</strong><span>{auth.user ? auth.user.email : ''}</span></div>
                  <button className="user-menu-item" onClick={logout}><LogOut size={15} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="page-body">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} repositories={repositories} />
    </div>
  )
}
