'use client'

import { useEffect, useState } from 'react'
import type { BookletCampaignOption } from '@/lib/cuadernillos/types'
import { CabeceraStyles } from './cabecera-styles'
import { ChoiceGroup } from './choice-group'
import { Button } from '@/components/ui/button'
import {
  isAssignmentsPage, isOverview, loadJson, scopedQuery,
  type CabeceraChoice, type CriticalSchool, type Overview,
} from './cabecera-api'
import { MyRequests } from './my-requests'
import { QuantitiesForm } from './quantities-form'
import { SchoolSearch } from './school-search'

export function CabeceraHome() {
  const [ownCabeceras, setOwnCabeceras] = useState<CabeceraChoice[] | null>(null)
  const [cabeceraError, setCabeceraError] = useState<string | null>(null)
  const [pickedCue, setPickedCue] = useState<string | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState('')
  const [selected, setSelected] = useState<CriticalSchool | null>(null)
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
    setSelected(null)
    setNotice(null)
  }

  function pickCampaign(id: string) {
    setCampaignId(id)
    setSelected(null)
  }

  function retryLoads() {
    setCabeceraError(null)
    setOverviewError(null)
    setRetryKey((value) => value + 1)
  }

  function saved(message: string) {
    setNotice(message)
    setSelected(null)
    setRefreshKey((value) => value + 1)
  }

  return (
    <section aria-labelledby="cabecera-home-title" className="cab-section" style={{ minWidth: 0 }}>
      <CabeceraStyles />
      <div className="cab-stack" style={{ minWidth: 0 }}>
        <header style={{ display: 'grid', gap: '.25rem' }}>
          <h2 id="cabecera-home-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.35rem, 3vw, 1.75rem)', lineHeight: 1.15 }}>
            Nuevo pedido
          </h2>
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Buscá la escuela por CUE. Solo aparecen escuelas en severidad Crítica.</p>
        </header>

        {cabeceraError ? (
          <div className="cab-stack" style={{ gap: '.5rem', justifyItems: 'start' }}>
            <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{cabeceraError}</p>
            <Button type="button" variant="secondary" onClick={retryLoads}>Reintentar</Button>
          </div>
        ) : null}
        {loadingCabeceras && !cabeceraError ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando cabeceras…</p> : null}

        {cabeceraOptions.length > 1 ? (
          <div className="cab-stack" style={{ gap: '.5rem' }}>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Cabecera que pide</span>
            <ChoiceGroup
              label="Cabecera que pide"
              value={activeCue ?? ''}
              onPick={pickCabecera}
              options={cabeceraOptions.map((option) => ({ value: option.cue, label: `${option.nombre} · CUE ${option.cue}` }))}
            />
          </div>
        ) : null}
        {noCabecera && ownCabeceras?.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Esta cuenta no tiene una cabecera asignada para pedir cuadernillos.</p>
        ) : null}

        {overviewError ? (
          <div className="cab-stack" style={{ gap: '.5rem', justifyItems: 'start' }}>
            <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{overviewError}</p>
            <Button type="button" variant="secondary" onClick={retryLoads}>Reintentar</Button>
          </div>
        ) : null}
        {campaignOptions.length > 1 ? (
          <div style={{ display: 'grid', gap: '.5rem' }}>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Campaña</span>
            <ChoiceGroup
              label="Campaña"
              value={campaignId}
              onPick={pickCampaign}
              options={campaignOptions.map((campaign) => ({ value: campaign.id, label: campaign.name }))}
            />
          </div>
        ) : null}

        {activeCue ? (
          <>
            <SchoolSearch
              selected={selected}
              onChoose={(school) => { setSelected(school); setNotice(null) }}
              onClear={() => setSelected(null)}
            />
            {selected && overview && campaignId ? (
              <div className="cab-stack">
                <QuantitiesForm
                  key={`${selected.cueAnexo}:${activeCue}:${campaignId}`}
                  school={selected}
                  campaignId={campaignId}
                  cabeceraCue={activeCue}
                  balances={overview.balances}
                  onSaved={saved}
                />
              </div>
            ) : null}
            {!overview && !overviewError ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando campaña…</p> : null}
            {overview && !campaignId ? <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No hay una campaña activa para pedir cuadernillos.</p> : null}
          </>
        ) : null}

        {notice ? <p role="status" style={{ margin: 0, color: 'var(--ink)', fontWeight: 600 }}>{notice}</p> : null}
      </div>

      <MyRequests refreshKey={refreshKey} onRequested={saved} />
    </section>
  )
}
