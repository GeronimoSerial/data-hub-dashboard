'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BookletBalanceView, BookletCampaignOption, BookletOverview } from '@/lib/cuadernillos/types'
import { EmptyState, KpiStrip, Note, PageHeader, Panel, Segmented, TaskCard, formatCount, shortProduct, type Kpi } from '../kit'
import { PlanningStyles } from './planning-styles'
import { isCabeceraList, isRemitosPage, type ConfirmedCabecera, type RemitoSummary } from './remito-api'
import { daysAgo, remitoUnits } from './remito-status'
import { RemitoBuilder } from './remito-builder'
import { RemitosList } from './remitos-list'
import { StockModal } from './stock-modal'

const LOAD_ERROR = 'No se pudo cargar el catálogo y los saldos.'
const REMITOS_LOAD_ERROR = 'No se pudieron cargar los envíos.'
const REMITOS_PAGE_SIZE = 20

const errorMessages: Record<string, string> = {
  campaign_inactive: 'La campaña ya no está activa.',
  policy_unresolved: 'La campaña todavía no tiene habilitada la distribución.',
  ineligible: 'La escuela ya no figura entre las que necesitan cuadernillos.',
  forbidden: 'Tu cuenta no tiene permiso para esta operación.',
  product_not_found: 'El producto ya no está disponible en el catálogo.',
  initial_stock_exists: 'Ese cuadernillo ya tiene stock inicial: registrá una reposición.',
  initial_stock_missing: 'Ese cuadernillo todavía no tiene stock inicial.',
  invalid_quantity: 'Ingresá una cantidad entera válida.',
  idempotency_conflict: 'Este reintento no coincide con la operación anterior. Volvé a cargar la pantalla.',
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
}

function isOverview(value: unknown): value is BookletOverview {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (row.capability === 'planning' || row.capability === 'cabecera' || row.capability === 'supervisor')
    && (row.campaignId === null || typeof row.campaignId === 'string')
    && Array.isArray(row.campaignOptions) && row.campaignOptions.every(isCampaign)
    && Array.isArray(row.balances) && row.balances.every(isBalance)
}

async function readJson(response: Response) {
  return response.json().catch(() => null)
}

function actionEnabled(campaign: BookletCampaignOption | undefined) {
  return Boolean(campaign?.distributionEnabled && campaign.overassignmentAllowed === false)
}

