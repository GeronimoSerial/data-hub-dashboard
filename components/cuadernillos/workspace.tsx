'use client'

import { useEffect, useState } from 'react'
import type { BookletAssignmentView, BookletAssignmentsPage, BookletCapability } from '@/lib/cuadernillos/types'
import { CabeceraView } from './cabecera-view'
import { PlanningView } from './planning-view'
import { OverviewPanel } from './overview-panel'
import { RequestList } from './request-list'
import { SupervisorView } from './supervisor-view'

const CAPABILITY_LABELS: Record<BookletCapability, string> = {
  planning: 'Planeamiento',
  cabecera: 'Cabecera',
  supervisor: 'Supervisión',
}

function readError(data: unknown) {
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') return data.error
  return 'No se pudieron cargar las asignaciones.'
}

async function readAssignments(url: string, signal?: AbortSignal): Promise<BookletAssignmentsPage> {
  const response = await fetch(url, { signal })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(readError(data))
  if (!data || typeof data !== 'object' || !Array.isArray(data.items)
    || !data.items.every(isBookletAssignmentView)
    || !(data.nextCursor === null || typeof data.nextCursor === 'string' && /^\d{9}$/.test(data.nextCursor))) {
    throw new Error('La respuesta de asignaciones no tiene un formato válido.')
  }
  return data as BookletAssignmentsPage
}

function isBookletAssignmentView(value: unknown): value is BookletAssignmentView {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.cueAnexo === 'string' && /^\d{9}$/.test(row.cueAnexo)
    && typeof row.schoolName === 'string'
    && (row.relationship === 'cabecera' || row.relationship === 'dependiente')
    && (typeof row.cabeceraCueAnexo === 'string' && /^\d{9}$/.test(row.cabeceraCueAnexo) || row.cabeceraCueAnexo === null)
    && (typeof row.supervisorName === 'string' || row.supervisorName === null)
}

export function CuadernillosWorkspace({ capabilities }: { capabilities: BookletCapability[] }) {
  const [activeCapability, setActiveCapability] = useState<BookletCapability | null>(capabilities[0] ?? null)
  const [pageState, setPageState] = useState<{ capability: BookletCapability; page: BookletAssignmentsPage } | null>(null)
  const [loading, setLoading] = useState(capabilities.length > 0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestRefreshKey, setRequestRefreshKey] = useState(0)
  const page = pageState?.capability === activeCapability ? pageState.page : null

  useEffect(() => {
    if (!activeCapability || !capabilities.includes(activeCapability)) {
      return
    }

    const controller = new AbortController()
    readAssignments(`/api/cuadernillos/assignments?capability=${activeCapability}`, controller.signal).then(
      (nextPage) => setPageState({ capability: activeCapability, page: nextPage }),
      (reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las asignaciones.')
      },
    ).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })

    return () => controller.abort()
  }, [activeCapability, capabilities])

  function selectCapability(capability: BookletCapability) {
    setActiveCapability(capability)
    setError(null)
    setLoading(true)
  }

  async function loadMore() {
    if (!activeCapability || !page?.nextCursor || loading || loadingMore) return
    setLoadingMore(true)
    setError(null)
    const query = new URLSearchParams({ capability: activeCapability, cursor: page.nextCursor })
    try {
      const nextPage = await readAssignments(`/api/cuadernillos/assignments?${query.toString()}`)
      setPageState((current) => current?.capability === activeCapability
        ? { capability: activeCapability, page: { items: [...current.page.items, ...nextPage.items], nextCursor: nextPage.nextCursor } }
        : current)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar más asignaciones.')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div style={{ maxWidth: '72rem', margin: '0 auto', padding: 'clamp(1.25rem, 4vw, 3rem)', color: 'var(--ink)' }}>
      <header style={{ borderBottom: '1px solid var(--line)', paddingBottom: '1.25rem', marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 .45rem', color: 'var(--accent)', fontSize: '.75rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>
          Gestión escolar · Distribución
        </p>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 700, lineHeight: 1.03, letterSpacing: '-.02em' }}>
          Cuadernillos
        </h1>
        <p style={{ maxWidth: '44rem', margin: '.75rem 0 0', color: 'var(--ink-soft)', lineHeight: 1.55 }}>
          Asignaciones y solicitudes con trazabilidad por escuela. La disponibilidad y las decisiones solo se muestran cuando su fuente está habilitada.
        </p>
      </header>

      {capabilities.length === 0 ? (
        <p role="status" style={{ borderLeft: '4px solid var(--marker)', background: 'var(--fill)', padding: '1rem 1.25rem', color: 'var(--ink-soft)' }}>
          Esta cuenta todavía no tiene una responsabilidad de cuadernillos habilitada.
        </p>
      ) : (
        <>
          {capabilities.length > 1 ? (
            <nav aria-label="Seleccionar responsabilidad" style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginBottom: '2rem' }}>
              {capabilities.map((capability) => (
                <button
                  key={capability}
                  type="button"
                  aria-pressed={activeCapability === capability}
                  onClick={() => selectCapability(capability)}
                  className={activeCapability === capability ? 'ui-button ui-button--primary' : 'ui-button ui-button--secondary'}
                >
                  {CAPABILITY_LABELS[capability]}
                </button>
              ))}
            </nav>
          ) : null}

          {activeCapability === 'planning' ? <PlanningView page={page} loading={loading} error={error} onLoadMore={loadMore} loadingMore={loadingMore} /> : null}
          {activeCapability === 'cabecera' ? <CabeceraView page={page} loading={loading} error={error} onLoadMore={loadMore} loadingMore={loadingMore} /> : null}
          {activeCapability === 'supervisor' ? <SupervisorView page={page} loading={loading} error={error} onLoadMore={loadMore} loadingMore={loadingMore} /> : null}
          {activeCapability ? <OverviewPanel key={activeCapability} capability={activeCapability} assignments={page} onRequestCreated={() => setRequestRefreshKey((key) => key + 1)} /> : null}
          <RequestList refreshKey={requestRefreshKey} capability={activeCapability ?? undefined} />
        </>
      )}
    </div>
  )
}
