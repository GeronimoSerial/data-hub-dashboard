'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import type { BookletBalanceView, BookletCampaignOption, BookletOverview, BookletRequestSummary } from '@/lib/cuadernillos/types'
import { isRequestsPage } from '../supervisor/inbox-guards'
import { PlanningSummary } from './planning-summary'

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

export function PlanningHome() {
  const [overview, setOverview] = useState<BookletOverview | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState('')
  const [requests, setRequests] = useState<BookletRequestSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [stockProduct, setStockProduct] = useState('')
  const [stockQuantity, setStockQuantity] = useState('')
  const [stockMovement, setStockMovement] = useState<'initial' | 'replenishment'>('initial')
  const [quotaHead, setQuotaHead] = useState('')
  const [quotaProduct, setQuotaProduct] = useState('')
  const [quotaQuantity, setQuotaQuantity] = useState('')

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
    setStockProduct(data.balances[0]?.productId ?? '')
    setQuotaProduct(data.balances[0]?.productId ?? '')
    setQuotaHead(data.balances.find((balance) => balance.cabeceraCueAnexo)?.cabeceraCueAnexo ?? '')
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

  const products = useMemo(() => [...new Map((overview?.balances ?? []).map((row) => [row.productId, row])).values()], [overview])
  const heads = useMemo(() => [...new Map((overview?.balances ?? []).flatMap((row) => row.cabeceraCueAnexo && row.cabeceraName
    ? [[row.cabeceraCueAnexo, { cueAnexo: row.cabeceraCueAnexo, name: row.cabeceraName }] as const]
    : [])).values()], [overview])
  const campaign = overview?.campaignOptions.find((option) => option.id === selectedCampaign)
  const writeEnabled = actionEnabled(campaign)
  const productItems = products.map((row) => ({ value: row.productId, label: row.productLabel }))
  const headItems = heads.map((head) => ({ value: head.cueAnexo, label: `${head.name} · ${head.cueAnexo}` }))
  const campaignItems = (overview?.campaignOptions ?? []).map((option) => ({ value: option.id, label: option.name }))

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

  async function updateStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCampaign || !stockProduct || !writeEnabled ) return
    const quantity = Number(stockQuantity)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) { setError('Ingresá una cantidad entera mayor que cero.'); return }
    setSaving(true); setError(null); setNotice(null)
    try {
      await postJson('/api/cuadernillos/stock', {
        campaignId: selectedCampaign, productId: stockProduct, quantity, movement: stockMovement,
        idempotencyKey: crypto.randomUUID(),
      })
      setStockQuantity('')
      await loadOverview(selectedCampaign)
      setNotice('Movimiento de stock registrado.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo registrar el movimiento de stock.') }
    finally { setSaving(false) }
  }

  async function updateQuota(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCampaign || !quotaHead || !quotaProduct || !writeEnabled ) return
    const quantity = Number(quotaQuantity)
    if (!Number.isSafeInteger(quantity) || quantity < 0) { setError('Ingresá un cupo entero igual o mayor que cero.'); return }
    setSaving(true); setError(null); setNotice(null)
    try {
      await postJson('/api/cuadernillos/quotas', { campaignId: selectedCampaign, cabeceraCueAnexo: quotaHead, productId: quotaProduct, quantity })
      setQuotaQuantity('')
      await loadOverview(selectedCampaign)
      setNotice('Cupo disponible actualizado.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el cupo.') }
    finally { setSaving(false) }
  }

  return (
    <section aria-labelledby="planning-home-title" style={{ display: 'grid', gap: '1.5rem' }}>
      <h2 id="planning-home-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 3vw, 1.8rem)' }}>
        Planeamiento
      </h2>

      <>
          {loading && !overview ? <p role="status" style={{ color: 'var(--ink-soft)' }}>Cargando catálogo y saldos…</p> : null}
          {error ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{error}</p> : null}
          {notice ? <p role="status" style={{ color: 'var(--ink)' }}>{notice}</p> : null}

          {overview && overview.campaignOptions.length === 0 ? <p style={{ color: 'var(--ink-soft)' }}>No hay campañas activas para consultar.</p> : null}

          {overview && overview.campaignOptions.length > 0 ? (
            <div style={{ display: 'grid', gap: '.5rem', maxWidth: '28rem' }}>
              <span id="planning-campaign-label" style={{ color: 'var(--ink-soft)' }}>Campaña</span>
              {overview.campaignOptions.length > 1 ? (
                <Select items={campaignItems} value={selectedCampaign || null} onValueChange={(value) => void selectCampaign(asText(value))} disabled={loading || saving}>
                  <SelectTrigger aria-labelledby="planning-campaign-label">{campaignItems.find((item) => item.value === selectedCampaign)?.label ?? 'Seleccioná una campaña'}</SelectTrigger>
                  <SelectContent>{campaignItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : <strong>{overview.campaignOptions[0].name}</strong>}
              {selectedCampaign && !writeEnabled ? <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Esta campaña todavía no permite registrar movimientos.</p> : null}
            </div>
          ) : null}

          {overview && overview.campaignOptions.length > 1 && !selectedCampaign ? <p style={{ color: 'var(--ink-soft)' }}>Elegí una campaña para ver sus saldos.</p> : null}

          {overview?.campaignId ? (
            <>
              <PlanningSummary balances={overview.balances} requests={requests} />

              {writeEnabled && products.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))', gap: '1.25rem' }}>
                  <form onSubmit={(event) => void updateStock(event)} style={formStyle}>
                    <h3 style={formTitle}>Registrar stock global</h3>
                    <div style={fieldStyle}>
                      <span id="stock-product-label">Producto</span>
                      <Select items={productItems} value={stockProduct || null} onValueChange={(value) => setStockProduct(asText(value))}>
                        <SelectTrigger aria-labelledby="stock-product-label">{productItems.find((item) => item.value === stockProduct)?.label ?? 'Elegí un producto'}</SelectTrigger>
                        <SelectContent>{productItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div style={fieldStyle}>
                      <span id="stock-movement-label">Movimiento</span>
                      <Select items={STOCK_MOVEMENTS} value={stockMovement} onValueChange={(value) => setStockMovement(value === 'replenishment' ? 'replenishment' : 'initial')}>
                        <SelectTrigger aria-labelledby="stock-movement-label">{stockMovement === 'initial' ? 'Ingreso inicial' : 'Reposición'}</SelectTrigger>
                        <SelectContent>{STOCK_MOVEMENTS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div style={fieldStyle}>
                      <label htmlFor="stock-quantity">Cantidad</label>
                      <Input id="stock-quantity" aria-label="Cantidad de stock" type="number" min="1" step="1" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} />
                    </div>
                    <button type="submit" disabled={saving} className="ui-button ui-button--primary">{saving ? 'Guardando…' : 'Registrar movimiento'}</button>
                  </form>

                  <form onSubmit={(event) => void updateQuota(event)} style={formStyle}>
                    <h3 style={formTitle}>Definir cupo disponible</h3>
                    <div style={fieldStyle}>
                      <span id="quota-head-label">Cabecera</span>
                      <Select items={headItems} value={quotaHead || null} onValueChange={(value) => setQuotaHead(asText(value))}>
                        <SelectTrigger aria-labelledby="quota-head-label">{headItems.find((item) => item.value === quotaHead)?.label ?? 'Elegí una cabecera'}</SelectTrigger>
                        <SelectContent>{headItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div style={fieldStyle}>
                      <span id="quota-product-label">Producto</span>
                      <Select items={productItems} value={quotaProduct || null} onValueChange={(value) => setQuotaProduct(asText(value))}>
                        <SelectTrigger aria-labelledby="quota-product-label">{productItems.find((item) => item.value === quotaProduct)?.label ?? 'Elegí un producto'}</SelectTrigger>
                        <SelectContent>{productItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div style={fieldStyle}>
                      <label htmlFor="quota-quantity">Cantidad disponible</label>
                      <Input id="quota-quantity" aria-label="Cantidad de cupo disponible" type="number" min="0" step="1" value={quotaQuantity} onChange={(event) => setQuotaQuantity(event.target.value)} />
                    </div>
                    <button type="submit" disabled={saving || !heads.length} className="ui-button ui-button--secondary">{saving ? 'Guardando…' : 'Guardar cupo'}</button>
                  </form>
                </div>
              ) : null}
            </>
          ) : null}
      </>
    </section>
  )
}

const STOCK_MOVEMENTS = [
  { value: 'initial', label: 'Ingreso inicial' },
  { value: 'replenishment', label: 'Reposición' },
]

const formStyle = { display: 'grid', alignContent: 'start', gap: '.75rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' } as const
const fieldStyle = { display: 'grid', gap: '.35rem' } as const
const formTitle = { margin: 0, color: 'var(--ink)', fontSize: '1rem' } as const
