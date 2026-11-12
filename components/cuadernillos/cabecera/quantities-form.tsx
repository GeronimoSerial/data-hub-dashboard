'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BookletBalanceView, EnrollmentRecommendation } from '@/lib/cuadernillos/types'
import { ERROR_LABELS, errorCode, isRecommendationList, readJson, scopedQuery, type CriticalSchool } from './cabecera-api'

export function QuantitiesForm({ school, campaignId, cabeceraCue, balances, readOnly, onSaved }: {
  school: CriticalSchool
  campaignId: string
  cabeceraCue: string
  balances: BookletBalanceView[]
  readOnly: boolean
  onSaved: (message: string) => void
}) {
  const [recommendations, setRecommendations] = useState<EnrollmentRecommendation[] | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<'submit' | 'draft' | null>(null)
  const intent = useRef<{ body: string; key: string } | null>(null)

  useEffect(() => {
    let active = true
    const query = scopedQuery({ cueAnexo: school.cueAnexo, cabeceraCueAnexo: cabeceraCue, campaignId })
    fetch(`/api/cuadernillos/recommendations?${query}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await readJson(response)
        if (!response.ok || !isRecommendationList(data)) throw new Error('No se pudo calcular la recomendación del corte vigente.')
        if (!active) return
        setRecommendations(data.recommendations)
        setQuantities(Object.fromEntries(data.recommendations.map((row) => [row.productId, String(row.suggested ?? 0)])))
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(reason instanceof Error ? reason.message : 'No se pudo calcular la recomendación.')
      })
    return () => { active = false }
  }, [school.cueAnexo, campaignId, cabeceraCue])

  const applicableProducts = useMemo(() => {
    const scoped = balances.filter((row) => row.cabeceraCueAnexo === cabeceraCue)
    return (recommendations ?? []).flatMap((row) => {
      const balance = scoped.find((candidate) => candidate.productId === row.productId)
      return balance ? [{ row, balance }] : []
    })
  }, [balances, cabeceraCue, recommendations])

  async function save(submit: boolean) {
    const lines = applicableProducts.flatMap(({ row, balance }) => {
      const quantity = Number(quantities[row.productId] ?? 0)
      const max = balance.quotaAvailable ?? Number.MAX_SAFE_INTEGER
      return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= max ? [{ productId: row.productId, quantity }] : []
    })
    if (!lines.length) { setFormError('Indicá al menos una cantidad entera positiva dentro del cupo disponible.'); return }
    const body = { campaignId, recipientCueAnexo: school.cueAnexo, cabeceraCueAnexo: cabeceraCue, lines, submit }
    const fingerprint = JSON.stringify(body)
    if (intent.current?.body !== fingerprint) intent.current = { body: fingerprint, key: crypto.randomUUID() }
    setSubmitting(submit ? 'submit' : 'draft')
    setFormError(null)
    try {
      const response = await fetch('/api/cuadernillos/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey: intent.current.key }),
      })
      const data = await readJson(response)
      if (!response.ok) throw new Error(ERROR_LABELS[errorCode(data)] ?? 'No se pudo guardar el pedido. Intentá nuevamente.')
      intent.current = null
      onSaved(submit ? `Pedido enviado a revisión para ${school.nombre}.` : `Borrador guardado para ${school.nombre}.`)
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'No se pudo guardar el pedido.')
    } finally {
      setSubmitting(null)
    }
  }

  const busy = submitting !== null
  const canWrite = !readOnly && !busy && applicableProducts.length > 0 && Boolean(campaignId)

  if (loadError) return <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{loadError}</p>
  if (!recommendations) return <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Calculando recomendación…</p>

  const totalUnits = applicableProducts.reduce((sum, { row }) => {
    const quantity = Number(quantities[row.productId] ?? 0)
    return Number.isSafeInteger(quantity) && quantity > 0 ? sum + quantity : sum
  }, 0)

  const actions = (
    <div className="cab-qty-actions">
      <Button type="button" variant="secondary" disabled={!canWrite} onClick={() => void save(false)}>
        {submitting === 'draft' ? 'Guardando…' : 'Guardar borrador'}
      </Button>
      <Button type="button" variant="default" disabled={!canWrite} onClick={() => void save(true)}>
        {submitting === 'submit' ? 'Enviando…' : 'Enviar pedido'}
      </Button>
    </div>
  )

  return (
    <div className="cab-stack">
      {applicableProducts.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No hay productos con cupo para esta cabecera.</p>
      ) : (
        <div className="cab-qty-wrap">
          <table className="cab-qty">
            <caption className="sr-only">Cantidades para {school.nombre}</caption>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Recomendado</th>
                <th scope="col">Disponible</th>
                <th scope="col">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {applicableProducts.map(({ row, balance }) => (
                <tr key={row.productId}>
                  <th scope="row" className="cab-qty-product">{balance.productLabel}</th>
                  <td data-label="Recomendado">{row.suggested ?? '—'}</td>
                  <td data-label="Disponible">{balance.quotaAvailable ?? '—'}</td>
                  <td data-label="Cantidad">
                    <Input
                      aria-label={`Cantidad · ${balance.productLabel}`}
                      className="cab-qty-input"
                      type="number" min="1" step="1" inputMode="numeric" disabled={readOnly}
                      max={balance.quotaAvailable ?? undefined}
                      value={quantities[row.productId] ?? '0'}
                      onChange={(event) => setQuantities((current) => ({ ...current, [row.productId]: event.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>
                  <div className="cab-qty-foot">
                    <span style={{ color: 'var(--ink)' }}>Total: <strong>{totalUnits}</strong></span>
                    {actions}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {applicableProducts.length === 0 ? actions : null}
      {formError ? <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{formError}</p> : null}
    </div>
  )
}
