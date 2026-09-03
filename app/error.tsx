'use client'

import * as React from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [retrying, setRetrying] = React.useState(false)

  const onRetry = () => {
    setRetrying(true)
    reset()
  }

  React.useEffect(() => {
    // No structured logger is wired up; surface the failure consistently so a
    // future logging hook can replace this line without changing the UI.
    console.error(error)
  }, [error])

  return (
    <div className="auth-wrap">
      <div className="auth-card" role="alert">
        <div className="auth-header">
          <h1 className="page-title page-title--sm">Ocurrió un error inesperado</h1>
          <p className="auth-intro">
            Algo salió mal al mostrar esta sección. Podés reintentar o volver a
            un lugar seguro.
          </p>
        </div>
        <div className="auth-form">
          <button className="ui-button ui-button--default" type="button" onClick={onRetry}>
            {retrying ? 'Reintentando…' : 'Reintentar'}
          </button>
          <Link className="ui-button ui-button--secondary" href="/">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}