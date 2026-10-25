import Link from 'next/link'
import { ForbiddenActions } from './forbidden-actions'

export default function ForbiddenPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="page-title page-title--sm">No tiene acceso a este recurso</h1>
        <p className="auth-intro">
          Su cuenta no tiene un destino habilitado. Solicite acceso a quien administra el Hub.
        </p>
        <div className="auth-form">
          <Link className="ui-button" href="/cuenta">Cambiar contraseña</Link>
          <ForbiddenActions />
        </div>
      </div>
    </div>
  )
}
