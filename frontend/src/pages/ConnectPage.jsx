import ConnectPanel from '../components/ConnectPanel'

export default function ConnectPage() {
  return (
    <div className="page-wrap page-narrow">
      <div className="page-head">
        <div><span className="eyebrow">NEW CODEBASE</span><h1>Connect a codebase.</h1></div>
      </div>
      <ConnectPanel />
    </div>
  )
}
