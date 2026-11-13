'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { BookletBalanceView, EnrollmentRecommendation } from '@/lib/cuadernillos/types'
import { DrawerBody, DrawerFoot, EmptyState, Note, Stepper } from '../kit'
import { ERROR_LABELS, errorCode, isRecommendationList, readJson, scopedQuery, type CriticalSchool } from './cabecera-api'

export function QuantitiesForm({ school, campaignId, cabeceraCue, balances, onSaved, top }: {
  school: CriticalSchool
  campaignId: string
  cabeceraCue: string
  balances: BookletBalanceView[]
  onSaved: (message: string) => void
  top?: ReactNode
}) {
  const [recommendations, setRecommendations] = useState<EnrollmentRecommendation[] | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
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
        setQuantities(Object.fromEntries(data.recommendations.map((row) => [row.productId, row.suggested ?? 0])))
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
      const quantity = quantities[row.productId] ?? 0
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
  const canWrite = !busy && applicableProducts.length > 0 && Boolean(campaignId)

  if (loadError) return <DrawerBody>{top}<Note tone="danger">{loadError}</Note></DrawerBody>
  if (!recommendations) return <DrawerBody>{top}<p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Calculando recomendación…</p></DrawerBody>

  const totalUnits = applicableProducts.reduce((sum, { row, balance }) => {
    const quantity = quantities[row.productId] ?? 0
    const max = balance.quotaAvailable ?? Number.MAX_SAFE_INTEGER
    return quantity > 0 && quantity <= max ? sum + quantity : sum
  }, 0)

  return (
    <>
      <DrawerBody>
        {top}
        {applicableProducts.length === 0 ? (
          <EmptyState title="Sin cupo para esta cabecera" description="Planeamiento todavía no asignó cupo de cuadernillos a esta cabecera." />
        ) : (
          <>
            <ul className="k-qty-list" aria-label={`Cantidades para ${school.nombre}`}>
              {applicableProducts.map(({ row, balance }) => {
                const quantity = quantities[row.productId] ?? 0
                const noQuota = (balance.quotaAvailable ?? 0) <= 0
                return (
                  <li key={row.productId} className="k-qty-row" data-active={quantity > 0}>
                    <div className="k-row-main">
                      <span className="k-row-title">{balance.productLabel}</span>
                      <span className="k-row-meta">
                        Disponible {balance.quotaAvailable ?? '—'}{row.suggested ? ` · Recomendado ${row.suggested}` : ''}
                      </span>
                    </div>
                    <Stepper
                      label={`Cantidad · ${balance.productLabel}`}
                      value={quantity}
                      max={balance.quotaAvailable ?? undefined}
                      disabled={busy || noQuota}
                      onChange={(next) => setQuantities((current) => ({ ...current, [row.productId]: next }))}
                    />
                  </li>
                )
              })}
            </ul>
            <div className="k-total"><span>Total del pedido</span><strong>{totalUnits}</strong></div>
          </>
        )}
        {formError ? <Note tone="danger">{formError}</Note> : null}
      </DrawerBody>
      <DrawerFoot>
        <Button type="button" variant="secondary" disabled={!canWrite} onClick={() => void save(false)}>
          {submitting === 'draft' ? 'Guardando…' : 'Guardar borrador'}
        </Button>
        <Button type="button" variant="default" disabled={!canWrite} onClick={() => void save(true)}>
          {submitting === 'submit' ? 'Enviando…' : 'Enviar pedido'}
        </Button>
      </DrawerFoot>
    </>
  )
}