export function PlanningHome() {
  const [overview, setOverview] = useState<BookletOverview | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState('')
  const [remitos, setRemitos] = useState<RemitoSummary[]>([])
  const [remitosCursor, setRemitosCursor] = useState<string | null>(null)
  const [remitosError, setRemitosError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cabeceraList, setCabeceraList] = useState<Array<ConfirmedCabecera & { status: string }> | null>(null)
  // Read once: "hace 2 días" must not change between renders of the same screen.
  const [now] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [stockProductId, setStockProductId] = useState<string | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const loadRemitos = useCallback(async (campaignId: string, cursor: string | null, signal?: AbortSignal) => {
    const query = new URLSearchParams({ campaignId, limit: String(REMITOS_PAGE_SIZE) })
    if (cursor) query.set('cursor', cursor)
    const response = await fetch(`/api/cuadernillos/remitos?${query}`, { signal, cache: 'no-store' })
    const data = await readJson(response)
    if (!response.ok || !isRemitosPage(data)) throw new Error(REMITOS_LOAD_ERROR)
    return data
  }, [])

  // The envíos read never blocks the stock view: its failure shows next to the list only.
  const refreshRemitos = useCallback(async (campaignId: string, signal?: AbortSignal) => {
    try {
      const page = await loadRemitos(campaignId, null, signal)
      setRemitos(page.remitos)
      setRemitosCursor(page.hasMore ? page.nextCursor : null)
      setRemitosError(null)
    } catch (reason) {
      if (!signal?.aborted) setRemitosError(reason instanceof Error ? reason.message : REMITOS_LOAD_ERROR)
    }
  }, [loadRemitos])

  const loadOverview = useCallback(async (campaignId?: string, signal?: AbortSignal) => {
    let requested = campaignId
    // With a single campaign there is nothing to choose: a second pass selects it right away.
    for (let pass = 0; pass < 2; pass += 1) {
      const query = new URLSearchParams({ capability: 'planning' })
      if (requested) query.set('campaignId', requested)
      const response = await fetch(`/api/cuadernillos/overview?${query}`, { signal, cache: 'no-store' })
      const data = await readJson(response)
      if (!response.ok) throw new Error(errorText(data, LOAD_ERROR))
      if (!isOverview(data) || data.capability !== 'planning') throw new Error('La respuesta del resumen no tiene un formato válido.')
      if (!data.campaignId && !requested && data.campaignOptions.length === 1) { requested = data.campaignOptions[0].id; continue }
      setOverview(data)
      setSelectedCampaign(data.campaignId ?? '')
      return data.campaignId
    }
    return null
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(async () => {
      const campaignId = await loadOverview(undefined, controller.signal)
      if (campaignId) await refreshRemitos(campaignId, controller.signal)
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : LOAD_ERROR)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    // Names for the envíos list and the cabeceras panel; a failure only leaves the CUE as the label.
    void fetch('/api/cuadernillos/cabeceras', { cache: 'no-store', signal: controller.signal })
      .then((response) => readJson(response).then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (response.ok && isCabeceraList(data)) setCabeceraList(data.cabeceras)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [loadOverview, refreshRemitos])

  const balances = useMemo(() => overview?.balances ?? [], [overview])
  const products = useMemo(() => [...new Map(balances.map((row) => [row.productId, row])).values()], [balances])
  const productOptions = useMemo(() => products.map((row) => ({ productId: row.productId, productLabel: row.productLabel, available: row.globalAvailable ?? 0 })), [products])
  const productLabels = useMemo(() => new Map(products.map((row) => [row.productId, row.productLabel])), [products])
  const campaign = overview?.campaignOptions.find((option) => option.id === selectedCampaign)
  const writeEnabled = actionEnabled(campaign)
  const stockTotal = products.reduce((sum, row) => sum + (row.globalAvailable ?? 0), 0)
  const pendingCabecera = remitos.filter((remito) => !remito.cabeceraReceivedAt).length
  let pendingDescription: string
  if (remitos.length === 0) pendingDescription = 'Todavía no enviaste cuadernillos en esta campaña.'
  else if (pendingCabecera === 0) pendingDescription = 'Ningún envío está esperando a la cabecera.'
  else pendingDescription = `${remitosCursor ? 'Al menos ' : ''}${pendingCabecera} envío${pendingCabecera === 1 ? '' : 's'} todavía no ${pendingCabecera === 1 ? 'fue confirmado' : 'fueron confirmados'} por la cabecera.`

  async function selectCampaign(campaignId: string) {
    setSelectedCampaign(campaignId)
    setLoading(true)
    setError(null)
    setNotice(null)
    setRemitos([])
    setRemitosCursor(null)
    try {
      await loadOverview(campaignId)
      await refreshRemitos(campaignId)
    }
    catch (reason) { setOverview(null); setError(reason instanceof Error ? reason.message : LOAD_ERROR) }
    finally { setLoading(false) }
  }

  async function loadMoreRemitos() {
    if (!selectedCampaign || !remitosCursor) return
    setLoadingMore(true)
    try {
      const page = await loadRemitos(selectedCampaign, remitosCursor)
      setRemitos((current) => [...current, ...page.remitos])
      setRemitosCursor(page.hasMore ? page.nextCursor : null)
    } catch (reason) {
      setRemitosError(reason instanceof Error ? reason.message : REMITOS_LOAD_ERROR)
    } finally { setLoadingMore(false) }
  }

  async function registerStock(productId: string, quantity: number, movement: 'initial' | 'replenishment') {
    if (!selectedCampaign || !writeEnabled) return
    setSaving(true); setModalError(null); setNotice(null)
    try {
      const response = await fetch('/api/cuadernillos/stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: selectedCampaign, productId, quantity, movement, idempotencyKey: crypto.randomUUID() }),
      })
      const data = await readJson(response)
      if (!response.ok) throw new Error(errorText(data, 'No se pudo completar la operación.'))
      await loadOverview(selectedCampaign)
      setStockProductId(null)
      setNotice('Stock guardado.')
    } catch (reason) { setModalError(reason instanceof Error ? reason.message : 'No se pudo guardar el stock.') }
    finally { setSaving(false) }
  }

  async function remitoDispatched() {
    setBuilderOpen(false)
    setNotice('Envío hecho. El stock ya se descontó.')
    await Promise.all([
      loadOverview(selectedCampaign).catch(() => undefined),
      refreshRemitos(selectedCampaign),
    ])
  }

  const stockProduct = products.find((row) => row.productId === stockProductId) ?? null
  const stockMax = Math.max(1, ...products.map((row) => row.globalAvailable ?? 0))
  const partial = remitosCursor !== null
  const cabeceras = useMemo(() => new Map((cabeceraList ?? []).map((row) => [row.cue, row])), [cabeceraList])
  const totals = remitos.reduce((sum, remito) => {
    const units = remitoUnits(remito)
    return { dispatched: sum.dispatched + units.dispatched, delivered: sum.delivered + units.delivered, short: sum.short + units.short, shortEnvios: sum.shortEnvios + (units.short > 0 ? 1 : 0) }
  }, { dispatched: 0, delivered: 0, short: 0, shortEnvios: 0 })
  const sentByProduct = new Map<string, number>()
  for (const remito of remitos) {
    for (const line of remito.lines) {
      for (const item of line.items) sentByProduct.set(item.productId, (sentByProduct.get(item.productId) ?? 0) + item.dispatchedQuantity)
    }
  }
  const schoolLines = remitos.flatMap((remito) => remito.lines)
  const schoolsDone = schoolLines.filter((line) => line.status === 'received' || line.status === 'closed_empty').length
  const withoutStock = products.filter((row) => !row.globalAvailable).length
  const oldestPending = remitos.filter((remito) => !remito.cabeceraReceivedAt).map((remito) => remito.dispatchedAt).sort()[0]
  const plus = partial ? '+' : ''
  const kpis: Kpi[] = [
    {
      label: 'En stock', value: formatCount(stockTotal),
      hint: withoutStock > 0 ? `${withoutStock} grado${withoutStock === 1 ? '' : 's'} sin stock` : `En ${products.length} grado${products.length === 1 ? '' : 's'}`,
    },
    { label: 'Enviados', value: `${formatCount(totals.dispatched)}${plus}`, hint: remitos.length === 0 ? 'Todavía sin envíos' : `En ${remitos.length}${plus} envío${remitos.length === 1 ? '' : 's'}` },
    {
      label: 'Recibidos por las escuelas', value: `${formatCount(totals.delivered)}${plus}`,
      hint: schoolLines.length > 0 ? `${schoolsDone} de ${schoolLines.length} escuela${schoolLines.length === 1 ? '' : 's'} ya confirmaron` : 'Todavía sin escuelas',
      tone: schoolLines.length > 0 && schoolsDone === schoolLines.length ? 'ok' : undefined,
    },
    {
      label: 'Esperando a la cabecera', value: `${pendingCabecera}${plus}`, tone: pendingCabecera > 0 ? 'warn' : undefined,
      hint: oldestPending ? `El más antiguo salió ${daysAgo(oldestPending, now)}` : 'Ningún envío sin confirmar',
    },
    {
      label: 'Llegaron de menos', value: `${formatCount(totals.short)}${plus}`, tone: totals.short > 0 ? 'warn' : undefined,
      hint: totals.short > 0 ? `En ${totals.shortEnvios} envío${totals.shortEnvios === 1 ? '' : 's'}` : 'Sin faltantes informados',
    },
  ]
  const confirmed = (cabeceraList ?? []).filter((row) => row.status === 'confirmada')
  const unconfirmed = (cabeceraList ?? []).filter((row) => row.status !== 'confirmada')
  const reached = new Set(remitos.map((remito) => remito.cabeceraCueAnexo)).size
  const multipleCampaigns = Boolean(overview && overview.campaignOptions.length > 1)

  return (
    <section aria-labelledby="planning-home-title" className="pl-home">
      <PlanningStyles />
      <PageHeader
        id="planning-home-title"
        title="Planeamiento"
        description={campaign && !multipleCampaigns ? campaign.name : 'Stock y envíos de cuadernillos a las escuelas cabecera.'}
        action={overview && multipleCampaigns ? (
          <Segmented
            label="Campaña"
            value={selectedCampaign}
            options={overview.campaignOptions.map((option) => ({ value: option.id, label: option.name }))}
            onChange={(id) => void selectCampaign(id)}
          />
        ) : undefined}
      />

      {loading && !overview ? (
        <div role="status" className="pl-skeleton">
          <span className="sr-only">Cargando catálogo y saldos…</span>
          <span aria-hidden="true" style={{ height: '4.75rem' }} />
          <span aria-hidden="true" style={{ height: '4.5rem' }} />
          <span aria-hidden="true" style={{ height: '9rem' }} />
        </div>
      ) : null}
      {error ? <Note tone="danger">{error}</Note> : null}
      {notice ? <Note tone="ok">{notice}</Note> : null}

      {overview && overview.campaignOptions.length === 0 ? (
        <EmptyState title="No hay campañas activas para consultar." description="Cuando se active una campaña, acá cargás el stock y enviás cuadernillos." />
      ) : null}
      {multipleCampaigns && !selectedCampaign ? <EmptyState title="Elegí una campaña" description="Elegí una campaña para ver su stock y sus envíos." /> : null}
      {selectedCampaign && !writeEnabled ? <Note>Esta campaña todavía no permite cargar stock ni enviar cuadernillos.</Note> : null}

      {overview?.campaignId ? (
        <>
          <div className="pl-lead">
            <TaskCard
              tone={pendingCabecera > 0 ? 'warn' : undefined}
              title="Enviá cuadernillos a una cabecera"
              description={pendingDescription}
              action={(
                <Button type="button" disabled={!writeEnabled || products.length === 0} onClick={() => { setNotice(null); setBuilderOpen(true) }}>
                  Enviar cuadernillos
                </Button>
              )}
            />
            <KpiStrip label="Resumen de la campaña" items={kpis} />
          </div>

          <div className="pl-grid">
            <Panel title="Envíos" aside={remitos.length > 0 ? `${remitos.length}${plus} · del más reciente al más antiguo` : undefined}>
              {remitosError ? <Note tone="danger">{remitosError}</Note> : null}
              {!remitosError || remitos.length > 0 ? (
                <RemitosList
                  remitos={remitos}
                  cabeceras={cabeceras}
                  productLabels={productLabels}
                  hasMore={remitosCursor !== null}
                  loadingMore={loadingMore}
                  onLoadMore={() => void loadMoreRemitos()}
                />
              ) : null}
            </Panel>

            <aside className="pl-aside" aria-label="Stock y cabeceras">
              <Panel title="Stock por grado" aside={writeEnabled ? 'Elegí un grado para sumar' : undefined}>
                <ul className="pl-stock">
                  {products.map((row) => {
                    const stock = row.globalAvailable
                    const state = stock === null ? 'unset' : stock === 0 ? 'empty' : undefined
                    const sent = sentByProduct.get(row.productId) ?? 0
                    return (
                      <li key={row.productId}>
                        <button type="button" className="pl-stock-item" data-state={state} disabled={!writeEnabled}
                          aria-label={`${row.productLabel}: ${stock === null ? 'sin stock' : `stock ${stock}`}`}
                          onClick={() => { setModalError(null); setStockProductId(row.productId) }}>
                          <span className="pl-stock-name">{shortProduct(row.productLabel)}</span>
                          <span className="pl-stock-num">{stock === null ? 'Sin cargar' : formatCount(stock)}</span>
                          <Plus aria-hidden size={15} className="pl-stock-add" />
                          <span className="pl-stock-bar" aria-hidden="true"><span style={{ width: `${Math.round(((stock ?? 0) / stockMax) * 100)}%` }} /></span>
                          <span className="pl-stock-sent">{sent > 0 ? `${formatCount(sent)}${plus} ya enviados` : 'Todavía sin envíos'}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </Panel>

              {cabeceraList && cabeceraList.length > 0 ? (
                <Panel title="Cabeceras">
                  <dl className="pl-facts">
                    <div><dt>Pueden recibir envíos</dt><dd>{confirmed.length} de {cabeceraList.length}</dd></div>
                    <div><dt>Ya les enviaste</dt><dd>{reached}{plus}</dd></div>
                  </dl>
                  {unconfirmed.length > 0 ? (
                    <div className="pl-unconfirmed">
                      <p>Todavía no confirmaron su cuenta y no se les puede enviar:</p>
                      <ul>
                        {unconfirmed.slice(0, 4).map((row) => <li key={row.cue}>{row.nombre} <span>· {row.departamento}</span></li>)}
                      </ul>
                      {unconfirmed.length > 4 ? <p>y {unconfirmed.length - 4} más.</p> : null}
                    </div>
                  ) : null}
                </Panel>
              ) : null}
            </aside>
          </div>
        </>
      ) : null}

      <StockModal
        product={stockProduct}
        saving={saving}
        error={modalError}
        onClose={() => setStockProductId(null)}
        onSubmit={(quantity, movement) => void registerStock(stockProduct?.productId ?? '', quantity, movement)}
      />
      <RemitoBuilder
        open={builderOpen}
        campaignId={selectedCampaign}
        products={productOptions}
        onClose={() => setBuilderOpen(false)}
        onDispatched={() => void remitoDispatched()}
      />
    </section>
  )
}
