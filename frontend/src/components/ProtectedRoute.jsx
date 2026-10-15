import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function ProtectedRoute() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.loading) return <main className="route-loading"><span className="loading-orbit" /><p>Restoring your workspace</p></main>
  if (!auth.user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
