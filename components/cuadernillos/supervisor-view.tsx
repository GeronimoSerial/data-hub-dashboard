import type { BookletAssignmentsPage } from '@/lib/cuadernillos/types'
import { AssignmentList } from './assignment-list'

export function SupervisorView({
  page,
  loading,
  error,
  onLoadMore,
  loadingMore,
}: {
  page: BookletAssignmentsPage | null
  loading: boolean
  error: string | null
  onLoadMore: () => void
  loadingMore: boolean
}) {
  return (
    <section aria-labelledby="cuadernillos-view-title">
      <header style={{ marginBottom: '1.5rem' }}>
        <p style={{ margin: '0 0 .35rem', color: 'var(--accent)', fontSize: '.75rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          Responsabilidad de módulo
        </p>
        <h2 id="cuadernillos-view-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', lineHeight: 1.1 }}>
          Supervisión
        </h2>
        <p style={{ maxWidth: '48rem', margin: '.75rem 0 0', color: 'var(--ink-soft)', lineHeight: 1.55 }}>
          Asignaciones escolares de esta cuenta. La autorización se verifica por cuenta vinculada, no por el nombre que figura en la fuente.
        </p>
      </header>

      <div style={{ borderLeft: '4px solid var(--marker)', background: 'var(--fill)', padding: '1rem 1.25rem', marginBottom: '1.75rem' }}>
        <strong style={{ color: 'var(--ink)' }}>Decisiones sobre solicitudes todavía no disponibles</strong>
        <p style={{ margin: '.35rem 0 0', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          La lista de solicitudes está disponible más abajo; no se habilitan decisiones individuales hasta que estén listas la autorización transaccional y la prueba de concurrencia PostgreSQL.
        </p>
      </div>

      <section aria-labelledby="assignment-list-title">
        <h3 id="assignment-list-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
          Escuelas bajo supervisión
        </h3>
        {loading && !page ? <p role="status" style={{ color: 'var(--ink-soft)' }}>Cargando asignaciones…</p> : null}
        {error ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{error}</p> : null}
        {page ? <AssignmentList items={page.items} /> : null}
        {page?.nextCursor ? (
          <button type="button" onClick={onLoadMore} disabled={loadingMore} className="ui-button ui-button--secondary" style={{ marginTop: '1rem' }}>
            {loadingMore ? 'Cargando…' : 'Ver más escuelas'}
          </button>
        ) : null}
      </section>
    </section>
  )
}
