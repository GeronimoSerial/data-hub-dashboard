import type { BookletAssignmentsPage } from '@/lib/cuadernillos/types'
import { AssignmentImport } from './assignment-import'
import { AssignmentList } from './assignment-list'
import { MembershipAdmin } from './membership-admin'

export function PlanningView({
  page,
  loading,
  error,
  onLoadMore,
  loadingMore,
  isAdmin = false,
}: {
  page: BookletAssignmentsPage | null
  loading: boolean
  error: string | null
  onLoadMore: () => void
  loadingMore: boolean
  isAdmin?: boolean
}) {
  return (
    <section aria-labelledby="cuadernillos-view-title">
      <header style={{ marginBottom: '1.5rem' }}>
        <p style={{ margin: '0 0 .35rem', color: 'var(--accent)', fontSize: '.75rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          Responsabilidad de módulo
        </p>
        <h2 id="cuadernillos-view-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', lineHeight: 1.1 }}>
          Planeamiento
        </h2>
        <p style={{ maxWidth: '48rem', margin: '.75rem 0 0', color: 'var(--ink-soft)', lineHeight: 1.55 }}>
          Consulta de asignaciones confirmadas y saldos respaldados por catálogo y campaña. Una cantidad no disponible se identifica como tal; no se estima.
        </p>
        <p role="status" style={{ maxWidth: '48rem', margin: '.75rem 0 0', borderLeft: '3px solid var(--marker)', paddingLeft: '.75rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          La confirmación de nuevas asignaciones está deshabilitada hasta contar con una fuente de origen reconciliada y autorizada. Una previsualización manual no acredita procedencia ni habilita permisos.
        </p>
      </header>

      <AssignmentSection page={page} loading={loading} error={error} onLoadMore={onLoadMore} loadingMore={loadingMore} />
      {isAdmin ? <AssignmentImport /> : null}
      {isAdmin ? <MembershipAdmin /> : null}
    </section>
  )
}

function AssignmentSection({ page, loading, error, onLoadMore, loadingMore }: {
  page: BookletAssignmentsPage | null
  loading: boolean
  error: string | null
  onLoadMore: () => void
  loadingMore: boolean
}) {
  return (
    <section aria-labelledby="assignment-list-title">
      <h3 id="assignment-list-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
        Asignaciones confirmadas
      </h3>
      {loading && !page ? <p role="status" style={{ color: 'var(--ink-soft)' }}>Cargando asignaciones…</p> : null}
      {error ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{error}</p> : null}
      {page ? <AssignmentList items={page.items} /> : null}
      {page?.nextCursor ? (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} className="ui-button ui-button--secondary" style={{ marginTop: '1rem' }}>
          {loadingMore ? 'Cargando…' : 'Ver más asignaciones'}
        </button>
      ) : null}
    </section>
  )
}
