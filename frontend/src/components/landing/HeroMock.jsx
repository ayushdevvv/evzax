import { ChevronRight, FileCode2, Folder, Sparkles } from 'lucide-react'

const codeLines = [
  'def require_session(request):',
  '    header = request.headers.get("Authorization")',
  '    if not header:',
  '        raise Unauthorized()',
  '    token = header.removeprefix("Bearer ")',
  '    claims = verify_token(token, SECRET)',
  '    if claims.expired:',
  '        raise SessionExpired()',
  '    return claims.user_id',
]

const tree = [
  { name: 'src', folder: true },
  { name: 'auth', folder: true, depth: 1 },
  { name: 'middleware.py', depth: 2, active: true },
  { name: 'tokens.py', depth: 2 },
  { name: 'routes.py', depth: 1 },
  { name: 'models.py', depth: 1 },
  { name: 'tests', folder: true },
]

const tokenRe = /("[^"]*")|\b(def|if|not|raise|return)\b|\b([A-Za-z_]+)(?=\()/g

function highlight(line) {
  const parts = []
  let last = 0
  let match
  tokenRe.lastIndex = 0
  while ((match = tokenRe.exec(line)) !== null) {
    if (match.index > last) parts.push(line.slice(last, match.index))
    const cls = match[1] ? 'tok-str' : match[2] ? 'tok-kw' : 'tok-fn'
    parts.push(<span key={match.index} className={cls}>{match[0]}</span>)
    last = match.index + match[0].length
  }
  if (last < line.length) parts.push(line.slice(last))
  return parts
}

function renderTree(item) {
  const Icon = item.folder ? Folder : FileCode2
  return (
    <div key={item.name + (item.depth || 0)} className={'mock-tree-row' + (item.active ? ' active' : '')} style={{ paddingLeft: 10 + (item.depth || 0) * 14 }}>
      {item.folder ? <ChevronRight size={12} /> : <span className="mock-gap" />}
      <Icon size={13} />
      <span>{item.name}</span>
    </div>
  )
}

function renderLine(line, index) {
  const number = 14 + index
  const hot = number >= 18 && number <= 20
  return (
    <div key={number} className={'mock-code-line' + (hot ? ' hot' : '')}>
      <i>{number}</i>
      <span>{highlight(line)}</span>
    </div>
  )
}

export default function HeroMock() {
  return (
    <div className="mock" aria-hidden="true">
      <div className="mock-bar">
        <div className="mock-dots"><i /><i /><i /></div>
        <span className="mock-title">evzax / payments-api</span>
        <span className="mock-rev">main · a1f9c3e</span>
      </div>
      <div className="mock-body">
        <div className="mock-tree">
          <span className="mock-tree-label">FILES</span>
          {tree.map(renderTree)}
        </div>
        <div className="mock-chat">
          <div className="mock-user"><span>&gt;</span> Where is the session token validated?</div>
          <div className="mock-steps">
            <div><b>✓</b> Searched code <em>6 passages</em></div>
            <div><b>✓</b> Read middleware.py <em>L14 to L22</em></div>
          </div>
          <div className="mock-answer">
            <div className="mock-answer-head"><Sparkles size={13} /> Evzax</div>
            <p>Tokens are checked in <code>require_session</code>. It strips the Bearer prefix, then verifies claims.</p>
            <div className="mock-chips"><span>middleware.py:18 to 20</span><span>tokens.py:41</span></div>
          </div>
          <div className="mock-input"><span>Ask your code</span><i>↵</i></div>
        </div>
        <div className="mock-code">
          <div className="mock-code-head"><FileCode2 size={13} /> auth/middleware.py</div>
          {codeLines.map(renderLine)}
        </div>
      </div>
    </div>
  )
}
