import { Link } from 'react-router-dom'

export function LogoMark(props) {
  const size = props.size || 32
  return (
    <span className={'logo-tile' + (props.className ? ' ' + props.className : '')} style={{ width: size, height: size }} aria-hidden="true">
      <img src="/evzax-logo.png" alt="" draggable="false" />
    </span>
  )
}

export default function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Evzax home">
      <LogoMark size={32} />
      <span className="brand-word">Evzax</span>
    </Link>
  )
}
