import { useState } from 'react'
import { ArrowRight, CheckCircle2, Globe, Instagram, Link2, Youtube } from 'lucide-react'
import LoadingState from '../components/LoadingState'

export default function UrlPage({ busy, error, usage, onConnect, onSignIn, onClearError }) {
  const [url, setUrl] = useState('')
  const canAdd = (usage?.remaining?.urls ?? 2) > 0
  async function submit(event) {
    event.preventDefault()
    if (!url.trim()) return
    const result = await onConnect(url.trim())
    if (result) setUrl('')
  }
  return <div className="page-stack url-page"><div className="page-heading"><div><span className="section-eyebrow">SOURCE CHAT</span><h1>Chat with a URL</h1><p>Bring a video or public page into your knowledge space.</p></div><span className="page-counter">{usage?.usage?.urls ?? 0} / {usage?.limits?.urls ?? 2} sources</span></div><section className="url-connect-card"><div className="url-connect-icon"><Link2 size={23} /></div><h2>Connect a source</h2><p>Paste a URL. SourceX will detect the source type and fetch its readable content.</p><form onSubmit={submit} className="url-connect-form"><label htmlFor="source-url">Source URL</label><div className="url-input-shell"><Globe size={18} /><input id="source-url" value={url} onChange={(e) => { setUrl(e.target.value); onClearError('') }} type="url" placeholder="https://youtube.com/watch?v=..." required maxLength={2000} /><button className="button-primary" type="submit" disabled={busy || !url.trim() || !canAdd}>Connect <ArrowRight size={16} /></button></div><small className="url-input-hint">YouTube captions and readable public webpages work best.</small></form>{error && <div className="inline-error">{error}</div>}{busy && <LoadingState variant="url" />}<div className="source-types"><div><span className="source-type-icon source-youtube"><Youtube size={18} /></span><span><strong>YouTube</strong><small>Transcript and timestamps</small></span></div><div><span className="source-type-icon source-web"><Globe size={18} /></span><span><strong>Web pages</strong><small>Readable public content</small></span></div><div><span className="source-type-icon source-instagram"><Instagram size={18} /></span><span><strong>Instagram</strong><small>Accessible public captions</small></span></div></div>{!canAdd && <div className="limit-note"><span>Your URL limit is reached.</span><button type="button" onClick={onSignIn}>Create account</button></div>}<div className="url-privacy-note"><CheckCircle2 size={14} /> Content is indexed in your cloud workspace</div></section></div>
}
