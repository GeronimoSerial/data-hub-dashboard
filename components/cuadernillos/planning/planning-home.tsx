'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { BookletBalanceView, BookletCampaignOption, BookletOverview, BookletRequestSummary } from '@/lib/cuadernillos/types'
import { isRequestsPage } from '../supervisor/inbox-guards'
import { Chip, EmptyState, KpiStrip, Meter, Note, PageHeader, Panel, Segmented, formatCount } from '../kit'
import { QuotaDrawer, type QuotaChange } from './quota-drawer'
import { StockDrawer } from './stock-drawer'

const LOAD_ERROR = 'No se pudo cargar el catálogo y los saldos.'
const REQUESTS_LOAD_ERROR = 'No se pudieron cargar las solicitudes para contar pendientes y aprobadas hoy.'
// Same endpoint and page size as the supervisor inbox; pages are followed so the counts are not capped at one page.
const REQUEST_PAGE_SIZE = 50
const MAX_REQUEST_PAGES = 10

const errorMessages: Record<string, string> = {
  campaign_inactive: 'La campaña ya no está activa.',
  policy_unresolved: 'La campaña no tiene una política de distribución habilitada.',
  quota_exceeded: 'La cantidad supera el cupo disponible.',
  ineligible: 'La escuela no cumple actualmente el criterio de elegibilidad para enviar la solicitud.',
  forbidden: 'La cuenta no tiene autorización para esta operación.',
  product_not_found: 'El producto ya no está disponible en el catálogo.',
  initial_stock_exists: 'Ese cuadernillo ya tiene stock inicial: registrá una reposición.',
  initial_stock_missing: 'Ese cuadernillo todavía no tiene stock inicial.',
  quota_exceeds_stock: 'El cupo supera el stock que queda sin asignar.',
  invalid_quantity: 'Ingresá una cantidad entera válida.',
  idempotency_conflict: 'La clave de reintento quedó asociada a otra solicitud. Volvé a cargar la pantalla.',
}

function errorText(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return errorMessages[data.error] ?? fallback
  }
  return fallback
}

function isCampaign(value: unknown): value is BookletCampaignOption {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && typeof row.name === 'string'
    && typeof row.distributionEnabled === 'boolean'
    && (typeof row.overassignmentAllowed === 'boolean' || row.overassignmentAllowed === null)
}

function isBalance(value: unknown): value is BookletBalanceView {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.productId === 'string' && typeof row.productLabel === 'string'
    && (Number.isSafeInteger(row.globalAvailable) || row.globalAvailable === null)
    && (Number.isSafeInteger(row.quotaAssigned) || row.quotaAssigned === null)
    && (Number.isSafeInteger(row.quotaAvailable) || row.quotaAvailable === null)
    && (typeof row.cabeceraCueAnexo === 'string' || row.cabeceraCueAnexo === null)
    && (typeof row.cabeceraName === 'string' || row.cabeceraName === null)
}

