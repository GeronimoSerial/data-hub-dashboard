'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Building2, School, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dashedCue, errorCode, isRecommendationList, isSchoolList, readJson, type CriticalSchool } from '../cabecera/cabecera-api'
import { Choice, EmptyState, Modal, ModalBody, ModalFoot, Note, Stepper, WizardHeader, formatCount, shortProduct } from '../kit'
import { PickSearch, foldText, type ParsedQuery } from '../pick-search'
import {
  dispatchErrorMessage, isCabeceraList, recommendationsParams, remitoDispatchBody, reserveDispatchBody, type ConfirmedCabecera, type ProductOption, type RemitoModo,
} from './remito-api'

type Step = 'modo' | 'cabecera' | 'cantidades' | 'escuelas' | 'revision'
type Quantities = Record<string, Record<string, number>>

const MAX_RESULTS = 6

function stepCopy(step: Step): { title: string; description?: string } {
  switch (step) {
    case 'modo': return { title: '¿Cómo querés enviarlo?' }
    case 'cabecera': return { title: '¿A qué cabecera?', description: 'Buscala por nombre o CUE. Solo aparecen las que ya confirmaron su cuenta.' }
    case 'cantidades': return { title: '¿Cuántos cuadernillos?', description: 'La cabecera los reparte después entre sus escuelas en estado crítico.' }
    case 'escuelas': return { title: '¿Qué escuelas y cuántos?', description: 'Las cantidades se completan solas según la matrícula. Podés ajustarlas.' }
    case 'revision': return { title: 'Revisá y enviá' }
  }
}

const CABECERAS_ERROR = 'No se pudieron cargar las escuelas cabecera.'

