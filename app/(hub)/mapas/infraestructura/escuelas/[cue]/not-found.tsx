import Link from 'next/link'
import { regionActiva } from '@/lib/infraestructura/region'
import { textosActuales } from '@/lib/i18n'

export default function EscuelaFichaNotFound() {
  const t = textosActuales().shellHub.escuela
  const region = regionActiva().nombre
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
        {t.titulo}
      </h1>
      <p style={{ margin: 0, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
        {t.detalle}
      </p>
      <div>
        <Link
          href="/mapas/infraestructura"
          className="ui-button ui-button--secondary ui-button--sm"
          data-testid="not-found-volver-mapa"
        >
          {t.volverMapa(region)}
        </Link>
      </div>
    </main>
  )
}
