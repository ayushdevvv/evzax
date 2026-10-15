import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export function RouteLoading({ waking }) {
  return <main className="route-loading"><span className="loading-orbit" /><p>{waking ? 'Starting the server, one moment' : 'Restoring your workspace'}</p></main>
}

export default function ProtectedRoute() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.loading) return <RouteLoading waking={auth.waking} />
  if (!auth.user && auth.unavailable) {
    return (
      <main className="route-loading">
        <p>We could not reach EVZAX to check your session.</p>
        <button className="btn btn-primary" onClick={() => auth.refresh({ boot: true })}>Try again</button>
      </main>
    )
  }
  if (!auth.user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
