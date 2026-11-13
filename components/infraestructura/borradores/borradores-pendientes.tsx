'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatearMomentoHistorial } from '@/components/infraestructura/historial-formato'
import { fetchDraftPage, type DraftCursor, type DraftMapItem } from '@/lib/infraestructura/borradores/mapa-client'
import { fetchReportesOfflineFeatures } from '@/lib/infraestructura/parte/feature-flags-client'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'

type State = 'loading' | 'ready' | 'error'

function etiqueta(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('es-AR'))
}

function Respuestas({ value }: { value: unknown }) {
  const t = useTextos().parteVerificaciones.borradores
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return <span>{typeof value === 'string' ? value : String(value ?? t.sinRespuesta)}</span>
  }
  if (Array.isArray(value)) {
    return value.length ? <ul>{value.map((item, index) => <li key={index}><Respuestas value={item} /></li>)}</ul> : <span>{t.sinRespuestas}</span>
  }
  const entries = Object.entries(value as Record<string, unknown>)
  return entries.length ? (
    <dl className="map-ficha-escuela__kv">
      {entries.map(([key, answer]) => <div key={key}><dt>{etiqueta(key)}</dt><dd><Respuestas value={answer} /></dd></div>)}
    </dl>
  ) : <span>{t.sinRespuestas}</span>
}

function FilaBorrador({ draft }: { draft: DraftMapItem }) {
  const t = useTextos().parteVerificaciones.borradores
  const idioma = useIdioma()
  const completados = draft.progreso.pasosCompletados
  return (
    <article className="map-ficha-escuela__borrador">
      <h3>{draft.flujo === 'actualizacion' ? t.actualizacion : t.inicial}</h3>
      <dl className="map-ficha-escuela__kv">
        <dt>{t.progreso}</dt>
        <dd>{t.progresoResumen(completados.length, etiqueta(draft.progreso.pasoActual))}</dd>
        {completados.length > 0 && <><dt>{t.completados}</dt><dd>{completados.map(etiqueta).join(', ')}</dd></>}
        <dt>{t.ultimaActividad}</dt><dd>{formatearMomentoHistorial(draft.actividadEn, undefined, idioma)}</dd>
      </dl>
      <details className="map-ficha-escuela__borrador-respuestas">
        <summary>{t.respuestasPermitidas}<ChevronDown aria-hidden="true" /></summary>
        <Respuestas value={draft.respuestas} />
      </details>
    </article>
  )
}

export function BorradoresPendientes({ cue, count }: { cue: string; count: number | null }) {
  const t = useTextos().parteVerificaciones.borradores
  const [items, setItems] = useState<DraftMapItem[]>([])
  const [cursor, setCursor] = useState<DraftCursor | null>(null)
  const [state, setState] = useState<State>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageError, setPageError] = useState(false)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let active = true
    void fetchReportesOfflineFeatures().then((flags) => {
      if (!active || !flags.mapaBorradores) {
        if (active) setState('ready')
        return
      }
      setEnabled(true)
      fetchDraftPage(cue).then((page) => {
        if (!active) return
        setItems(page.items)
        setCursor(page.nextCursor)
        setState('ready')
      }).catch(() => {
        if (active) setState('error')
      })
    })
    return () => { active = false }
  }, [cue])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setPageError(false)
    try {
      if (!await fetchReportesOfflineFeatures().then((flags) => flags.mapaBorradores)) return
      const page = await fetchDraftPage(cue, cursor)
      setItems((current) => [...current, ...page.items])
      setCursor(page.nextCursor)
    } catch {
      setPageError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  if (!enabled) return null

  return (
    <section className="map-ficha-escuela__borradores" aria-label={t.titulo} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 'var(--s-3)', background: 'var(--fill)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2)' }}>
        <h3>{t.titulo}</h3>
        {count !== null ? <strong aria-label={t.ariaCantidad(count)}>{count}</strong> : null}
      </header>
      <p style={{ color: 'var(--ink-faint)' }}>{t.aviso}</p>
      {state === 'loading' ? <p role="status">{t.cargando}</p> : null}
      {state === 'error' ? <p role="alert">{t.error}</p> : null}
      {state === 'ready' && items.length === 0 ? <p>{t.sinBorradores}</p> : null}
      {items.map((draft) => <FilaBorrador key={draft.draftId} draft={draft} />)}
      {pageError ? <p role="alert">{t.paginaSiguienteError}</p> : null}
      {cursor && <button type="button" className="map-ficha-escuela__link" onClick={() => void loadMore()} disabled={loadingMore}>
        {loadingMore ? t.cargandoMas : t.cargarMas}
      </button>}
    </section>
  )
}
