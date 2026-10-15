import { useEffect } from 'react'
import { Check, FileText, GitBranch, GitCommitHorizontal, ScanSearch, Waypoints } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import Brand from '../components/Brand'
import ConnectPanel from '../components/ConnectPanel'
import Footer from '../components/Footer'
import HeroMock from '../components/landing/HeroMock'

const steps = [
  { index: '01', title: 'Connect', body: 'GitHub or ZIP', icon: GitBranch },
  { index: '02', title: 'Index', body: 'Symbols and passages', icon: ScanSearch },
  { index: '03', title: 'Ask', body: 'Answers with exact lines', icon: Waypoints },
]

const trust = ['GitHub', 'ZIP upload', 'PDF', 'Markdown', 'DOCX', 'Logs', 'Python', 'TypeScript']

function renderTrust(item) { return <span key={item}>{item}</span> }
function renderStep(step, position) {
  const Icon = step.icon
  return (
    <div className="step" key={step.index}>
      <div className="step-top"><span className="step-num">{step.index}</span><Icon size={22} /></div>
      <strong>{step.title}</strong>
      <span>{step.body}</span>
    </div>
  )
}

export default function LandingPage() {
  const location = useLocation()
  useEffect(function () {
    if (location.hash) {
      const node = document.getElementById(location.hash.slice(1))
      if (node) node.scrollIntoView()
    }
  }, [location.hash])

  return (
    <main className="landing">
      <div className="landing-glow" aria-hidden="true" />
      <nav className="landing-nav">
        <Brand />
        <div className="landing-links">
          <a href="#workflow">Workflow</a>
          <a href="#features">Features</a>
        </div>
        <div className="landing-cta">
          <Link className="landing-login" to="/login">Log in</Link>
          <Link className="btn btn-primary btn-sm" to="/signup">Get started</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker"><i /> EVZAX CODING WORKSPACE</div>
          <h1>Talk to your <span>codebase.</span></h1>
          <p>Exact lines. Every revision.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" to="/signup">Get started</Link>
            <Link className="btn btn-ghost btn-lg" to="/workspace">Open workspace</Link>
          </div>
          <div className="hero-proof"><span><Check size={15} /> Secure sign in</span><span><Check size={15} /> Private workspace</span><span><Check size={15} /> Keys stay server side</span>
          </div>
        </div>
        <HeroMock />
      </section>

      <div className="trust"><span className="trust-label">WORKS WITH</span>{trust.map(renderTrust)}</div>

      <section className="band" id="workflow">
        <div className="band-head"><span className="eyebrow">WORKFLOW</span><h2>Repo to answers in three steps.</h2></div>
        <div className="steps">{steps.map(renderStep)}</div>
      </section>

      <section className="band" id="features">
        <div className="band-head"><span className="eyebrow">FEATURES</span><h2>Evidence over guesses.</h2></div>
        <div className="bento">
          <article className="tile tile-wide">
            <div className="tile-text"><h3>Line level answers</h3><p>Every claim links to code.</p></div>
            <div className="tile-art tile-code">
              <div><i>17</i><span>raise Unauthorized()</span></div>
              <div className="hot"><i>18</i><span>token = header.removeprefix("Bearer ")</span></div>
              <div className="hot"><i>19</i><span>claims = verify_token(token)</span></div>
              <div><i>20</i><span>return claims.user_id</span></div>
            </div>
          </article>
          <article className="tile">
            <div className="tile-text"><h3>Revision aware</h3><p>Chat with any commit.</p></div>
            <div className="tile-art tile-rev">
              <div className="on"><GitCommitHorizontal size={14} /> r3 <em>active</em></div>
              <div><GitCommitHorizontal size={14} /> r2 <em>+12 ~4</em></div>
              <div><GitCommitHorizontal size={14} /> r1 <em>first index</em></div>
            </div>
          </article>
          <article className="tile">
            <div className="tile-text"><h3>Hybrid search</h3><p>Semantic plus keyword.</p></div>
            <div className="tile-art tile-bars"><span style={{ width: '58%' }}>Semantic</span><span style={{ width: '46%' }}>Keyword</span><span className="fused" style={{ width: '86%' }}>Fused</span></div>
          </article>
          <article className="tile">
            <div className="tile-text"><h3>Documents</h3><p>Specs and logs in context.</p></div>
            <div className="tile-art tile-files"><span><FileText size={13} /> spec.pdf</span><span><FileText size={13} /> notes.md</span><span><FileText size={13} /> error.log</span></div>
          </article>
          <article className="tile">
            <div className="tile-text"><h3>Debug mode</h3><p>Paste a trace. Get the files.</p></div>
            <div className="tile-art tile-trace">
              <div>Unauthorized: missing token</div>
              <div className="dim">at require_session</div>
              <div className="go">auth/middleware.py:18</div>
            </div>
          </article>
        </div>
      </section>

      <section className="band band-connect" id="connect">
        <div className="band-head"><span className="eyebrow">START</span><h2>Bring your code.</h2></div>
        <ConnectPanel />
      </section>

      <section className="final-cta">
        <h2>Ship with your whole codebase in context.</h2>
        <Link className="btn btn-primary btn-lg" to="/signup">Get started</Link>
      </section>

      <Footer />
    </main>
  )
}
