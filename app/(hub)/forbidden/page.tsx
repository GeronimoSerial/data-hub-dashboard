import Link from 'next/link'

export default function ForbiddenPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="page-title page-title--sm">No tiene acceso a este recurso</h1>
        <p className="auth-intro">
          Solicite acceso a quien administra el Hub para poder verlo.
        </p>
        <Link className="ui-button ui-button--secondary" href="/">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}