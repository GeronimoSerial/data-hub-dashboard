'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type {
  RemitoControlItem, RemitoControlLine, RemitoControlObservation, RemitoControlPage, RemitoControlRemito,
} from '@/lib/cuadernillos/remito-control'
import { dashedCue } from '../cabecera/cabecera-api'
import { Chip, EmptyState, KpiStrip, Modal, ModalBody, ModalFoot, Note, PageHeader, Panel, Segmented, formatCount } from '../kit'

const LOAD_ERROR = 'No se pudo cargar el control de remitos.'
const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
const when = (iso: string) => dateTime.format(new Date(iso))

const OBSERVATION_ERRORS: Record<string, string> = {
  forbidden: 'Esta cuenta no puede agregar observaciones a este remito.',
  remito_not_found: 'El remito ya no está disponible.',
  line_not_found: 'La línea elegida ya no pertenece al remito.',
}

type Filter = 'all' | 'shortfall'

function isControlPage(value: unknown): value is RemitoControlPage {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return Array.isArray(row.remitos) && typeof row.hasMore === 'boolean'
    && Boolean(row.summary) && typeof row.summary === 'object'
}

async function readJson(response: Response) {
  return response.json().catch(() => null)
}

export function ControlView() {
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState<RemitoControlPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const fetchPage = useCallback(async (only: boolean, cursor: string | null, signal?: AbortSignal) => {
    const query = new URLSearchParams()
    if (only) query.set('onlyWithShortfall', 'true')
    if (cursor) query.set('cursor', cursor)
    const response = await fetch(`/api/cuadernillos/control${query.size ? `?${query}` : ''}`, { cache: 'no-store', signal })
    const data = await readJson(response)
    if (!response.ok || !isControlPage(data)) throw new Error(LOAD_ERROR)
    return data
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchPage(filter === 'shortfall', null, controller.signal)
      .then((next) => { setPage(next); setError(null) })
      .catch(() => { if (!controller.signal.aborted) { setPage(null); setError(LOAD_ERROR) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [fetchPage, filter])

  async function loadMore() {
    if (!page?.nextCursor) return
    setLoadingMore(true)
    try {
      const next = await fetchPage(filter === 'shortfall', page.nextCursor)
      setPage({ ...next, remitos: [...page.remitos, ...next.remitos] })
    } catch { setError(LOAD_ERROR) }
    finally { setLoadingMore(false) }
  }

  function observationAdded(remitoId: string, observation: RemitoControlObservation) {
    setPage((current) => current && ({
      ...current,
      remitos: current.remitos.map((remito) => remito.remitoId === remitoId
        ? { ...remito, observations: [...remito.observations, observation] }
        : remito),
    }))
  }

  const summary = page?.summary
  const open = page?.remitos.find((remito) => remito.remitoId === openId) ?? null

  return (
    <section aria-labelledby="control-title" className="k-stack">
      <PageHeader id="control-title" title="Control de remitos" description="Seguimiento posterior de lo despachado y recibido en cada tramo. No hay aprobaciones: solo observaciones." />

      {error ? <Note tone="danger">{error}</Note> : null}
      {loading && !page ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando remitos…</p> : null}

      {summary ? (
        <KpiStrip label="Resumen de control" items={[
          { label: 'Remitos pendientes de recepción en cabecera', value: summary.remitosPendingCabeceraReceipt, tone: summary.remitosPendingCabeceraReceipt > 0 ? 'warn' : undefined },
          { label: 'Líneas pendientes en escuela', value: summary.linesPendingSchoolReceipt, tone: summary.linesPendingSchoolReceipt > 0 ? 'warn' : undefined },
          { label: 'Faltantes Planeamiento → Cabecera', value: formatCount(summary.planningToCabeceraShortfallUnits), tone: summary.planningToCabeceraShortfallUnits > 0 ? 'warn' : undefined },
          { label: 'Faltantes Cabecera → Escuela', value: formatCount(summary.cabeceraToSchoolShortfallUnits), tone: summary.cabeceraToSchoolShortfallUnits > 0 ? 'warn' : undefined },
        ]} />
      ) : null}

      <Segmented<Filter>
        label="Filtro de remitos"
        value={filter}
        options={[{ value: 'all', label: 'Todos' }, { value: 'shortfall', label: 'Solo con faltantes' }]}
        onChange={(next) => { setLoading(true); setFilter(next) }}
      />

      {page ? (
        <Panel title="Remitos" aside={`${page.remitos.length}${page.hasMore ? '+' : ''}`}>
          {page.remitos.length === 0 ? (
            <EmptyState
              title={filter === 'shortfall' ? 'No hay remitos con faltantes' : 'Todavía no hay remitos para controlar'}
              description={filter === 'shortfall' ? 'Cuando un tramo reciba menos de lo enviado, aparece acá.' : 'Los remitos de tus cabeceras aparecen cuando Planeamiento los despacha.'}
            />
          ) : (
            <ul className="k-list">
              {page.remitos.map((remito) => (
                <li key={remito.remitoId}>
                  <button type="button" className="k-row" aria-label={`Remito a ${remito.cabeceraName}, ${when(remito.dispatchedAt)}`} onClick={() => setOpenId(remito.remitoId)}>
                    <span className="k-row-main">
                      <span className="k-row-title">{remito.cabeceraName}</span>
                      <span className="k-row-meta">{when(remito.dispatchedAt)} · {remito.lines.length} escuela{remito.lines.length === 1 ? '' : 's'}</span>
                      <span style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                        {remito.cabeceraReceivedAt ? <Chip tone="ok">Recibido por cabecera</Chip> : <Chip tone="warn">Pendiente en cabecera</Chip>}
                        {remito.hasShortfall ? <Chip tone="danger">Con faltantes</Chip> : null}
                        {remito.observations.length > 0 ? <Chip tone="info">{remito.observations.length} observación{remito.observations.length === 1 ? '' : 'es'}</Chip> : null}
                      </span>
                    </span>
                    <span className="k-row-side"><ChevronRight aria-hidden size={20} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {page.hasMore ? (
            <Button type="button" variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Cargando…' : 'Ver más remitos'}</Button>
          ) : null}
        </Panel>
      ) : null}

      <Modal open={open !== null} title={open ? `Remito a ${open.cabeceraName}` : 'Remito'} description={open ? `CUE ${dashedCue(open.cabeceraCueAnexo)}` : undefined} onClose={() => setOpenId(null)}>
        {open ? <RemitoDetail key={open.remitoId} remito={open} onObservation={(observation) => observationAdded(open.remitoId, observation)} /> : null}
      </Modal>
    </section>
  )
}

function itemShortfalls(item: RemitoControlItem) {
  return (
    <span style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
      {item.planningToCabeceraShortfall ? <Chip tone="danger">Planeamiento → Cabecera: faltan {formatCount(item.planningToCabeceraShortfall)}</Chip> : null}
      {item.cabeceraToSchoolShortfall ? <Chip tone="danger">Cabecera → Escuela: faltan {formatCount(item.cabeceraToSchoolShortfall)}</Chip> : null}
    </span>
  )
}

const count = (value: number | null) => value === null ? 'pendiente' : formatCount(value)

function LineChain({ remito, line }: { remito: RemitoControlRemito; line: RemitoControlLine }) {
  return (
    <section aria-label={line.recipientName ?? line.recipientCueAnexo} style={{ display: 'grid', gap: '.4rem' }}>
      <span className="k-row-title">{line.recipientName ?? 'Escuela'} <span className="k-row-meta">CUE {dashedCue(line.recipientCueAnexo)}</span></span>
      <span className="k-row-meta">
        {line.schoolReceivedAt
          ? `Escuela: Firmó ${line.schoolReceivedByName ?? 'una cuenta de la escuela'} el ${when(line.schoolReceivedAt)}`
          : remito.cabeceraReceivedAt ? 'Escuela: pendiente de firma' : 'Escuela: espera la recepción de la cabecera'}
      </span>
      <ul className="k-qty-list">
        {line.items.map((item) => (
          <li key={item.productId} className="k-qty-row">
            <span className="k-row-main">
              <span className="k-row-title">{item.productLabel}</span>
              <span className="k-row-meta">Despachado {formatCount(item.dispatched)} · Cabecera {count(item.cabeceraReceived)} · Escuela {count(item.schoolReceived)}</span>
            </span>
            {itemShortfalls(item)}
          </li>
        ))}
      </ul>
      {line.cabeceraShortfallReason ? <Note>Motivo del faltante en cabecera: {line.cabeceraShortfallReason}</Note> : null}
      {line.schoolShortfallReason ? <Note>Motivo del faltante en escuela: {line.schoolShortfallReason}</Note> : null}
    </section>
  )
}

function RemitoDetail({ remito, onObservation }: { remito: RemitoControlRemito; onObservation: (observation: RemitoControlObservation) => void }) {
  const [body, setBody] = useState('')
  const [lineId, setLineId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lineName = (id: string | null) => id ? remito.lines.find((line) => line.lineId === id)?.recipientName ?? 'una escuela' : null

  async function submit() {
    const text = body.trim()
    if (!text) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/cuadernillos/remitos/${encodeURIComponent(remito.remitoId)}/observaciones`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lineId ? { lineId, body: text } : { body: text }),
      })
      const data = await readJson(response) as { observation?: RemitoControlObservation; error?: string } | null
      if (!response.ok || !data?.observation) {
        setError(OBSERVATION_ERRORS[data?.error ?? ''] ?? 'No se pudo guardar la observación.')
        return
      }
      onObservation(data.observation)
      setBody('')
      setLineId('')
    } catch {
      setError('No se pudo guardar la observación.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ModalBody>
        <ol aria-label="Cadena del remito" className="k-list">
          <li className="k-row"><span className="k-row-main">
            <span className="k-row-title">Planeamiento</span>
            <span className="k-row-meta">Despachó {remito.dispatchedByName} el {when(remito.dispatchedAt)}</span>
          </span></li>
          <li className="k-row"><span className="k-row-main">
            <span className="k-row-title">Cabecera</span>
            <span className="k-row-meta">
              {remito.cabeceraReceivedAt
                ? `Firmó ${remito.cabeceraReceivedByName ?? 'la cabecera'} el ${when(remito.cabeceraReceivedAt)}`
                : 'Pendiente de recepción'}
            </span>
          </span></li>
        </ol>
        {remito.lines.map((line) => <LineChain key={line.lineId} remito={remito} line={line} />)}

        <div className="k-field">
          <span className="k-label">Observaciones</span>
          {remito.observations.length === 0 ? <span className="k-hint">Todavía no hay observaciones.</span> : (
            <ul className="k-list" aria-label="Observaciones del remito">
              {remito.observations.map((observation) => (
                <li key={observation.id} className="k-row">
                  <span className="k-row-main">
                    <span>{observation.body}</span>
                    <span className="k-row-meta">
                      {observation.authorName} · {when(observation.createdAt)}{lineName(observation.lineId) ? ` · ${lineName(observation.lineId)}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="k-field">
          <label htmlFor="obs-body">Agregar observación</label>
          <Textarea id="obs-body" value={body} maxLength={2000} rows={3} onChange={(event) => setBody(event.target.value)} />
          {remito.lines.length > 1 ? (
            <Segmented
              label="Referida a"
              value={lineId}
              options={[{ value: '', label: 'Todo el remito' }, ...remito.lines.map((line) => ({ value: line.lineId, label: line.recipientName ?? dashedCue(line.recipientCueAnexo) }))]}
              onChange={setLineId}
            />
          ) : null}
        </div>
        {error ? <Note tone="danger">{error}</Note> : null}
      </ModalBody>
      <ModalFoot>
        <Button type="button" disabled={saving || !body.trim()} onClick={() => void submit()}>{saving ? 'Guardando…' : 'Guardar observación'}</Button>
      </ModalFoot>
    </>
  )
}
