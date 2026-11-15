'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { dashedCue, errorCode, isRecommendationList, readJson, type CriticalSchool } from '../cabecera/cabecera-api'
import { SchoolSearch, useSchoolSearchState } from '../cabecera/school-search'
import { EmptyState, Modal, ModalBody, ModalFoot, Note, Stepper, formatCount, shortProduct } from '../kit'
import { dispatchErrorMessage, isCabeceraList, type ConfirmedCabecera, type ProductOption } from './remito-api'

type Step = 'cabecera' | 'escuelas' | 'revision'
type Quantities = Record<string, Record<string, number>>

const STEPS: { id: Step; label: string }[] = [
  { id: 'cabecera', label: '¿A qué cabecera?' },
  { id: 'escuelas', label: '¿Qué escuelas y cuántos?' },
  { id: 'revision', label: 'Revisar y enviar' },
]

const CABECERAS_ERROR = 'No se pudieron cargar las escuelas cabecera.'

export function RemitoBuilder({ open, campaignId, products, onClose, onDispatched }: {
  open: boolean
  campaignId: string
  products: ProductOption[]
  onClose: () => void
  onDispatched: () => void
}) {
  return (
    <Modal open={open} size="wide" title="Enviar cuadernillos" description="Cada envío va a una escuela cabecera, que después lo reparte a sus escuelas." onClose={onClose}>
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
  const [step, setStep] = useState<Step>('cabecera')
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
  const stockLeft = useMemo(() => new Map(products.map((p) => [p.productId, p.available])), [products])
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
        setError(dispatchErrorMessage(data ?? { error: errorCode(data) }, labels, schoolNames, stockLeft))
        return
      }
      onDispatched()
    } catch {
      setError('No se pudo enviar. Intentá nuevamente.')
    } finally {
      setSending(false)
    }
  }

  const pickable = search.results?.filter((school) => !schools.some((row) => row.cueAnexo === school.cueAnexo)) ?? null
  const searchState = { ...search, results: pickable && pickable.length === 0 && (search.results?.length ?? 0) > 0 ? null : pickable }
  const recsPending = loadingRecs.length > 0
  const stepIndex = STEPS.findIndex((item) => item.id === step)
  const totalUnits = totals.reduce((sum, row) => sum + row.requested, 0)
  const schoolTotal = (cue: string) => products.reduce((sum, product) => sum + (quantities[cue]?.[product.productId] ?? 0), 0)

  return (
    <>
      <div className="pl-steps-bar">
        <ol aria-label="Pasos del envío" className="pl-steps">
          {STEPS.map((item, index) => (
            <li key={item.id} aria-current={index === stepIndex ? 'step' : undefined} data-state={index < stepIndex ? 'done' : undefined}>
              <span><span className="sr-only">{`${index + 1}. `}</span>{item.label}</span>
            </li>
          ))}
        </ol>
        {step !== 'cabecera' && cabecera ? (
          <p className="pl-dest">
            <span>Para</span> <strong>{cabecera.nombre}</strong> <span>· {cabecera.departamento}</span>
          </p>
        ) : null}
      </div>
      <ModalBody>
        {step === 'cabecera' ? (
          <div className="k-field">
            <span className="k-label">Elegí la escuela cabecera que recibe el envío</span>
            {cabeceraError ? <Note tone="danger">{cabeceraError}</Note> : null}
            {!cabeceras && !cabeceraError ? <p role="status" className="k-note">Cargando escuelas cabecera…</p> : null}
            {cabeceras && cabeceras.length === 0 ? <EmptyState title="Ninguna cabecera confirmó su cuenta" description="Una cabecera tiene que confirmar su cuenta para poder recibir envíos." /> : null}
            {cabeceras && cabeceras.length > 8 ? (
              <Input aria-label="Buscar cabecera" placeholder="Buscar por nombre o CUE" value={cabeceraFilter} onChange={(event) => setCabeceraFilter(event.target.value)} />
            ) : null}
            {cabeceras && cabeceras.length > 0 && visibleCabeceras.length === 0 ? <p className="k-note">Ninguna cabecera coincide con la búsqueda.</p> : null}
            <ul className="pl-pick">
              {visibleCabeceras.map((row) => (
                <li key={row.cue}>
                  <button type="button" aria-pressed={cabecera?.cue === row.cue} onClick={() => chooseCabecera(row)}>
                    <span className="pl-radio" aria-hidden="true" />
                    <span className="pl-pick-name">{row.nombre}</span>
                    <span className="pl-pick-meta">{row.departamento} · CUE {dashedCue(row.cue)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === 'escuelas' ? (
          <>
            <div className="pl-search">
              <SchoolSearch selected={null} onChoose={(school) => void addSchool(school)} onClear={() => undefined} state={searchState} />
            </div>
            {schools.length > 0 ? (
              <div className="pl-matrix-wrap">
                <p className="pl-matrix-hint">Cantidades sugeridas por matrícula (1 por estudiante). Podés ajustarlas.</p>
                <div className="pl-matrix" style={{ '--pl-cols': products.length } as CSSProperties}>
                  <div className="pl-mrow pl-mhead" aria-hidden="true">
                    <span>Escuela</span>
                    {products.map((product) => <span key={product.productId}>{shortProduct(product.productLabel).replace(/ grado$/i, '')}</span>)}
                    <span>Total</span>
                    <span />
                  </div>
                  {schools.map((school) => (
                    <div key={school.cueAnexo} role="group" aria-label={school.nombre} className="pl-mrow">
                      <span className="pl-mname">
                        <strong>{school.nombre}</strong>
                        <span>CUE {dashedCue(school.cueAnexo)}{loadingRecs.includes(school.cueAnexo) ? ' · Buscando sugeridos…' : ''}</span>
                      </span>
                      {products.map((product) => (
                        <span key={product.productId} className="pl-cell">
                          <span className="pl-cell-label" aria-hidden="true">{shortProduct(product.productLabel)}</span>
                          <Stepper
                            label={`${school.nombre} · ${product.productLabel}`}
                            value={quantities[school.cueAnexo]?.[product.productId] ?? 0}
                            onChange={(value) => setQuantities((current) => ({ ...current, [school.cueAnexo]: { ...(current[school.cueAnexo] ?? {}), [product.productId]: value } }))}
                          />
                        </span>
                      ))}
                      <span className="pl-mtotal" aria-label={`Total para ${school.nombre}`}>{formatCount(schoolTotal(school.cueAnexo))}</span>
                      <button type="button" className="pl-mremove" aria-label={`Quitar ${school.nombre}`} onClick={() => removeSchool(school.cueAnexo)}>
                        <X aria-hidden size={16} />
                      </button>
                    </div>
                  ))}
                  <div className="pl-mrow pl-mfoot" role="group" aria-label="Total del envío por grado">
                    <span className="pl-mname"><strong>Total del envío</strong></span>
                    {totals.map((row) => (
                      <span key={row.productId} className="pl-cell">
                        <span className="pl-cell-label" aria-hidden="true">{shortProduct(row.productLabel)}</span>
                        <span className="pl-msum">{formatCount(row.requested)}</span>
                      </span>
                    ))}
                    <span className="pl-mtotal">{formatCount(totalUnits)}</span>
                    <span />
                  </div>
                  <div className="pl-mrow pl-mfoot pl-mleft" role="group" aria-label="Stock que queda por grado">
                    <span className="pl-mname"><strong>Queda en stock</strong></span>
                    {totals.map((row) => (
                      <span key={row.productId} className="pl-cell" data-state={row.requested > row.available ? 'over' : undefined}>
                        <span className="pl-cell-label" aria-hidden="true">{shortProduct(row.productLabel)}</span>
                        <span className="pl-msum">{formatCount(row.available - row.requested)}</span>
                      </span>
                    ))}
                    <span />
                    <span />
                  </div>
                </div>
                {short.length > 0 ? (
                  <Note tone="danger">{`No alcanza el stock de ${short.map((row) => shortProduct(row.productLabel)).join(', ')}. Bajá las cantidades para poder enviar.`}</Note>
                ) : null}
              </div>
            ) : (
              <p className="pl-matrix-empty">Agregá al menos una escuela. Las cantidades se completan solas según la matrícula y las podés ajustar.</p>
            )}
          </>
        ) : null}

        {step === 'revision' ? (
          <div className="pl-review">
            <section className="k-receipt" aria-label="Detalle del envío">
              <header className="k-receipt-head">
                <span>Envío a</span>
                <strong>{cabecera?.nombre}</strong>
              </header>
              {lines.map((line) => (
                <div key={line.recipientCueAnexo} className="k-receipt-group">
                  <h4>{schoolNames.get(line.recipientCueAnexo) ?? line.recipientCueAnexo}</h4>
                  <dl>
                    {line.items.filter((item) => item.quantity > 0).map((item) => (
                      <div key={item.productId}>
                        <dt>{shortProduct(labels.get(item.productId) ?? item.productId)}</dt>
                        <dd>{formatCount(item.quantity)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              <p className="k-receipt-total">
                <span>Total</span>
                <strong>{formatCount(totalUnits)} cuadernillos</strong>
              </p>
            </section>
            {short.length > 0 ? <Note tone="danger">{`No alcanza el stock: ${short.map((row) => `${shortProduct(row.productLabel)} (quedan ${formatCount(row.available)}, pediste ${formatCount(row.requested)})`).join(', ')}. Volvé atrás y bajá las cantidades.`}</Note> : null}
            {lines.length === 0 ? <Note tone="danger">El envío no tiene cantidades. Volvé atrás y cargalas.</Note> : null}
          </div>
        ) : null}

        {error ? <Note tone="danger">{error}</Note> : null}
      </ModalBody>
      <ModalFoot>
        {step !== 'cabecera' && lines.length > 0 ? (
          <p className="pl-foot-sum">
            <strong>{lines.length}</strong> escuela{lines.length === 1 ? '' : 's'} · <strong>{formatCount(totalUnits)}</strong> cuadernillos
          </p>
        ) : null}
        {step !== 'cabecera' ? (
          <Button type="button" variant="secondary" disabled={sending} onClick={() => setStep(step === 'revision' ? 'escuelas' : 'cabecera')}>Atrás</Button>
        ) : (
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        )}
        {step === 'cabecera' ? (
          <Button type="button" disabled={!cabecera} onClick={() => setStep('escuelas')}>Siguiente</Button>
        ) : null}
        {step === 'escuelas' ? (
          <Button type="button" disabled={lines.length === 0 || recsPending} onClick={() => setStep('revision')}>
            {recsPending ? 'Buscando sugeridos…' : 'Revisar'}
          </Button>
        ) : null}
        {step === 'revision' ? (
          <Button type="button" disabled={sending || lines.length === 0 || short.length > 0} onClick={() => void dispatch()}>
            {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        ) : null}
      </ModalFoot>
    </>
  )
}
