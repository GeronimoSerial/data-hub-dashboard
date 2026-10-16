'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatearMomentoHistorial } from '@/components/infraestructura/historial-formato'
import { fetchDraftPage, type DraftCursor, type DraftMapItem } from '@/lib/infraestructura/borradores/mapa-client'

type State = 'loading' | 'ready' | 'error'

function etiqueta(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('es-AR'))
}

function Respuestas({ value }: { value: unknown }) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return <span>{typeof value === 'string' ? value : String(value ?? 'Sin respuesta')}</span>
  }
  if (Array.isArray(value)) {
    return value.length ? <ul>{value.map((item, index) => <li key={index}><Respuestas value={item} /></li>)}</ul> : <span>Sin respuestas</span>
  }
  const entries = Object.entries(value as Record<string, unknown>)
  return entries.length ? (
    <dl className="map-ficha-escuela__kv">
      {entries.map(([key, answer]) => <div key={key}><dt>{etiqueta(key)}</dt><dd><Respuestas value={answer} /></dd></div>)}
    </dl>
  ) : <span>Sin respuestas</span>
}

function FilaBorrador({ draft }: { draft: DraftMapItem }) {
  const completados = draft.progreso.pasosCompletados
  return (
    <article className="map-ficha-escuela__borrador">
      <h3>{draft.flujo === 'actualizacion' ? 'Actualización pendiente' : 'Reporte inicial pendiente'}</h3>
      <dl className="map-ficha-escuela__kv">
        <dt>Progreso</dt>
        <dd>{completados.length} {completados.length === 1 ? 'paso completado' : 'pasos completados'} · En {etiqueta(draft.progreso.pasoActual)}</dd>
        {completados.length > 0 && <><dt>Completados</dt><dd>{completados.map(etiqueta).join(', ')}</dd></>}
        <dt>Última actividad</dt><dd>{formatearMomentoHistorial(draft.actividadEn)}</dd>
      </dl>
      <details className="map-ficha-escuela__borrador-respuestas">
        <summary>Respuestas permitidas<ChevronDown aria-hidden="true" /></summary>
        <Respuestas value={draft.respuestas} />
      </details>
    </article>
  )
}

export function BorradoresPendientes({ cue, count }: { cue: string; count: number | null }) {
  const [items, setItems] = useState<DraftMapItem[]>([])
  const [cursor, setCursor] = useState<DraftCursor | null>(null)
  const [state, setState] = useState<State>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageError, setPageError] = useState(false)

  useEffect(() => {
    let active = true
    fetchDraftPage(cue).then((page) => {
      if (!active) return
      setItems(page.items)
      setCursor(page.nextCursor)
      setState('ready')
    }).catch(() => {
      if (active) setState('error')
    })
    return () => { active = false }
  }, [cue])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setPageError(false)
    try {
      const page = await fetchDraftPage(cue, cursor)
      setItems((current) => [...current, ...page.items])
      setCursor(page.nextCursor)
    } catch {
      setPageError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section className="map-ficha-escuela__borradores" aria-label="Borradores sin enviar" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 'var(--s-3)', background: 'var(--fill)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2)' }}>
        <h3>Borradores sin enviar</h3>
        {count !== null ? <strong aria-label={`${count} borradores sin enviar`}>{count}</strong> : null}
      </header>
      <p style={{ color: 'var(--ink-faint)' }}>Avances guardados en el servidor. No forman parte de las situaciones confirmadas.</p>
      {state === 'loading' ? <p role="status">Cargando borradores…</p> : null}
      {state === 'error' ? <p role="alert">No se pudieron cargar los borradores.</p> : null}
      {state === 'ready' && items.length === 0 ? <p>No hay borradores pendientes para esta escuela.</p> : null}
      {items.map((draft) => <FilaBorrador key={draft.draftId} draft={draft} />)}
      {pageError ? <p role="alert">No se pudo cargar la página siguiente.</p> : null}
      {cursor && <button type="button" className="map-ficha-escuela__link" onClick={() => void loadMore()} disabled={loadingMore}>
        {loadingMore ? 'Cargando…' : 'Cargar más borradores'}
      </button>}
    </section>
  )
}
