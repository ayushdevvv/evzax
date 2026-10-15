import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import ConnectPage from './pages/ConnectPage'
import RepositoryPage from './pages/RepositoryPage'
import VersionsPage from './pages/VersionsPage'
import DocumentsPage from './pages/DocumentsPage'
import EvaluationPage from './pages/EvaluationPage'
import AuthPage from './pages/AuthPage'
import ProtectedRoute from './components/ProtectedRoute'

function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">404</span>
      <h1>Nothing here.</h1>
      <a href="/" className="btn btn-primary">Return home</a>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/repositories/:repositoryId" element={<RepositoryPage />} />
        <Route element={<AppShell />}>
          <Route path="/workspace" element={<DashboardPage />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/repositories/:repositoryId/versions" element={<VersionsPage />} />
          <Route path="/repositories/:repositoryId/documents" element={<DocumentsPage />} />
          <Route path="/repositories/:repositoryId/evaluation" element={<EvaluationPage />} />
        </Route>
      </Route>
      <Route path="/home" element={<Navigate to="/workspace" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