export function RemitoBuilder({ open, campaignId, products, onClose, onDispatched }: {
  open: boolean
  campaignId: string
  products: ProductOption[]
  onClose: () => void
  onDispatched: () => void
}) {
  return (
    <Modal open={open} size="wide" title="Enviar cuadernillos" onClose={onClose}>
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
  const [step, setStep] = useState<Step>('modo')
  const [mode, setMode] = useState<RemitoModo | null>(null)
  const [cabeceras, setCabeceras] = useState<ConfirmedCabecera[] | null>(null)
  const [cabeceraError, setCabeceraError] = useState<string | null>(null)
  const [cabecera, setCabecera] = useState<ConfirmedCabecera | null>(null)
  const [schools, setSchools] = useState<CriticalSchool[]>([])
  const [quantities, setQuantities] = useState<Quantities>({})
  // A reserve has no schools: one quantity per grade for the cabecera to split later.
  const [reserve, setReserve] = useState<Record<string, number>>({})
  const [loadingRecs, setLoadingRecs] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const addedCues = useRef<Set<string>>(new Set())

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

  useEffect(() => { addedCues.current = new Set(schools.map((school) => school.cueAnexo)) }, [schools])

  const labels = useMemo(() => new Map(products.map((p) => [p.productId, p.productLabel])), [products])
  const schoolNames = useMemo(() => new Map(schools.map((s) => [s.cueAnexo, s.nombre])), [schools])
  const totals = useMemo(() => products.map((product) => ({
    ...product,
    requested: mode === 'cabecera'
      ? reserve[product.productId] ?? 0
      : schools.reduce((sum, school) => sum + (quantities[school.cueAnexo]?.[product.productId] ?? 0), 0),
  })), [products, schools, quantities, reserve, mode])
  const reserveItems = products.flatMap((product) => {
    const quantity = reserve[product.productId] ?? 0
    return quantity > 0 ? [{ productId: product.productId, quantity }] : []
  })
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

  const canContinue = mode === 'directo' || (mode === 'cabecera' && cabecera !== null)

  async function addSchool(school: CriticalSchool) {
    if (!canContinue || mode === null || schools.some((row) => row.cueAnexo === school.cueAnexo)) return
    setSchools((current) => [...current, school])
    setQuantities((current) => ({ ...current, [school.cueAnexo]: {} }))
    setLoadingRecs((current) => [...current, school.cueAnexo])
    try {
      const query = recommendationsParams({ mode, cueAnexo: school.cueAnexo, cabeceraCueAnexo: cabecera?.cue ?? null, campaignId })
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
    setCabecera(next)
  }

  // Recommendations depend on the send mode, so the schools picked for one mode do not carry over to the other.
  function chooseMode(next: RemitoModo) {
    if (next !== mode) { setSchools([]); setQuantities({}); setReserve({}) }
    setMode(next)
    setStep(next === 'cabecera' ? 'cabecera' : 'escuelas')
  }

  // Cabeceras and schools are searched the same way: digits are a CUE, anything else part of the name.
  async function searchCabeceras(query: ParsedQuery): Promise<ConfirmedCabecera[]> {
    const wanted = query.kind === 'cue' ? query.value : foldText(query.value)
    return (cabeceras ?? [])
      .filter((row) => (query.kind === 'cue' ? row.cue.startsWith(wanted) : foldText(row.nombre).includes(wanted)))
      .slice(0, MAX_RESULTS)
  }

  async function searchSchools(query: ParsedQuery, signal: AbortSignal): Promise<CriticalSchool[]> {
    const param = query.kind === 'cue' ? 'cue' : 'q'
    const response = await fetch(`/api/cuadernillos/schools?${param}=${encodeURIComponent(query.value)}`, { cache: 'no-store', signal })
    const data = await readJson(response)
    if (!response.ok || !isSchoolList(data)) throw new Error('search_failed')
    return data.schools.filter((school) => !addedCues.current.has(school.cueAnexo)).slice(0, MAX_RESULTS)
  }

  async function dispatch() {
    const empty = mode === 'cabecera' ? reserveItems.length === 0 : lines.length === 0
    if (!canContinue || mode === null || empty || short.length > 0) return
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/cuadernillos/remitos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'cabecera' && cabecera
          ? reserveDispatchBody({ campaignId, cabeceraCueAnexo: cabecera.cue, idempotencyKey: idempotencyKey.current, items: reserveItems })
          : remitoDispatchBody({ mode, campaignId, cabeceraCueAnexo: null, idempotencyKey: idempotencyKey.current, lines })),
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

  const recsPending = loadingRecs.length > 0
  const steps: Step[] = mode === 'cabecera' ? ['modo', 'cabecera', 'cantidades', 'revision'] : ['modo', 'escuelas', 'revision']
  const stepIndex = steps.indexOf(step)
  const copy = stepCopy(step)
  const previous = steps[Math.max(0, stepIndex - 1)]
  const totalUnits = totals.reduce((sum, row) => sum + row.requested, 0)
  const nothingToSend = mode === 'cabecera' ? reserveItems.length === 0 : lines.length === 0
  const stockNote = short.length > 0
    ? `No alcanza el stock de ${short.map((row) => shortProduct(row.productLabel)).join(', ')}. Bajá las cantidades para poder enviar.`
    : null
  const schoolTotal = (cue: string) => products.reduce((sum, product) => sum + (quantities[cue]?.[product.productId] ?? 0), 0)

  return (
    <>
      <ModalBody>
        <WizardHeader step={stepIndex + 1} total={steps.length} title={copy.title} description={copy.description} />
        {step === 'modo' ? (
          <div className="k-choices">
            <Choice quiet title="Directo a cabecera" description="Una escuela cabecera recibe el envío y lo reparte a sus escuelas." icon={<Building2 size={20} />} onClick={() => chooseMode('cabecera')} />
            <Choice quiet title="Directo a la escuela afectada" description="Cada escuela recibe su parte y firma su recepción." icon={<School size={20} />} onClick={() => chooseMode('directo')} />
          </div>
        ) : null}

        {step === 'cabecera' ? (
          <div className="k-field">
            {cabeceraError ? <Note tone="danger">{cabeceraError}</Note> : null}
            {!cabeceras && !cabeceraError ? <p role="status" className="k-note">Cargando escuelas cabecera…</p> : null}
            {cabeceras && cabeceras.length === 0 ? <EmptyState title="Ninguna cabecera confirmó su cuenta" description="Una cabecera tiene que confirmar su cuenta para poder recibir envíos." /> : null}
            {cabeceras && cabeceras.length > 0 && cabecera ? (
              <div className="k-picked">
                <span className="k-picked-main">
                  <strong>{cabecera.nombre}</strong>
                  <span>{cabecera.departamento} · CUE {dashedCue(cabecera.cue)}</span>
                </span>
                <button type="button" className="k-link-btn" onClick={() => setCabecera(null)}>Cambiar</button>
              </div>
            ) : null}
            {cabeceras && cabeceras.length > 0 && !cabecera ? (
              <PickSearch<ConfirmedCabecera>
                label="Buscar cabecera"
                noun="cabecera"
                search={searchCabeceras}
                describe={(row) => ({ key: row.cue, title: row.nombre, meta: `${row.departamento} · CUE ${dashedCue(row.cue)}`, label: `Elegir ${row.nombre}, CUE ${row.cue}` })}
                onPick={chooseCabecera}
              />
            ) : null}
          </div>
        ) : null}

        {step === 'cantidades' ? (
          <>
            <ul className="k-qty-list">
              {totals.map((row) => (
                <li key={row.productId} className="k-qty-row" data-active={row.requested > 0 ? 'true' : undefined}>
                  <span>{shortProduct(row.productLabel)} <span className="k-hint">{`(quedan ${formatCount(row.available)})`}</span></span>
                  <Stepper label={row.productLabel} value={row.requested} onChange={(value) => setReserve((current) => ({ ...current, [row.productId]: value }))} />
                </li>
              ))}
            </ul>
            {stockNote ? <Note tone="danger">{stockNote}</Note> : null}
          </>
        ) : null}

        {step === 'escuelas' ? (
          <>
            <PickSearch<CriticalSchool>
              label="Buscar escuela"
              noun="escuela"
              search={searchSchools}
              describe={(school) => ({ key: school.cueAnexo, title: school.nombre, meta: `${school.departamento} · CUE ${dashedCue(school.cueAnexo)}`, label: `Agregar ${school.nombre}, CUE ${school.cueAnexo}` })}
              onPick={(school) => void addSchool(school)}
            />
            {schools.length > 0 ? (
              <div className="pl-matrix-wrap">
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
                </div>
                {stockNote ? <Note tone="danger">{stockNote}</Note> : null}
              </div>
            ) : (
              <p className="pl-matrix-empty">Buscá una escuela para agregarla.</p>
            )}
          </>
        ) : null}

        {step === 'revision' ? (
          <div className="pl-review">
            <section className="k-receipt" aria-label="Detalle del envío">
              <header className="k-receipt-head">
                <span>{mode === 'directo' ? 'Envío' : 'Envío a'}</span>
                <strong>{mode === 'directo' ? 'Directo a escuelas' : cabecera?.nombre}</strong>
              </header>
              {mode === 'directo' ? <p className="k-hint" style={{ margin: 0 }}>Sin cabecera: cada escuela firma su recepción.</p> : null}
              {mode === 'cabecera' ? (
                <div className="k-receipt-group">
                  <dl>
                    {reserveItems.map((item) => (
                      <div key={item.productId}>
                        <dt>{shortProduct(labels.get(item.productId) ?? item.productId)}</dt>
                        <dd>{formatCount(item.quantity)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              {mode === 'cabecera' ? <p className="k-hint" style={{ margin: 0 }}>La cabecera los reparte entre sus escuelas en estado crítico.</p> : null}
              {mode === 'directo' ? lines.map((line) => (
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
              )) : null}
              <p className="k-receipt-total">
                <span>Total</span>
                <strong>{formatCount(totalUnits)} cuadernillos</strong>
              </p>
            </section>
            {short.length > 0 ? <Note tone="danger">{`No alcanza el stock: ${short.map((row) => `${shortProduct(row.productLabel)} (quedan ${formatCount(row.available)}, pediste ${formatCount(row.requested)})`).join(', ')}. Volvé atrás y bajá las cantidades.`}</Note> : null}
            {nothingToSend ? <Note tone="danger">El envío no tiene cantidades. Volvé atrás y cargalas.</Note> : null}
          </div>
        ) : null}

        {error ? <Note tone="danger">{error}</Note> : null}
      </ModalBody>
      <ModalFoot>
        {step === 'cantidades' && totalUnits > 0 ? (
          <p className="pl-foot-sum"><strong>{formatCount(totalUnits)}</strong> cuadernillos</p>
        ) : null}
        {(step === 'escuelas' || step === 'revision') && mode === 'directo' && lines.length > 0 ? (
          <p className="pl-foot-sum">
            <strong>{lines.length}</strong> escuela{lines.length === 1 ? '' : 's'} · <strong>{formatCount(totalUnits)}</strong> cuadernillos
          </p>
        ) : null}
        {step === 'modo' ? (
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        ) : (
          <Button type="button" variant="ghost" disabled={sending} onClick={() => setStep(previous)}>Atrás</Button>
        )}
        {step === 'cabecera' ? (
          <Button type="button" disabled={!canContinue} onClick={() => setStep('cantidades')}>Siguiente</Button>
        ) : null}
        {step === 'cantidades' ? (
          <Button type="button" disabled={nothingToSend || short.length > 0} onClick={() => setStep('revision')}>Revisar</Button>
        ) : null}
        {step === 'escuelas' ? (
          <Button type="button" disabled={lines.length === 0 || recsPending} onClick={() => setStep('revision')}>
            {recsPending ? 'Buscando sugeridos…' : 'Revisar'}
          </Button>
        ) : null}
        {step === 'revision' ? (
          <Button type="button" disabled={sending || nothingToSend || short.length > 0 || !canContinue} onClick={() => void dispatch()}>
            {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        ) : null}
      </ModalFoot>
    </>
  )
}
