'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BookletBalanceView, BookletCampaignOption, BookletOverview } from '@/lib/cuadernillos/types'
import { Chip, EmptyState, KpiStrip, Note, PageHeader, Panel, Segmented, formatCount } from '../kit'
import { isCabeceraList, isRemitosPage, type RemitoSummary } from './remito-api'
import { RemitoBuilder } from './remito-builder'
import { RemitosList } from './remitos-list'
import { StockModal } from './stock-modal'

const LOAD_ERROR = 'No se pudo cargar el catálogo y los saldos.'
const REMITOS_LOAD_ERROR = 'No se pudieron cargar los remitos.'
const REMITOS_PAGE_SIZE = 20

const errorMessages: Record<string, string> = {
  campaign_inactive: 'La campaña ya no está activa.',
  policy_unresolved: 'La campaña no tiene una política de distribución habilitada.',
  ineligible: 'La escuela no cumple actualmente el criterio de elegibilidad para enviar la solicitud.',
  forbidden: 'La cuenta no tiene autorización para esta operación.',
  product_not_found: 'El producto ya no está disponible en el catálogo.',
  initial_stock_exists: 'Ese cuadernillo ya tiene stock inicial: registrá una reposición.',
  initial_stock_missing: 'Ese cuadernillo todavía no tiene stock inicial.',
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
  const [cabeceraNames, setCabeceraNames] = useState<Map<string, string>>(new Map())
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

  // The remitos read never blocks the stock view: its failure shows next to the list only.
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
    const query = new URLSearchParams({ capability: 'planning' })
    if (campaignId) query.set('campaignId', campaignId)
    const response = await fetch(`/api/cuadernillos/overview?${query}`, { signal, cache: 'no-store' })
    const data = await readJson(response)
    if (!response.ok) throw new Error(errorText(data, LOAD_ERROR))
    if (!isOverview(data) || data.capability !== 'planning') throw new Error('La respuesta del resumen no tiene un formato válido.')
    setOverview(data)
    setSelectedCampaign(data.campaignId ?? '')
    return data.campaignId
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
    // Names for the remitos list; a failure only leaves the CUE as the label.
    void fetch('/api/cuadernillos/cabeceras', { cache: 'no-store', signal: controller.signal })
      .then((response) => readJson(response).then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (response.ok && isCabeceraList(data)) setCabeceraNames(new Map(data.cabeceras.map((row) => [row.cue, row.nombre])))
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
      setNotice('Movimiento de stock registrado.')
    } catch (reason) { setModalError(reason instanceof Error ? reason.message : 'No se pudo registrar el movimiento de stock.') }
    finally { setSaving(false) }
  }

  async function remitoDispatched() {
    setBuilderOpen(false)
    setNotice('Remito despachado. El stock ya se descontó.')
    await Promise.all([
      loadOverview(selectedCampaign).catch(() => undefined),
      refreshRemitos(selectedCampaign),
    ])
  }

  const stockProduct = products.find((row) => row.productId === stockProductId) ?? null

  return (
    <section aria-labelledby="planning-home-title" className="k-stack">
      <PageHeader
        id="planning-home-title"
        title="Planeamiento"
        description={campaign ? `${campaign.name}: cargá el stock de cada grado y enviá remitos a las escuelas.` : 'Cargá el stock de cada grado y enviá remitos a las escuelas.'}
        action={overview?.campaignId ? (
          <Button type="button" disabled={!writeEnabled || products.length === 0} onClick={() => { setNotice(null); setBuilderOpen(true) }}>Nuevo remito</Button>
        ) : undefined}
      />

      {loading && !overview ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando catálogo y saldos…</p> : null}
      {error ? <Note tone="danger">{error}</Note> : null}
      {notice ? <Note tone="ok">{notice}</Note> : null}

      {overview && overview.campaignOptions.length === 0 ? (
        <EmptyState title="No hay campañas activas para consultar." description="Cuando se active una campaña, acá cargás el stock y despachás remitos." />
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
            { label: 'Remitos despachados', value: `${remitos.length}${remitosCursor ? '+' : ''}` },
            { label: 'Pendientes en cabecera', value: pendingCabecera, tone: pendingCabecera > 0 ? 'warn' : undefined },
          ]} />

          <Panel title="Stock por grado" aside="Tocá un grado para cargar stock">
            <div className="k-list">
              {products.map((row) => {
                const stock = row.globalAvailable
                return (
                  <button key={row.productId} type="button" className="k-row" disabled={!writeEnabled}
                    aria-label={`${row.productLabel}: ${stock === null ? 'sin stock' : `stock ${stock}`}`}
                    onClick={() => { setModalError(null); setStockProductId(row.productId) }}>
                    <span className="k-row-main">
                      <span className="k-row-title">{row.productLabel}</span>
                      {stock === null ? <span className="k-row-meta">Todavía sin stock inicial</span> : null}
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

          <Panel title="Remitos" aside="Del más reciente al más antiguo">
            {remitosError ? <Note tone="danger">{remitosError}</Note> : null}
            {!remitosError || remitos.length > 0 ? (
              <RemitosList
                remitos={remitos}
                cabeceraNames={cabeceraNames}
                productLabels={productLabels}
                hasMore={remitosCursor !== null}
                loadingMore={loadingMore}
                onLoadMore={() => void loadMoreRemitos()}
              />
            ) : null}
          </Panel>
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