function isOverview(value: unknown): value is BookletOverview {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (row.capability === 'planning' || row.capability === 'cabecera' || row.capability === 'supervisor')
    && (row.campaignId === null || typeof row.campaignId === 'string')
    && Array.isArray(row.campaignOptions) && row.campaignOptions.every(isCampaign)
    && Array.isArray(row.balances) && row.balances.every(isBalance)
    && Array.isArray(row.requests)
    && (row.eligibility === null || typeof row.eligibility === 'object')
    && typeof row.hasMore === 'boolean'
    && (row.nextCursor === null || typeof row.nextCursor === 'string')
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

async function readJson(response: Response) {
  return response.json().catch(() => null)
}

function actionEnabled(campaign: BookletCampaignOption | undefined) {
  return Boolean(campaign?.distributionEnabled && campaign.overassignmentAllowed === false)
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString()
}

export function PlanningHome() {
  const [overview, setOverview] = useState<BookletOverview | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState('')
  const [requests, setRequests] = useState<BookletRequestSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [stockProductId, setStockProductId] = useState<string | null>(null)
  const [quotaHeadCue, setQuotaHeadCue] = useState<string | null>(null)
  const [drawerError, setDrawerError] = useState<string | null>(null)
  const [headFilter, setHeadFilter] = useState('')

  const loadRequests = useCallback(async (campaignId: string, signal?: AbortSignal) => {
    const rows: BookletRequestSummary[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_REQUEST_PAGES; page += 1) {
      const query = new URLSearchParams({ campaignId, limit: String(REQUEST_PAGE_SIZE) })
      if (cursor) query.set('cursor', cursor)
      const response = await fetch(`/api/cuadernillos/requests?${query}`, { signal, cache: 'no-store' })
      const data = await readJson(response)
      if (!response.ok) throw new Error(errorText(data, REQUESTS_LOAD_ERROR))
      if (!isRequestsPage(data)) throw new Error(REQUESTS_LOAD_ERROR)
      rows.push(...data.requests)
      if (!data.hasMore || !data.nextCursor) break
      cursor = data.nextCursor
    }
    return rows
  }, [])

  const loadOverview = useCallback(async (campaignId?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ capability: 'planning' })
    if (campaignId) query.set('campaignId', campaignId)
    const response = await fetch(`/api/cuadernillos/overview?${query}`, { signal, cache: 'no-store' })
    const data = await readJson(response)
    if (!response.ok) throw new Error(errorText(data, LOAD_ERROR))
    if (!isOverview(data) || data.capability !== 'planning') throw new Error('La respuesta del resumen no tiene un formato válido.')
    // The overview carries no request rows; the counts come from the requests endpoint the supervisor inbox uses.
    const requestRows = data.campaignId ? await loadRequests(data.campaignId, signal) : []
    setRequests(requestRows)
    setOverview(data)
    setSelectedCampaign(data.campaignId ?? '')
  }, [loadRequests])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => loadOverview(undefined, controller.signal)).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : LOAD_ERROR)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [loadOverview])

  const balances = useMemo(() => overview?.balances ?? [], [overview])
  const products = useMemo(() => [...new Map(balances.map((row) => [row.productId, row])).values()], [balances])
  const heads = useMemo(() => [...new Map(balances.flatMap((row) => row.cabeceraCueAnexo && row.cabeceraName
    ? [[row.cabeceraCueAnexo, { cueAnexo: row.cabeceraCueAnexo, name: row.cabeceraName }] as const]
    : [])).values()], [balances])
  const campaign = overview?.campaignOptions.find((option) => option.id === selectedCampaign)
  const writeEnabled = actionEnabled(campaign)

  const quotaOf = useCallback((cue: string, productId: string) =>
    balances.find((row) => row.cabeceraCueAnexo === cue && row.productId === productId)?.quotaAvailable ?? 0, [balances])
  const assignedTo = useCallback((productId: string) =>
    heads.reduce((sum, head) => sum + quotaOf(head.cueAnexo, productId), 0), [heads, quotaOf])

  const stockTotal = products.reduce((sum, row) => sum + (row.globalAvailable ?? 0), 0)
  const assignedTotal = products.reduce((sum, row) => sum + assignedTo(row.productId), 0)
  const pending = requests.filter((request) => request.status === 'pending')
  const approvedToday = requests.filter((request) => request.status === 'approved' && request.approvedAt && isToday(request.approvedAt)).length
  const pendingByHead = (cue: string) => pending.filter((request) => request.cabeceraCueAnexo === cue).length
  const visibleHeads = heads.filter((head) => !headFilter.trim() || `${head.name} ${head.cueAnexo}`.toLowerCase().includes(headFilter.trim().toLowerCase()))

  async function selectCampaign(campaignId: string) {
    setSelectedCampaign(campaignId)
    setLoading(true)
    setError(null)
    setNotice(null)
    try { await loadOverview(campaignId) }
    catch (reason) { setOverview(null); setError(reason instanceof Error ? reason.message : LOAD_ERROR) }
    finally { setLoading(false) }
  }

  async function postJson(url: string, body: unknown) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await readJson(response)
    if (!response.ok) throw new Error(errorText(data, 'No se pudo completar la operación.'))
    return data
  }

  async function registerStock(productId: string, quantity: number, movement: 'initial' | 'replenishment') {
    if (!selectedCampaign || !writeEnabled) return
    setSaving(true); setDrawerError(null); setNotice(null)
    try {
      await postJson('/api/cuadernillos/stock', { campaignId: selectedCampaign, productId, quantity, movement, idempotencyKey: crypto.randomUUID() })
      await loadOverview(selectedCampaign)
      setStockProductId(null)
      setNotice('Movimiento de stock registrado.')
    } catch (reason) { setDrawerError(reason instanceof Error ? reason.message : 'No se pudo registrar el movimiento de stock.') }
    finally { setSaving(false) }
  }

  async function saveQuotas(cabeceraCueAnexo: string, changes: QuotaChange[]) {
    if (!selectedCampaign || !writeEnabled || changes.length === 0) return
    setSaving(true); setDrawerError(null); setNotice(null)
    try {
      for (const change of changes) {
        await postJson('/api/cuadernillos/quotas', { campaignId: selectedCampaign, cabeceraCueAnexo, productId: change.productId, quantity: change.quantity })
      }
      await loadOverview(selectedCampaign)
      setQuotaHeadCue(null)
      setNotice('Cupos actualizados.')
    } catch (reason) {
      // Earlier changes of this batch were already saved: refresh so the drawer shows the real state.
      await loadOverview(selectedCampaign).catch(() => undefined)
      setDrawerError(reason instanceof Error ? reason.message : 'No se pudo actualizar el cupo.')
    }
    finally { setSaving(false) }
  }

  const stockProduct = products.find((row) => row.productId === stockProductId) ?? null
  const quotaHead = heads.find((head) => head.cueAnexo === quotaHeadCue) ?? null

  return (
    <section aria-labelledby="planning-home-title" className="k-stack">
      <PageHeader
        id="planning-home-title"
        title="Planeamiento"
        description={campaign ? `${campaign.name}: cargá el stock de cada grado y repartilo entre las cabeceras.` : 'Cargá el stock de cada grado y repartilo entre las cabeceras.'}
      />

      {loading && !overview ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando catálogo y saldos…</p> : null}
      {error ? <Note tone="danger">{error}</Note> : null}
      {notice ? <Note tone="ok">{notice}</Note> : null}

      {overview && overview.campaignOptions.length === 0 ? (
        <EmptyState title="No hay campañas activas para consultar." description="Cuando se active una campaña, acá cargás el stock y los cupos." />
      ) : null}

      {overview && overview.campaignOptions.length > 1 ? (
        <Segmented
          label="Campaña"
          value={selectedCampaign}
          options={overview.campaignOptions.map((option) => ({ value: option.id, label: option.name }))}
          onChange={(id) => void selectCampaign(id)}
        />
      ) : null}
      {overview && overview.campaignOptions.length > 1 && !selectedCampaign ? <EmptyState title="Elegí una campaña" description="Elegí una campaña para ver sus saldos." /> : null}
      {selectedCampaign && !writeEnabled ? <Note>Esta campaña todavía no permite registrar movimientos.</Note> : null}

      {overview?.campaignId ? (
        <>
          <KpiStrip label="Resumen de la campaña" items={[
            { label: 'Stock total', value: formatCount(stockTotal) },
            { label: 'Asignado a cabeceras', value: formatCount(assignedTotal) },
            { label: 'Sin asignar', value: formatCount(Math.max(0, stockTotal - assignedTotal)), tone: stockTotal > 0 && stockTotal - assignedTotal <= 0 ? 'warn' : undefined },
            { label: 'Pedidos pendientes', value: pending.length, tone: pending.length > 0 ? 'warn' : undefined },
            { label: 'Aprobados hoy', value: approvedToday },
          ]} />

          <Panel title="Stock por grado" aside="Tocá un grado para cargar stock">
            <div className="k-list">
              {products.map((row) => {
                const stock = row.globalAvailable
                const assigned = assignedTo(row.productId)
                return (
                  <button key={row.productId} type="button" className="k-row" disabled={!writeEnabled}
                    aria-label={`${row.productLabel}: ${stock === null ? 'sin stock' : `stock ${stock}`}`}
                    onClick={() => { setDrawerError(null); setStockProductId(row.productId) }}>
                    <span className="k-row-main">
                      <span className="k-row-title">{row.productLabel}</span>
                      {stock === null ? (
                        <span className="k-row-meta">Todavía sin stock inicial</span>
                      ) : (
                        <>
                          <Meter value={assigned} max={stock} label={`Asignado de ${row.productLabel}`} tone={assigned >= stock ? 'warn' : undefined} />
                          <span className="k-row-meta">Asignado {formatCount(assigned)} · Sin asignar {formatCount(Math.max(0, stock - assigned))}</span>
                        </>
                      )}
                    </span>
                    <span className="k-row-side">
                      {stock === null ? <Chip tone="warn">Sin stock</Chip> : <span className="k-row-num">{formatCount(stock)}</span>}
                      <ChevronRight aria-hidden size={20} />
                    </span>
                  </button>
                )
              })}
            </div>
          </Panel>

          <Panel title="Cupos por cabecera" aside={`${heads.length} cabecera${heads.length === 1 ? '' : 's'}`}>
            {heads.length === 0 ? (
              <EmptyState title="Sin cabeceras confirmadas" description="Cuando haya cabeceras con escuelas asignadas, les repartís el stock desde acá." />
            ) : (
              <>
                {heads.length > 8 ? (
                  <Input aria-label="Filtrar cabeceras" placeholder="Filtrar por nombre o CUE" value={headFilter} onChange={(event) => setHeadFilter(event.target.value)} />
                ) : null}
                <div className="k-list">
                  {visibleHeads.map((head) => {
                    const total = products.reduce((sum, row) => sum + quotaOf(head.cueAnexo, row.productId), 0)
                    const waiting = pendingByHead(head.cueAnexo)
                    return (
                      <button key={head.cueAnexo} type="button" className="k-row" disabled={!writeEnabled}
                        onClick={() => { setDrawerError(null); setQuotaHeadCue(head.cueAnexo) }}>
                        <span className="k-row-main">
                          <span className="k-row-title">{head.name}</span>
                          <span className="k-row-meta">CUE {head.cueAnexo}{waiting ? ` · ${waiting} pedido${waiting === 1 ? '' : 's'} pendiente${waiting === 1 ? '' : 's'}` : ''}</span>
                        </span>
                        <span className="k-row-side">
                          {total === 0 ? <Chip tone="warn">Sin cupo</Chip> : <span className="k-row-num">{formatCount(total)}</span>}
                          <ChevronRight aria-hidden size={20} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </Panel>
        </>
      ) : null}

      <StockDrawer
        product={stockProduct}
        saving={saving}
        error={drawerError}
        onClose={() => setStockProductId(null)}
        onSubmit={(quantity, movement) => void registerStock(stockProduct?.productId ?? '', quantity, movement)}
      />
      <QuotaDrawer
        head={quotaHead}
        products={products}
        quotaOf={quotaOf}
        assignedTo={assignedTo}
        saving={saving}
        error={drawerError}
        onClose={() => setQuotaHeadCue(null)}
        onSubmit={(changes) => void saveQuotas(quotaHead?.cueAnexo ?? '', changes)}
      />
    </section>
  )
}
