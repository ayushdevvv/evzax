import { Github, Twitter } from 'lucide-react'
import { Link } from 'react-router-dom'
import Brand from './Brand'

const GITHUB_URL = 'https://github.com/ayushdevvv'
const TWITTER_URL = 'https://x.com/ayushxdevz'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <Brand />
          <p>The evzax coding workspace.</p>
        </div>
        <div className="site-footer-col">
          <span className="eyebrow">PRODUCT</span>
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
        </div>
        <div className="site-footer-col">
          <span className="eyebrow">WORKSPACE</span>
          <Link to="/login">Log in</Link>
          <Link to="/signup">Get started</Link>
        </div>
        <div className="site-footer-col">
          <span className="eyebrow">FOLLOW</span>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={15} /> GitHub</a>
          <a href={TWITTER_URL} target="_blank" rel="noreferrer"><Twitter size={15} /> Twitter</a>
        </div>
      </div>
      <div className="site-footer-base"><span>© {year} Evzax. All rights reserved.</span></div>
    </footer>
  )
}
