import { ArrowUpRight, Boxes, FileText, FlaskConical, GitBranch, GitCommitHorizontal, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { shortSha } from '../../lib/format'

export default function RepositoryHeader({ repository, version, syncing, onSync }) {
  return (
    <div className="repository-header glass-card">
      <div className="repository-header-main"><span className="repository-large-icon">{repository?.source_type === 'github' ? <GitBranch size={23}/> : <Boxes size={23}/>}</span><div><div className="repository-title-line"><h2>{repository?.name || 'Codebase'}</h2><span className="status-chip status-ready"><i/> Indexed</span></div><div className="repository-subline"><span><GitCommitHorizontal size={13}/>{shortSha(version?.commit_sha || repository?.current_revision)}</span><span><Boxes size={13}/>{repository?.chunk_count || version?.chunk_count || 0} passages</span></div></div></div>
      <div className="repository-header-actions"><Link to={`/repositories/${repository?.id}/documents`} className="button button-quiet button-small"><FileText size={15}/> Docs</Link><Link to={`/repositories/${repository?.id}/evaluation`} className="button button-quiet button-small"><FlaskConical size={15}/> Search lab</Link><Link to={`/repositories/${repository?.id}/versions`} className="button button-quiet button-small"><GitCommitHorizontal size={15}/> History</Link>{repository?.source_type === 'github' && <button className="button button-quiet button-small" onClick={onSync} disabled={syncing}>{syncing ? <RefreshCw className="spin" size={14}/> : <RefreshCw size={14}/>} Sync</button>}{repository?.source_url && <a className="button button-primary button-small" href={repository.source_url} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14}/></a>}</div>
    </div>
  )
}
