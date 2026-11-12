import Link from 'next/link'

export default function EscuelaFichaNotFound() {
  return (
    <main
      style={{
        maxWidth: '42rem',
        margin: '3rem auto',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        color: 'var(--ink)',
      }}
      data-testid="escuela-ficha-not-found"
    >
      <h1 style={{ margin: 0, fontSize: 'var(--t-h2)', fontWeight: 700 }}>
        Establecimiento no disponible
      </h1>
      <p style={{ margin: 0, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
        No se encontró el establecimiento solicitado o no está disponible para tu alcance.
      </p>
      <div>
        <Link
          href="/mapas/infraestructura"
          className="ui-button ui-button--secondary ui-button--sm"
          data-testid="not-found-volver-mapa"
        >
          Volver a ENOS Corrientes
        </Link>
      </div>
    </main>
  )
}
