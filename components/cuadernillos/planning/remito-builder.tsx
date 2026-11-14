'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { dashedCue, errorCode, isRecommendationList, readJson, type CriticalSchool } from '../cabecera/cabecera-api'
import { SchoolSearch, useSchoolSearchState } from '../cabecera/school-search'
import { Chip, EmptyState, Modal, ModalBody, ModalFoot, Note, Stepper, formatCount, shortProduct } from '../kit'
import { dispatchErrorMessage, isCabeceraList, type ConfirmedCabecera, type ProductOption } from './remito-api'

type Step = 'destino' | 'cantidades' | 'revision'
type Quantities = Record<string, Record<string, number>>

const CABECERAS_ERROR = 'No se pudieron cargar las cabeceras confirmadas.'

export function RemitoBuilder({ open, campaignId, products, onClose, onDispatched }: {
  open: boolean
  campaignId: string
  products: ProductOption[]
  onClose: () => void
  onDispatched: () => void
}) {
  return (
    <Modal open={open} title="Nuevo remito" description="Un remito por cabecera, con una línea por escuela destino." onClose={onClose}>
      {open ? <BuilderForm campaignId={campaignId} products={products} onClose={onClose} onDispatched={onDispatched} /> : null}
    </Modal>
  )
}

function BuilderForm({ campaignId, products, onClose, onDispatched }: {
  campaignId: string
  products: ProductOption[]
  onClose: () => void
  onDispatched: () => void
}) {
  // One key per dialog: a retry after a failed or lost response replays the same dispatch instead of duplicating it.
  const idempotencyKey = useRef(crypto.randomUUID())
  const [step, setStep] = useState<Step>('destino')
  const [cabeceras, setCabeceras] = useState<ConfirmedCabecera[] | null>(null)
  const [cabeceraError, setCabeceraError] = useState<string | null>(null)
  const [cabeceraFilter, setCabeceraFilter] = useState('')
  const [cabecera, setCabecera] = useState<ConfirmedCabecera | null>(null)
  const [schools, setSchools] = useState<CriticalSchool[]>([])
  const [quantities, setQuantities] = useState<Quantities>({})
  const [loadingRecs, setLoadingRecs] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const search = useSchoolSearchState()

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/cuadernillos/cabeceras', { cache: 'no-store', signal: controller.signal })
        const data = await readJson(response)
        if (!response.ok || !isCabeceraList(data)) throw new Error(CABECERAS_ERROR)
        setCabeceras(data.cabeceras.filter((row) => row.status === 'confirmada'))
      } catch {
        if (!controller.signal.aborted) setCabeceraError(CABECERAS_ERROR)
      }
    })()
    return () => controller.abort()
  }, [])

  const labels = useMemo(() => new Map(products.map((p) => [p.productId, p.productLabel])), [products])
  const schoolNames = useMemo(() => new Map(schools.map((s) => [s.cueAnexo, s.nombre])), [schools])
  const visibleCabeceras = (cabeceras ?? []).filter((row) =>
    !cabeceraFilter.trim() || `${row.nombre} ${row.cue}`.toLowerCase().includes(cabeceraFilter.trim().toLowerCase()))

  const totals = useMemo(() => products.map((product) => ({
    ...product,
    requested: schools.reduce((sum, school) => sum + (quantities[school.cueAnexo]?.[product.productId] ?? 0), 0),
  })), [products, schools, quantities])
  const lines = schools
    .map((school) => ({
      recipientCueAnexo: school.cueAnexo,
      items: products.flatMap((product) => {
        const quantity = quantities[school.cueAnexo]?.[product.productId] ?? 0
        return quantity > 0 ? [{ productId: product.productId, quantity }] : []
      }),
    }))
    .filter((line) => line.items.length > 0)
  const short = totals.filter((row) => row.requested > row.available)

  async function addSchool(school: CriticalSchool) {
    if (!cabecera || schools.some((row) => row.cueAnexo === school.cueAnexo)) return
    setSchools((current) => [...current, school])
    setQuantities((current) => ({ ...current, [school.cueAnexo]: {} }))
    setLoadingRecs((current) => [...current, school.cueAnexo])
    try {
      const query = new URLSearchParams({ cueAnexo: school.cueAnexo, cabeceraCueAnexo: cabecera.cue, campaignId })
      const response = await fetch(`/api/cuadernillos/recommendations?${query}`, { cache: 'no-store' })
      const data = await readJson(response)
      if (response.ok && isRecommendationList(data)) {
        const suggested = Object.fromEntries(data.recommendations.flatMap((row) =>
          row.suggested !== null && row.suggested > 0 ? [[row.productId, row.suggested]] : []))
        setQuantities((current) => ({ ...current, [school.cueAnexo]: { ...suggested, ...(current[school.cueAnexo] ?? {}) } }))
      }
    } catch {
      // No recommendation: the quantities stay at zero and the planner enters them by hand.
    } finally {
      setLoadingRecs((current) => current.filter((cue) => cue !== school.cueAnexo))
    }
  }

  function removeSchool(cue: string) {
    setSchools((current) => current.filter((school) => school.cueAnexo !== cue))
    setQuantities(({ [cue]: _removed, ...rest }) => rest)
  }

  function chooseCabecera(next: ConfirmedCabecera) {
    if (cabecera?.cue !== next.cue) { setSchools([]); setQuantities({}) }
    setCabecera(next)
  }

  async function dispatch() {
    if (!cabecera || lines.length === 0 || short.length > 0) return
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/cuadernillos/remitos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, cabeceraCueAnexo: cabecera.cue, idempotencyKey: idempotencyKey.current, lines }),
      })
      const data = await readJson(response)
      if (!response.ok) {
        setError(dispatchErrorMessage(data ?? { error: errorCode(data) }, labels, schoolNames))
        return
      }
      onDispatched()
    } catch {
      setError('No se pudo despachar el remito. Intentá nuevamente.')
    } finally {
      setSending(false)
    }
  }

  const pickable = search.results?.filter((school) => !schools.some((row) => row.cueAnexo === school.cueAnexo)) ?? null
  const searchState = { ...search, results: pickable && pickable.length === 0 && (search.results?.length ?? 0) > 0 ? null : pickable }
  const recsPending = loadingRecs.length > 0

  return (
    <>
      <ModalBody>
        {step === 'destino' ? (
          <>
            <div className="k-field">
              <span className="k-label">Cabecera que recibe el remito</span>
              {cabeceraError ? <Note tone="danger">{cabeceraError}</Note> : null}
              {!cabeceras && !cabeceraError ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando cabeceras…</p> : null}
              {cabeceras && cabeceras.length === 0 ? <EmptyState title="Sin cabeceras confirmadas" description="Confirmá una cabecera para poder despacharle remitos." /> : null}
              {cabeceras && cabeceras.length > 8 ? (
                <Input aria-label="Filtrar cabeceras" placeholder="Filtrar por nombre o CUE" value={cabeceraFilter} onChange={(event) => setCabeceraFilter(event.target.value)} />
              ) : null}
              <ul className="k-list">
                {visibleCabeceras.map((row) => (
                  <li key={row.cue}>
                    <button type="button" className="k-row" aria-pressed={cabecera?.cue === row.cue} onClick={() => chooseCabecera(row)}
                      style={cabecera?.cue === row.cue ? { borderColor: 'var(--ink)', background: 'var(--fill)' } : undefined}>
                      <span className="k-row-main">
                        <span className="k-row-title">{row.nombre}</span>
                        <span className="k-row-meta">CUE {dashedCue(row.cue)} · {row.departamento}</span>
                      </span>
                      {cabecera?.cue === row.cue ? <span className="k-row-side"><Chip tone="ok">Elegida</Chip></span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {cabecera ? (
              <div className="k-field">
                <span className="k-label">Escuelas destino</span>
                <SchoolSearch selected={null} onChoose={(school) => void addSchool(school)} onClear={() => undefined} state={searchState} />
                {schools.length > 0 ? (
                  <ul className="k-list" aria-label="Escuelas del remito">
                    {schools.map((school) => (
                      <li key={school.cueAnexo} className="k-row">
                        <span className="k-row-main">
                          <span className="k-row-title">{school.nombre}</span>
                          <span className="k-row-meta">CUE {dashedCue(school.cueAnexo)}</span>
                        </span>
                        <span className="k-row-side">
                          <Button type="button" variant="ghost" aria-label={`Quitar ${school.nombre}`} onClick={() => removeSchool(school.cueAnexo)}>
                            <X aria-hidden size={16} />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {step === 'cantidades' ? (
          <>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Cantidades sugeridas por matrícula (1 por estudiante). Podés ajustarlas.</p>
            {schools.map((school) => (
              <fieldset key={school.cueAnexo} style={{ margin: 0, padding: 0, border: 0, display: 'grid', gap: '.5rem', minWidth: 0 }}>
                <legend className="k-row-title">{school.nombre}</legend>
                <ul className="k-qty-list">
                  {products.map((product) => (
                    <li key={product.productId} className="k-qty-row">
                      <span className="k-row-title">{shortProduct(product.productLabel)}</span>
                      <Stepper
                        label={`${school.nombre} · ${product.productLabel}`}
                        value={quantities[school.cueAnexo]?.[product.productId] ?? 0}
                        onChange={(value) => setQuantities((current) => ({ ...current, [school.cueAnexo]: { ...(current[school.cueAnexo] ?? {}), [product.productId]: value } }))}
                      />
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
          </>
        ) : null}

        {step === 'revision' ? (
          <>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
              Remito para {cabecera?.nombre} con {lines.length} escuela{lines.length === 1 ? '' : 's'}.
            </p>
            <ul className="k-qty-list" aria-label="Totales contra stock">
              {totals.filter((row) => row.requested > 0 || row.available > 0).map((row) => (
                <li key={row.productId} className="k-qty-row" data-active={row.requested > row.available ? 'true' : undefined}>
                  <span className="k-row-main">
                    <span className="k-row-title">{row.productLabel}</span>
                    <span className="k-row-meta">Despacho {formatCount(row.requested)} · Stock {formatCount(row.available)}</span>
                  </span>
                  {row.requested > row.available
                    ? <Chip tone="danger">Faltan {formatCount(row.requested - row.available)}</Chip>
                    : <Chip tone="ok">Alcanza</Chip>}
                </li>
              ))}
            </ul>
            {short.length > 0 ? <Note tone="danger">El stock no alcanza para {short.map((row) => row.productLabel).join(', ')}. Volvé a ajustar las cantidades.</Note> : null}
            {lines.length === 0 ? <Note tone="danger">El remito no tiene cantidades para despachar.</Note> : null}
          </>
        ) : null}

        {error ? <Note tone="danger">{error}</Note> : null}
      </ModalBody>
      <ModalFoot>
        {step !== 'destino' ? (
          <Button type="button" variant="secondary" disabled={sending} onClick={() => setStep(step === 'revision' ? 'cantidades' : 'destino')}>Atrás</Button>
        ) : (
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        )}
        {step === 'destino' ? (
          <Button type="button" disabled={!cabecera || schools.length === 0 || recsPending} onClick={() => setStep('cantidades')}>
            {recsPending ? 'Buscando sugeridos…' : 'Siguiente'}
          </Button>
        ) : null}
        {step === 'cantidades' ? (
          <Button type="button" disabled={lines.length === 0} onClick={() => setStep('revision')}>Revisar</Button>
        ) : null}
        {step === 'revision' ? (
          <Button type="button" disabled={sending || lines.length === 0 || short.length > 0} onClick={() => void dispatch()}>
            {sending ? 'Despachando…' : 'Despachar remito'}
          </Button>
        ) : null}
      </ModalFoot>
    </>
  )
}
