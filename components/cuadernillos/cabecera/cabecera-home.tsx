'use client'

import { useEffect, useState } from 'react'
import type { BookletCampaignOption } from '@/lib/cuadernillos/types'
import { Button } from '@/components/ui/button'
import { EmptyState, KpiStrip, Note, PageHeader, Panel, Segmented, formatCount, shortProduct } from '../kit'
import {
  isAssignmentsPage, isOverview, loadJson, scopedQuery,
  type CabeceraChoice, type Overview,
} from './cabecera-api'
import { MyRequests } from './my-requests'
import { NewRequestModal } from './new-request-modal'

export function CabeceraHome() {
  const [ownCabeceras, setOwnCabeceras] = useState<CabeceraChoice[] | null>(null)
  const [cabeceraError, setCabeceraError] = useState<string | null>(null)
  const [pickedCue, setPickedCue] = useState<string | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [retryKey, setRetryKey] = useState(0)

  // Each load owns its state: it ends in data or in an error (never a silent drop), and a
  // timeout in loadJson turns a request that never answers into that error.
  useEffect(() => {
    let active = true
    const load = loadJson(
      `/api/cuadernillos/assignments?${scopedQuery({ capability: 'cabecera' })}`,
      isAssignmentsPage,
      'No se pudieron cargar las cabeceras de esta cuenta.',
    )
    load.promise
      .then((data) => {
        if (!active) return
        setOwnCabeceras(data.items
          .filter((item) => item.relationship === 'cabecera')
          .map((item) => ({ cue: item.cueAnexo, nombre: item.schoolName })))
        setCabeceraError(null)
      })
      .catch((reason: unknown) => {
        if (active) setCabeceraError(reason instanceof Error ? reason.message : 'No se pudieron cargar las cabeceras de esta cuenta.')
      })
    return () => { active = false; load.cancel() }
  }, [retryKey])

  useEffect(() => {
    let active = true
    const load = loadJson(
      `/api/cuadernillos/overview?${scopedQuery({ capability: 'cabecera', campaignId })}`,
      isOverview,
      'No se pudo cargar la campaña.',
    )
    load.promise
      .then((data) => {
        if (!active) return
        setOverview(data)
        setOverviewError(null)
        const activeCampaign = data.campaignId
        if (activeCampaign) setCampaignId((current) => current || activeCampaign)
      })
      .catch((reason: unknown) => {
        if (active) setOverviewError(reason instanceof Error ? reason.message : 'No se pudo cargar la campaña.')
      })
    return () => { active = false; load.cancel() }
  }, [campaignId, retryKey])

  const cabeceraOptions = ownCabeceras ?? []
  const activeCue = pickedCue && cabeceraOptions.some((option) => option.cue === pickedCue)
    ? pickedCue
    : cabeceraOptions[0]?.cue ?? null
  const campaignOptions: BookletCampaignOption[] = overview?.campaignOptions ?? []
  const loadingCabeceras = ownCabeceras === null
  const noCabecera = !loadingCabeceras && !activeCue && !cabeceraError

  function pickCabecera(cue: string) {
    setPickedCue(cue)
    setNotice(null)
  }

  function pickCampaign(id: string) {
    setCampaignId(id)
  }

  function retryLoads() {
    setCabeceraError(null)
    setOverviewError(null)
    setRetryKey((value) => value + 1)
  }

  function saved(message: string) {
    setNotice(message)
    setModalOpen(false)
    setRefreshKey((value) => value + 1)
  }

  const activeCabecera = cabeceraOptions.find((option) => option.cue === activeCue) ?? null
  const quotas = (overview?.balances ?? []).filter((row) => row.cabeceraCueAnexo === activeCue)
  const totalQuota = quotas.reduce((sum, row) => sum + (row.quotaAvailable ?? 0), 0)
  const canRequest = Boolean(activeCue && overview && campaignId)

  return (
    <section aria-labelledby="cabecera-home-title" className="k-stack">
      <PageHeader
        id="cabecera-home-title"
        title={activeCabecera ? activeCabecera.nombre : 'Pedidos de cuadernillos'}
        description={activeCabecera ? `CUE ${activeCabecera.cue} · Pedí cuadernillos para las escuelas de tu zona.` : 'Pedí cuadernillos para las escuelas de tu zona.'}
        action={<Button type="button" disabled={!canRequest} onClick={() => { setNotice(null); setModalOpen(true) }}>Nuevo pedido</Button>}
      />

      {cabeceraError ? (
        <div className="k-stack" style={{ gap: '.5rem', justifyItems: 'start' }}>
          <Note tone="danger">{cabeceraError}</Note>
          <Button type="button" variant="secondary" onClick={retryLoads}>Reintentar</Button>
        </div>
      ) : null}
      {loadingCabeceras && !cabeceraError ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando cabeceras…</p> : null}

      {cabeceraOptions.length > 1 ? (
        <Segmented
          label="Cabecera que pide"
          value={activeCue ?? ''}
          onChange={pickCabecera}
          options={cabeceraOptions.map((option) => ({ value: option.cue, label: `${option.nombre} · CUE ${option.cue}` }))}
        />
      ) : null}
      {noCabecera && ownCabeceras?.length === 0 ? (
        <EmptyState title="Sin cabecera asignada" description="Esta cuenta no tiene una cabecera asignada para pedir cuadernillos." />
      ) : null}

      {overviewError ? (
        <div className="k-stack" style={{ gap: '.5rem', justifyItems: 'start' }}>
          <Note tone="danger">{overviewError}</Note>
          <Button type="button" variant="secondary" onClick={retryLoads}>Reintentar</Button>
        </div>
      ) : null}
      {campaignOptions.length > 1 ? (
        <Segmented
          label="Campaña"
          value={campaignId}
          onChange={pickCampaign}
          options={campaignOptions.map((campaign) => ({ value: campaign.id, label: campaign.name }))}
        />
      ) : null}
      {!overview && !overviewError ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando campaña…</p> : null}
      {overview && !campaignId ? <EmptyState title="Sin campaña activa" description="No hay una campaña activa para pedir cuadernillos." /> : null}

      {notice ? <Note tone="ok">{notice}</Note> : null}

      {activeCue && overview && campaignId ? (
        <Panel title="Cupo disponible" aside={`${formatCount(totalQuota)} en total`}>
          {quotas.length === 0 || totalQuota === 0 ? (
            <EmptyState title="Todavía no tenés cupo asignado" description="Planeamiento define cuántos cuadernillos de cada grado podés pedir. Cuando lo asigne, lo ves acá." />
          ) : (
            <KpiStrip label="Cupo por grado" items={quotas.map((row) => ({
              label: shortProduct(row.productLabel),
              value: formatCount(row.quotaAvailable ?? 0),
              tone: (row.quotaAvailable ?? 0) === 0 ? 'warn' : undefined,
            }))} />
          )}
        </Panel>
      ) : null}

      <MyRequests refreshKey={refreshKey} onRequested={saved} />

      {activeCue && overview && campaignId ? (
        <NewRequestModal
          open={modalOpen}
          cabeceraCue={activeCue}
          campaignId={campaignId}
          balances={overview.balances}
          onClose={() => setModalOpen(false)}
          onSaved={saved}
        />
      ) : null}
    </section>
  )
}
