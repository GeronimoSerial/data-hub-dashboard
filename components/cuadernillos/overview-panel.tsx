'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BookletAssignmentView,
  BookletAssignmentsPage,
  BookletBalanceView,
  BookletCampaignOption,
  BookletCapability,
  BookletOverview,
  EnrollmentRecommendation,
} from '@/lib/cuadernillos/types'

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

function isAssignment(value: BookletAssignmentView) {
  return value.relationship === 'dependiente' && value.cabeceraCueAnexo !== null
}

async function readJson(response: Response) {
  return response.json().catch(() => null)
}

function actionEnabled(campaign: BookletCampaignOption | undefined) {
  return Boolean(campaign?.distributionEnabled && campaign.overassignmentAllowed === false)
}

export function OverviewPanel({
  capability,
  assignments,
  onRequestCreated,
}: {
  capability: BookletCapability
  assignments: BookletAssignmentsPage | null
  onRequestCreated: () => void
}) {
  const [overview, setOverview] = useState<BookletOverview | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedRecipient, setSelectedRecipient] = useState('')
  const [recommendationResult, setRecommendationResult] = useState<{ key: string; rows: EnrollmentRecommendation[] } | null>(null)
  const [recommendationIssue, setRecommendationIssue] = useState<{ key: string; error: string } | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [stockProduct, setStockProduct] = useState('')
  const [stockQuantity, setStockQuantity] = useState('')
  const [stockMovement, setStockMovement] = useState<'initial' | 'replenishment'>('initial')
  const [quotaHead, setQuotaHead] = useState('')
  const [quotaProduct, setQuotaProduct] = useState('')
  const [quotaQuantity, setQuotaQuantity] = useState('')
  const submitIntent = useRef<{ body: string; key: string } | null>(null)

  const loadOverview = useCallback(async (campaignId?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ capability })
    if (campaignId) query.set('campaignId', campaignId)
    const response = await fetch(`/api/cuadernillos/overview?${query}`, { signal, cache: 'no-store' })
    const data = await readJson(response)
    if (!response.ok) throw new Error(errorText(data, 'No se pudo cargar el catálogo y los saldos.'))
    if (!isOverview(data) || data.capability !== capability) throw new Error('La respuesta del resumen no tiene un formato válido.')
    setOverview(data)
    setSelectedCampaign(data.campaignId ?? '')
    setStockProduct(data.balances[0]?.productId ?? '')
    setQuotaProduct(data.balances[0]?.productId ?? '')
    setQuotaHead(data.balances.find((balance) => balance.cabeceraCueAnexo)?.cabeceraCueAnexo ?? '')
  }, [capability])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => loadOverview(undefined, controller.signal)).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el catálogo y los saldos.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [loadOverview])

  useEffect(() => {
    if (capability !== 'cabecera' || !selectedRecipient || !selectedCampaign) return
    const controller = new AbortController()
    const key = `${selectedCampaign}:${selectedRecipient}`
    const query = new URLSearchParams({ cueAnexo: selectedRecipient, campaignId: selectedCampaign })
    fetch(`/api/cuadernillos/recommendations?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await readJson(response)
        if (!response.ok) throw new Error(errorText(data, 'No se pudieron calcular las recomendaciones.'))
        if (!data || typeof data !== 'object' || !('recommendations' in data) || !Array.isArray(data.recommendations)) {
          throw new Error('La respuesta de recomendaciones no tiene un formato válido.')
        }
        const parsed: EnrollmentRecommendation[] = data.recommendations.filter((row: unknown): row is EnrollmentRecommendation =>
          row !== null && typeof row === 'object'
          && typeof (row as EnrollmentRecommendation).productId === 'string'
          && (typeof (row as EnrollmentRecommendation).students === 'number' || (row as EnrollmentRecommendation).students === null)
          && (typeof (row as EnrollmentRecommendation).suggested === 'number' || (row as EnrollmentRecommendation).suggested === null)
          && (typeof (row as EnrollmentRecommendation).sourceCutId === 'string' || (row as EnrollmentRecommendation).sourceCutId === null))
        setRecommendationResult({ key, rows: parsed })
        setRecommendationIssue(null)
        setQuantities(Object.fromEntries(parsed.map((row) => [row.productId, row.suggested === null ? '' : String(row.suggested)])))
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setRecommendationIssue({ key, error: reason instanceof Error ? reason.message : 'No se pudieron calcular las recomendaciones.' })
      })
    return () => controller.abort()
  }, [capability, selectedRecipient, selectedCampaign])

  const products = useMemo(() => [...new Map((overview?.balances ?? []).map((row) => [row.productId, row])).values()], [overview])
  const heads = useMemo(() => [...new Map((overview?.balances ?? []).flatMap((row) => row.cabeceraCueAnexo && row.cabeceraName
    ? [[row.cabeceraCueAnexo, { cueAnexo: row.cabeceraCueAnexo, name: row.cabeceraName }] as const]
    : [])).values()], [overview])
  const campaign = overview?.campaignOptions.find((option) => option.id === selectedCampaign)
  const writeEnabled = actionEnabled(campaign)
  const recipient = assignments?.items.find((item) => item.cueAnexo === selectedRecipient && isAssignment(item))
  const recipientBalances = overview?.balances.filter((row) => row.cabeceraCueAnexo === recipient?.cabeceraCueAnexo) ?? []
  const recommendationKey = `${selectedCampaign}:${selectedRecipient}`
  const recommendations = recommendationResult?.key === recommendationKey ? recommendationResult.rows : null
  const recommendationError = recommendationIssue?.key === recommendationKey ? recommendationIssue.error : null
  const applicableRecommendations = recommendations?.filter((row) => recipientBalances.some((balance) => balance.productId === row.productId)) ?? []

  async function selectCampaign(campaignId: string) {
    setSelectedCampaign(campaignId)
    setLoading(true)
    setError(null)
    setNotice(null)
    try { await loadOverview(campaignId) }
    catch (reason) { setOverview(null); setError(reason instanceof Error ? reason.message : 'No se pudo cargar el catálogo y los saldos.') }
    finally { setLoading(false) }
  }

  async function postJson(url: string, body: unknown) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await readJson(response)
    if (!response.ok) throw new Error(errorText(data, 'No se pudo completar la operación.'))
    return data
  }

  async function updateStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCampaign || !stockProduct || !writeEnabled) return
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

  async function updateQuota(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCampaign || !quotaHead || !quotaProduct || !writeEnabled) return
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

  async function createRequest(submit: boolean) {
    if (!selectedCampaign || !recipient || !writeEnabled || !applicableRecommendations.length) return
    const lines = applicableRecommendations.flatMap((row) => {
      const quantity = Number(quantities[row.productId])
      return Number.isSafeInteger(quantity) && quantity > 0 ? [{ productId: row.productId, quantity }] : []
    })
    if (!lines.length) { setError('Ingresá al menos una cantidad positiva.'); return }
    const input = { campaignId: selectedCampaign, recipientCueAnexo: recipient.cueAnexo, lines, submit }
    const fingerprint = JSON.stringify(input)
    if (submitIntent.current?.body !== fingerprint) submitIntent.current = { body: fingerprint, key: crypto.randomUUID() }
    setSaving(true); setError(null); setNotice(null)
    try {
      await postJson('/api/cuadernillos/requests', { ...input, idempotencyKey: submitIntent.current.key })
      submitIntent.current = null
      setNotice(submit ? 'Solicitud enviada para revisión.' : 'Borrador guardado.')
      onRequestCreated()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo crear la solicitud.') }
    finally { setSaving(false) }
  }

  const balanceRows = overview?.balances ?? []
  return (
    <section aria-labelledby="overview-title" style={{ marginTop: '2rem' }}>
      <h3 id="overview-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
        Catálogo y disponibilidad
      </h3>
      {loading && !overview ? <p role="status" style={{ color: 'var(--ink-soft)' }}>Cargando catálogo y saldos…</p> : null}
      {error ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{error}</p> : null}
      {notice ? <p role="status" style={{ color: 'var(--success-ink, var(--ink))' }}>{notice}</p> : null}

      {overview?.campaignOptions.length ? (
        <div style={{ margin: '.85rem 0 1.25rem' }}>
          {overview.campaignOptions.length > 1 ? (
            <label style={{ display: 'grid', gap: '.35rem', maxWidth: '28rem', color: 'var(--ink-soft)' }}>
              Campaña
              <select value={selectedCampaign} onChange={(event) => void selectCampaign(event.target.value)} disabled={loading || saving}>
                <option value="">Seleccioná una campaña</option>
                {overview.campaignOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
              </select>
            </label>
          ) : <p style={{ color: 'var(--ink-soft)' }}>Campaña: <strong>{overview.campaignOptions[0].name}</strong></p>}
          {selectedCampaign && !writeEnabled ? <p style={{ borderLeft: '3px solid var(--marker)', paddingLeft: '.75rem', color: 'var(--ink-soft)' }}>La campaña no permite operaciones de distribución hasta que Planeamiento confirme la política.</p> : null}
        </div>
      ) : null}
      {overview && overview.campaignOptions.length === 0 ? <p style={{ color: 'var(--ink-soft)' }}>No hay campañas activas para consultar.</p> : null}
      {overview && overview.campaignOptions.length > 1 && !selectedCampaign ? <p style={{ color: 'var(--ink-soft)' }}>Elegí una campaña para consultar sus saldos.</p> : null}

      {overview?.campaignId && capability === 'planning' ? (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <caption style={{ textAlign: 'left', padding: '.5rem 0', color: 'var(--ink-soft)' }}>Saldos vigentes; el cupo disponible es el remanente actual, no el total originalmente asignado.</caption>
              <thead><tr><th scope="col">Producto</th><th scope="col">Stock global</th><th scope="col">Cabecera</th><th scope="col">Cupo disponible</th></tr></thead>
              <tbody>{balanceRows.map((row) => (
                <tr key={`${row.productId}:${row.cabeceraCueAnexo ?? 'no-head'}`}>
                  <th scope="row">{row.productLabel}</th>
                  <td>{row.globalAvailable === null ? 'No disponible' : row.globalAvailable}</td>
                  <td>{row.cabeceraName ? `${row.cabeceraName} · ${row.cabeceraCueAnexo}` : 'Sin cabeceras confirmadas'}</td>
                  <td>{row.quotaAvailable === null ? 'No disponible' : row.quotaAvailable}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {writeEnabled && products.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))', gap: '1.25rem', marginTop: '1.5rem' }}>
              <form onSubmit={(event) => void updateStock(event)} style={{ display: 'grid', alignContent: 'start', gap: '.75rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
                <h4 style={{ margin: 0, color: 'var(--ink)' }}>Registrar stock global</h4>
                <label>Producto<select value={stockProduct} onChange={(event) => setStockProduct(event.target.value)}>{products.map((row) => <option key={row.productId} value={row.productId}>{row.productLabel}</option>)}</select></label>
                <label>Movimiento<select value={stockMovement} onChange={(event) => setStockMovement(event.target.value as 'initial' | 'replenishment')}><option value="initial">Ingreso inicial</option><option value="replenishment">Reposición</option></select></label>
                <label>Cantidad<input aria-label="Cantidad de stock" type="number" min="1" step="1" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} /></label>
                <button type="submit" disabled={saving} className="ui-button ui-button--primary">{saving ? 'Guardando…' : 'Registrar movimiento'}</button>
              </form>
              <form onSubmit={(event) => void updateQuota(event)} style={{ display: 'grid', alignContent: 'start', gap: '.75rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
                <h4 style={{ margin: 0, color: 'var(--ink)' }}>Definir cupo disponible</h4>
                <label>Cabecera<select value={quotaHead} onChange={(event) => setQuotaHead(event.target.value)}>{heads.map((head) => <option value={head.cueAnexo} key={head.cueAnexo}>{head.name} · {head.cueAnexo}</option>)}</select></label>
                <label>Producto<select value={quotaProduct} onChange={(event) => setQuotaProduct(event.target.value)}>{products.map((row) => <option key={row.productId} value={row.productId}>{row.productLabel}</option>)}</select></label>
                <label>Cantidad disponible<input aria-label="Cantidad de cupo disponible" type="number" min="0" step="1" value={quotaQuantity} onChange={(event) => setQuotaQuantity(event.target.value)} /></label>
                <button type="submit" disabled={saving || !heads.length} className="ui-button ui-button--secondary">{saving ? 'Guardando…' : 'Guardar cupo'}</button>
              </form>
            </div>
          ) : null}
        </>
      ) : null}

      {overview?.campaignId && capability === 'cabecera' ? (
        <>
          <p style={{ maxWidth: '52rem', color: 'var(--ink-soft)' }}>La matrícula y la elegibilidad se verifican en el servidor al consultar o enviar. Cantidades recomendadas son una referencia, no un máximo.</p>
          <label style={{ display: 'grid', gap: '.35rem', maxWidth: '32rem' }}>
            Escuela destinataria
            <select value={selectedRecipient} onChange={(event) => setSelectedRecipient(event.target.value)}>
              <option value="">Seleccioná una escuela dependiente</option>
              {(assignments?.items ?? []).filter(isAssignment).map((item) => <option key={item.cueAnexo} value={item.cueAnexo}>{item.schoolName} · {item.cueAnexo}</option>)}
            </select>
          </label>
          {selectedRecipient && recommendationError ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{recommendationError}</p> : null}
          {selectedRecipient && !recommendations && !recommendationError ? <p role="status">Calculando recomendación del corte vigente…</p> : null}
          {selectedRecipient && recommendations && applicableRecommendations.length === 0 ? <p style={{ color: 'var(--ink-soft)' }}>No hay productos confirmados para esta cabecera.</p> : null}
          {applicableRecommendations.map((row) => {
            const product = recipientBalances.find((balance) => balance.productId === row.productId)!
            const quota = product.quotaAvailable
            return (
              <div key={row.productId} style={{ display: 'grid', gridTemplateColumns: 'minmax(12rem, 1fr) minmax(10rem, .6fr) minmax(10rem, .6fr)', alignItems: 'end', gap: '.75rem', borderBottom: '1px solid var(--line)', padding: '.85rem 0' }}>
                <div><strong>{product.productLabel}</strong><p style={{ margin: '.25rem 0 0', color: 'var(--ink-soft)' }}>{row.suggested === null || row.students === null ? 'Recomendación no disponible para el corte vigente.' : `Recomendación: ${row.suggested} · matrícula: ${row.students}`}</p></div>
                <div style={{ color: 'var(--ink-soft)' }}>Cupo disponible: {quota === null ? 'No disponible' : quota}</div>
                <label style={{ display: 'grid', gap: '.3rem', color: 'var(--ink-soft)' }}>Cantidad propuesta<input aria-label={`Cantidad para ${product.productLabel}`} type="number" min="1" step="1" value={quantities[row.productId] ?? ''} onChange={(event) => setQuantities((current) => ({ ...current, [row.productId]: event.target.value }))} /></label>
              </div>
            )
          })}
          {applicableRecommendations.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', marginTop: '1rem' }}>
              <button type="button" onClick={() => void createRequest(false)} disabled={saving || !writeEnabled} className="ui-button ui-button--secondary">{saving ? 'Guardando…' : 'Guardar borrador'}</button>
              <button type="button" onClick={() => void createRequest(true)} disabled={saving || !writeEnabled} className="ui-button ui-button--primary">{saving ? 'Enviando…' : 'Enviar a revisión'}</button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
