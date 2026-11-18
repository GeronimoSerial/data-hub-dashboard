'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type {
  RemitoControlItem, RemitoControlLine, RemitoControlObservation, RemitoControlPage, RemitoControlRemito,
} from '@/lib/cuadernillos/remito-control'
import { dashedCue } from '../cabecera/cabecera-api'
import {
  Chip, CircuitGuide, EmptyState, KpiStrip, Modal, ModalBody, ModalFoot, Note, PageHeader, Panel, Segmented, ShipmentJourney, TaskCard, formatCount, shortProduct,
  type JourneyStep,
} from '../kit'

const LOAD_ERROR = 'No se pudieron cargar los envíos.'
const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
const when = (iso: string) => dateTime.format(new Date(iso))

const OBSERVATION_ERRORS: Record<string, string> = {
  forbidden: 'Esta cuenta no puede dejar observaciones en este envío.',
  remito_not_found: 'El envío ya no está disponible.',
  line_not_found: 'La escuela elegida ya no pertenece al envío.',
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
  const incomplete = page ? page.remitos.filter((remito) => remito.hasShortfall).length : 0
  const partial = Boolean(page?.hasMore) && filter === 'all'

  return (
    <section aria-labelledby="control-title" className="k-stack">
      <PageHeader id="control-title" title="Revisar envíos" description="Revisá cómo llegaron los envíos de tus escuelas y dejá observaciones si algo no está bien." />

      {error ? <Note tone="danger">{error}</Note> : null}
      {loading && !page ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando envíos…</p> : null}

      {page ? (
        incomplete > 0 ? (
          <TaskCard
            tone="warn"
            title={`${partial ? 'Al menos ' : ''}${incomplete} ${incomplete === 1 ? 'envío llegó incompleto' : 'envíos llegaron incompletos'}. Revisalos.`}
            action={filter === 'all'
              ? <Button type="button" onClick={() => { setLoading(true); setFilter('shortfall') }}>Ver los incompletos</Button>
              : <Button type="button" variant="secondary" onClick={() => { setLoading(true); setFilter('all') }}>Ver todos los envíos</Button>}
          />
        ) : (
          <TaskCard tone="ok" title="No tenés nada pendiente." />
        )
      ) : null}

      {summary ? (
        <KpiStrip label="Resumen de envíos" items={[
          { label: 'Esperando a la cabecera', value: summary.remitosPendingCabeceraReceipt },
          { label: 'Esperando a la escuela', value: summary.linesPendingSchoolReceipt },
          { label: 'Llegó de menos a la cabecera', value: formatCount(summary.planningToCabeceraShortfallUnits), tone: summary.planningToCabeceraShortfallUnits > 0 ? 'warn' : undefined },
          { label: 'Llegó de menos a la escuela', value: formatCount(summary.cabeceraToSchoolShortfallUnits), tone: summary.cabeceraToSchoolShortfallUnits > 0 ? 'warn' : undefined },
        ]} />
      ) : null}

      <Segmented<Filter>
        label="Filtro de envíos"
        value={filter}
        options={[{ value: 'all', label: 'Todos' }, { value: 'shortfall', label: 'Solo incompletos' }]}
        onChange={(next) => { setLoading(true); setFilter(next) }}
      />

      {page ? (
        <Panel title="Envíos" aside={`${page.remitos.length}${page.hasMore ? '+' : ''}`}>
          {page.remitos.length === 0 ? (
            <>
              <EmptyState
                title={filter === 'shortfall' ? 'No hay envíos incompletos' : 'Todavía no hay envíos para revisar'}
                description={filter === 'shortfall' ? 'Cuando a una escuela le llegue menos de lo enviado, aparece acá.' : 'Los envíos a tus cabeceras aparecen cuando Planeamiento los manda.'}
              />
              {filter === 'all' ? <CircuitGuide /> : null}
            </>
          ) : (
            <ul className="k-list">
              {page.remitos.map((remito) => (
                <li key={remito.remitoId}>
                  <button type="button" className="k-row" aria-label={`${remitoTitle(remito)}, ${when(remito.dispatchedAt)}`} onClick={() => setOpenId(remito.remitoId)}>
                    <span className="k-row-main" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '.75rem', rowGap: '.1rem' }}>
                      <span className="k-row-title">{remito.cabeceraCueAnexo === null ? 'Envío directo' : remito.cabeceraName}</span>
                      <span className="k-row-meta">{when(remito.dispatchedAt)} · {remito.lines.length} escuela{remito.lines.length === 1 ? '' : 's'}</span>
                      {stageChip(remito)}
                      {remito.origenCabeceraCueAnexo ? <Chip tone="info">Enviado por la cabecera</Chip> : null}
                      {remito.observations.length > 0 ? <Chip tone="info">{remito.observations.length} observación{remito.observations.length === 1 ? '' : 'es'}</Chip> : null}
                    </span>
                    <span className="k-row-side"><ChevronRight aria-hidden size={18} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {page.hasMore ? (
            <Button type="button" variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Cargando…' : 'Ver más envíos'}</Button>
          ) : null}
        </Panel>
      ) : null}

      <Modal open={open !== null} title={open ? remitoTitle(open) : 'Envío'} description={open?.cabeceraCueAnexo ? `CUE ${dashedCue(open.cabeceraCueAnexo)}` : open?.origenCabeceraName ? `Enviado por la cabecera ${open.origenCabeceraName}` : undefined} onClose={() => setOpenId(null)}>
        {open ? <RemitoDetail key={open.remitoId} remito={open} onObservation={(observation) => observationAdded(open.remitoId, observation)} /> : null}
      </Modal>
    </section>
  )
}

/** A directo envío has no cabecera: its name is "Envío directo" and it never waits for one. */
const remitoTitle = (remito: RemitoControlRemito) => (remito.cabeceraCueAnexo === null ? 'Envío directo' : `Envío a ${remito.cabeceraName}`)

function stageChip(remito: RemitoControlRemito) {
  if (remito.hasShortfall) return <Chip tone="danger">Llegó de menos</Chip>
  if (remito.cabeceraCueAnexo !== null && !remito.cabeceraReceivedAt) return <Chip tone="warn">Esperando a la cabecera</Chip>
  if (remito.lines.every((line) => line.schoolReceivedAt)) return <Chip tone="ok">Llegó a la escuela</Chip>
  return <Chip tone="warn">Esperando a la escuela</Chip>
}

const count = (value: number | null) => value === null ? '—' : formatCount(value)

function journeySteps(remito: RemitoControlRemito): JourneyStep[] {
  const units = (pick: (item: RemitoControlItem) => number) => remito.lines.reduce((sum, line) => sum + line.items.reduce((inner, item) => inner + pick(item), 0), 0)
  const shortAtCabecera = units((item) => item.planningToCabeceraShortfall ?? 0) > 0
  const shortAtSchool = units((item) => item.cabeceraToSchoolShortfall ?? 0) > 0
  const received = remito.lines.filter((line) => line.schoolReceivedAt).length
  const allReceived = remito.lines.length > 0 && received === remito.lines.length
  const cabeceraWho = `${remito.cabeceraReceivedByName ?? 'La cabecera'}${remito.cabeceraReceivedAt ? ` · ${when(remito.cabeceraReceivedAt)}` : ''}`
  const sent = { label: 'Enviado', state: 'done' as const, detail: `${remito.dispatchedByName} · ${when(remito.dispatchedAt)}` }
  if (remito.cabeceraCueAnexo === null) {
    return [
      sent,
      allReceived
        ? { label: 'Llegó a la escuela', state: shortAtSchool ? 'short' : 'done', detail: `${received} de ${remito.lines.length} escuelas${shortAtSchool ? ' · llegó de menos' : ''}` }
        : { label: 'Llegó a la escuela', state: 'current', detail: `${received} de ${remito.lines.length} escuelas` },
    ]
  }
  return [
    sent,
    remito.cabeceraReceivedAt
      ? { label: 'Llegó a la cabecera', state: shortAtCabecera ? 'short' : 'done', detail: `${cabeceraWho}${shortAtCabecera ? ' · llegó de menos' : ''}` }
      : { label: 'Llegó a la cabecera', state: 'current' },
    allReceived
      ? { label: 'Llegó a la escuela', state: shortAtSchool ? 'short' : 'done', detail: `${received} de ${remito.lines.length} escuelas${shortAtSchool ? ' · llegó de menos' : ''}` }
      : { label: 'Llegó a la escuela', state: remito.cabeceraReceivedAt ? 'current' : 'pending', detail: remito.cabeceraReceivedAt ? `${received} de ${remito.lines.length} escuelas` : null },
  ]
}

const cell = { padding: '.15rem .5rem', textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }

function LineChain({ remito, line }: { remito: RemitoControlRemito; line: RemitoControlLine }) {
  return (
    <section aria-label={line.recipientName ?? line.recipientCueAnexo} style={{ display: 'grid', gap: '.3rem' }}>
      <span className="k-row-title">{line.recipientName ?? 'Escuela'} <span className="k-row-meta">CUE {dashedCue(line.recipientCueAnexo)}</span></span>
      <span className="k-row-meta">
        {line.schoolReceivedAt
          ? `Llegó a la escuela · ${line.schoolReceivedByName ?? 'una cuenta de la escuela'} · ${when(line.schoolReceivedAt)}`
          : remito.cabeceraReceivedAt ? 'Esperando a la escuela' : 'Esperando a la cabecera'}
      </span>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
        <thead>
          <tr style={{ color: 'var(--ink-soft)' }}>
            <th scope="col" style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>Grado</th>
            <th scope="col" style={{ ...cell, fontWeight: 600 }}>Enviado</th>
            <th scope="col" style={{ ...cell, fontWeight: 600 }}>En cabecera</th>
            <th scope="col" style={{ ...cell, fontWeight: 600 }}>En escuela</th>
          </tr>
        </thead>
        <tbody>
          {line.items.map((item) => (
            <tr key={item.productId} style={{ borderTop: '1px solid var(--line-soft)' }}>
              <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>{shortProduct(item.productLabel)}</th>
              <td style={cell}>{formatCount(item.dispatched)}</td>
              <td style={{ ...cell, color: item.planningToCabeceraShortfall ? 'var(--danger-ink)' : undefined }}>
                {count(item.cabeceraReceived)}{item.planningToCabeceraShortfall ? ` (faltan ${formatCount(item.planningToCabeceraShortfall)})` : ''}
              </td>
              <td style={{ ...cell, color: item.cabeceraToSchoolShortfall ? 'var(--danger-ink)' : undefined }}>
                {count(item.schoolReceived)}{item.cabeceraToSchoolShortfall ? ` (faltan ${formatCount(item.cabeceraToSchoolShortfall)})` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {line.cabeceraShortfallReason ? <Note>Por qué llegó de menos a la cabecera: {line.cabeceraShortfallReason}</Note> : null}
      {line.schoolShortfallReason ? <Note>Por qué llegó de menos a la escuela: {line.schoolShortfallReason}</Note> : null}
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
        <ShipmentJourney steps={journeySteps(remito)} />
        {remito.lines.map((line) => <LineChain key={line.lineId} remito={remito} line={line} />)}

        <div className="k-field">
          <span className="k-label">Observaciones</span>
          {remito.observations.length === 0 ? <span className="k-hint">Todavía no hay observaciones.</span> : (
            <ul className="k-list" aria-label="Observaciones del envío">
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
              label="Sobre"
              value={lineId}
              options={[{ value: '', label: 'Todo el envío' }, ...remito.lines.map((line) => ({ value: line.lineId, label: line.recipientName ?? dashedCue(line.recipientCueAnexo) }))]}
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
