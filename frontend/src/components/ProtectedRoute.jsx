import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function ProtectedRoute() {
  const auth = useAuth()
  const location = useLocation()
  if (!auth.user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
