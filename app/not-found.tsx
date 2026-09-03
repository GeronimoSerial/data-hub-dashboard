import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="page-title page-title--sm">No se encontró la página</h1>
          <p className="auth-intro">
            El vínculo es inválido o su contenido se movió. Podés seguir desde
            el catálogo o volver al inicio.
          </p>
        </div>
        <div className="auth-form">
          <Link className="ui-button ui-button--default" href="/explorar">
            Ir a Explorar
          </Link>
          <Link className="ui-button ui-button--secondary" href="/">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}