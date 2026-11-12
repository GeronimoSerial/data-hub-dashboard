'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { CabeceraView as CabeceraRow } from '@/lib/cuadernillos/cabeceras'
import type { BookletAssignmentsPage, BookletBalanceView, BookletCampaignOption, EnrollmentRecommendation } from '@/lib/cuadernillos/types'
import { AssignmentList } from './assignment-list'

type CriticalSchool = { cueAnexo: string; nombre: string; departamento: string; severity: string }
type OverviewState = { campaignId: string | null; campaignOptions: BookletCampaignOption[]; balances: BookletBalanceView[] }
type RequestCabecera = { cueAnexo: string; schoolName: string }

const ERROR_LABELS: Record<string, string> = {
  ineligible: 'La escuela ya no está en severidad Crítica. Buscá otra escuela.',
  quota_exceeded: 'La cantidad supera el cupo disponible de la cabecera.',
  forbidden: 'Esta cuenta no puede solicitar para esta cabecera.',
  campaign_inactive: 'La campaña no está activa.',
  idempotency_conflict: 'El reintento no coincide con la solicitud anterior. Volvé a intentar.',
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null)
}

function errorCode(data: unknown): string {
  return data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : ''
}

function isOverview(value: unknown): value is OverviewState {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (row.campaignId === null || typeof row.campaignId === 'string')
    && Array.isArray(row.campaignOptions) && Array.isArray(row.balances)
}

function isSchoolList(value: unknown): value is { schools: CriticalSchool[] } {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { schools?: unknown }).schools))
}

function isRecommendationList(value: unknown): value is { recommendations: EnrollmentRecommendation[] } {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { recommendations?: unknown }).recommendations))
}

function isCabeceraList(value: unknown): value is { cabeceras: CabeceraRow[] } {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { cabeceras?: unknown }).cabeceras)) return false
  return (value as { cabeceras: unknown[] }).cabeceras.every((row) => row !== null && typeof row === 'object'
    && typeof (row as CabeceraRow).cue === 'string' && typeof (row as CabeceraRow).nombre === 'string')
}

function CabeceraRequestForm({ cabeceraCues, onRequestCreated }: { cabeceraCues: RequestCabecera[]; onRequestCreated: () => void }) {
  const [overview, setOverview] = useState<OverviewState | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState('')
  const [cabeceraCue, setCabeceraCue] = useState(cabeceraCues[0]?.cueAnexo ?? '')
  const [cueQuery, setCueQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CriticalSchool[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<CriticalSchool | null>(null)
  const [recommendations, setRecommendations] = useState<EnrollmentRecommendation[] | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const intent = useRef<{ body: string; key: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ capability: 'cabecera' })
    if (campaignId) query.set('campaignId', campaignId)
    fetch(`/api/cuadernillos/overview?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await readJson(response)
        if (!response.ok || !isOverview(data)) throw new Error('No se pudo cargar la campaña.')
        setOverview(data)
        setOverviewError(null)
        if (!campaignId && data.campaignId) setCampaignId(data.campaignId)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setOverviewError(reason instanceof Error ? reason.message : 'No se pudo cargar la campaña.')
      })
    return () => controller.abort()
  }, [campaignId])

  const applicableProducts = useMemo(() => {
    if (!overview || !cabeceraCue) return []
    const balances = overview.balances.filter((row) => row.cabeceraCueAnexo === cabeceraCue)
    return (recommendations ?? []).flatMap((row) => {
      const balance = balances.find((candidate) => candidate.productId === row.productId)
      return balance ? [{ row, balance }] : []
    })
  }, [overview, cabeceraCue, recommendations])

  useEffect(() => {
    if (!selected || !campaignId || !cabeceraCue) return
    const controller = new AbortController()
    const query = new URLSearchParams({ cueAnexo: selected.cueAnexo, cabeceraCueAnexo: cabeceraCue, campaignId })
    fetch(`/api/cuadernillos/recommendations?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await readJson(response)
        if (!response.ok || !isRecommendationList(data)) throw new Error('No se pudo calcular la recomendación.')
        setRecommendations(data.recommendations)
        setQuantities(Object.fromEntries(data.recommendations.map((row) => [row.productId, String(row.suggested ?? 0)])))
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setFormError(reason instanceof Error ? reason.message : 'No se pudo calcular la recomendación.')
      })
    return () => controller.abort()
  }, [selected, campaignId, cabeceraCue])

  async function searchSchools(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cue = cueQuery.trim()
    if (!/^\d{3,9}$/.test(cue)) { setSearchError('Ingresá al menos 3 dígitos del CUE.'); return }
    setSearchError(null)
    try {
      const response = await fetch(`/api/cuadernillos/schools?cue=${encodeURIComponent(cue)}`, { cache: 'no-store' })
      const data = await readJson(response)
      if (!response.ok || !isSchoolList(data)) throw new Error('No se pudieron buscar las escuelas.')
      setSearchResults(data.schools)
    } catch (reason) {
      setSearchResults(null)
      setSearchError(reason instanceof Error ? reason.message : 'No se pudieron buscar las escuelas.')
    }
  }

  function chooseSchool(school: CriticalSchool) {
    setSelected(school)
    setRecommendations(null)
    setQuantities({})
    setNotice(null)
    setFormError(null)
  }

  async function submitRequest() {
    if (!selected || !campaignId || !cabeceraCue) return
    const lines = applicableProducts.flatMap(({ row, balance }) => {
      const quantity = Number(quantities[row.productId] ?? 0)
      const max = balance.quotaAvailable ?? Number.MAX_SAFE_INTEGER
      return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= max ? [{ productId: row.productId, quantity }] : []
    })
    if (!lines.length) { setFormError('Indicá al menos una cantidad entera positiva dentro del cupo disponible.'); return }
    const body = { campaignId, recipientCueAnexo: selected.cueAnexo, cabeceraCueAnexo: cabeceraCue, lines, submit: true }
    const fingerprint = JSON.stringify(body)
    if (intent.current?.body !== fingerprint) intent.current = { body: fingerprint, key: crypto.randomUUID() }
    setSubmitting(true)
    setFormError(null)
    try {
      const response = await fetch('/api/cuadernillos/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey: intent.current.key }),
      })
      const data = await readJson(response)
      if (!response.ok) throw new Error(ERROR_LABELS[errorCode(data)] ?? 'No se pudo enviar la solicitud. Intentá nuevamente.')
      intent.current = null
      setNotice(`Solicitud enviada a revisión para ${selected.nombre}. Aparece en Solicitudes.`)
      onRequestCreated()
      setSelected(null)
      setRecommendations(null)
      setQuantities({})
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'No se pudo enviar la solicitud.')
    } finally {
      setSubmitting(false)
    }
  }

  if (cabeceraCues.length === 0) {
    return <p style={{ color: 'var(--ink-soft)' }}>Esta cuenta no tiene una cabecera asignada para solicitar cuadernillos.</p>
  }

  return (
    <section aria-labelledby="cabecera-request-title" style={{ marginTop: '2.5rem', display: 'grid', gap: '1rem' }}>
      <h3 id="cabecera-request-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
        Nueva solicitud para una escuela
      </h3>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Solo aparecen escuelas con una situación Crítica cargada en el mapa.</p>
      {overviewError ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{overviewError}</p> : null}

      {overview && overview.campaignOptions.length > 1 ? (
        <label style={{ display: 'grid', gap: '.25rem', maxWidth: '24rem' }}>
          Campaña
          <select value={campaignId} onChange={(event) => { setCampaignId(event.target.value); setSelected(null) }}>
            <option value="">Seleccioná una campaña</option>
            {overview.campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
        </label>
      ) : null}

      {cabeceraCues.length > 1 ? (
        <label style={{ display: 'grid', gap: '.25rem', maxWidth: '24rem' }}>
          Cabecera que solicita
          <select value={cabeceraCue} onChange={(event) => { setCabeceraCue(event.target.value); setSelected(null) }}>
            {cabeceraCues.map((cabecera) => <option key={cabecera.cueAnexo} value={cabecera.cueAnexo}>{cabecera.schoolName} · CUE {cabecera.cueAnexo}</option>)}
          </select>
        </label>
      ) : null}

      <form onSubmit={(event) => void searchSchools(event)} style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: '.25rem' }}>
          CUE de la escuela
          <input inputMode="numeric" value={cueQuery} onChange={(event) => setCueQuery(event.target.value)} maxLength={9} placeholder="Ej. 180123" />
        </label>
        <button type="submit" className="ui-button ui-button--secondary">Buscar escuela</button>
      </form>
      {searchError ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{searchError}</p> : null}
      {searchResults && searchResults.length === 0 ? <p style={{ color: 'var(--ink-soft)' }}>No hay escuelas en severidad Crítica con ese CUE.</p> : null}
      {searchResults && searchResults.length ? (
        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '.35rem' }}>
          {searchResults.map((school) => (
            <li key={school.cueAnexo}>
              <button type="button" className="ui-button ui-button--secondary" onClick={() => chooseSchool(school)} aria-label={`Elegir ${school.nombre}, CUE ${school.cueAnexo}`}>
                Elegir
              </button>{' '}
              {school.nombre} · CUE {school.cueAnexo} · {school.departamento} · {school.severity}
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div style={{ display: 'grid', gap: '.75rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
          <p style={{ margin: 0, color: 'var(--ink)' }}><strong>{selected.nombre}</strong> · CUE {selected.cueAnexo}</p>
          {!recommendations && !formError ? <p role="status" style={{ color: 'var(--ink-soft)' }}>Calculando recomendación del corte vigente…</p> : null}
          {recommendations && applicableProducts.length === 0 ? <p style={{ color: 'var(--ink-soft)' }}>No hay productos con cupo para esta cabecera.</p> : null}
          {applicableProducts.map(({ row, balance }) => (
            <label key={row.productId} style={{ display: 'grid', gap: '.25rem', maxWidth: '20rem' }}>
              Cantidad · {balance.productLabel}
              <input type="number" min="1" step="1" max={balance.quotaAvailable ?? undefined} value={quantities[row.productId] ?? '0'}
                onChange={(event) => setQuantities((current) => ({ ...current, [row.productId]: event.target.value }))} />
              <span style={{ color: 'var(--ink-soft)', fontSize: '.85rem' }}>
                Recomendado: {row.suggested ?? 'sin dato'} · Cupo disponible: {balance.quotaAvailable ?? 'sin dato'}
              </span>
            </label>
          ))}
          {formError ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{formError}</p> : null}
          <button type="button" className="ui-button ui-button--primary" disabled={submitting || !applicableProducts.length || !campaignId} onClick={() => void submitRequest()}>
            {submitting ? 'Enviando…' : 'Enviar a revisión'}
          </button>
        </div>
      ) : null}
      {notice ? <p role="status" style={{ color: 'var(--ink)' }}>{notice}</p> : null}
    </section>
  )
}

function AdminCabeceraPicker({ cabeceras, error, selectedCue, onPick }: {
  cabeceras: CabeceraRow[] | null
  error: string | null
  selectedCue: string | null
  onPick: (cue: string) => void
}) {
  return (
    <section aria-labelledby="admin-cabecera-picker-title" style={{ display: 'grid', gap: '.75rem', marginTop: '2rem' }}>
      <h3 id="admin-cabecera-picker-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
        Cabecera que solicita
      </h3>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Como administrador, elegí la cabecera en cuyo nombre se realiza el pedido.</p>
      {error ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{error}</p> : null}
      {!cabeceras && !error ? <p role="status" style={{ color: 'var(--ink-soft)' }}>Cargando cabeceras…</p> : null}
      {cabeceras && cabeceras.length === 0 ? <p style={{ color: 'var(--ink-soft)' }}>No hay cabeceras cargadas.</p> : null}
      {cabeceras && cabeceras.length ? (
        <div role="group" aria-label="Cabeceras" style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
          {cabeceras.map((cabecera) => (
            <button
              key={cabecera.cue}
              type="button"
              aria-pressed={selectedCue === cabecera.cue}
              onClick={() => onPick(cabecera.cue)}
              className={selectedCue === cabecera.cue ? 'ui-button ui-button--primary' : 'ui-button ui-button--secondary'}
            >
              {cabecera.nombre} · CUE {cabecera.cue}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function CabeceraView({
  page,
  loading,
  error,
  onLoadMore,
  loadingMore,
  isAdmin = false,
  readOnly = false,
  onRequestCreated = () => undefined,
}: {
  page: BookletAssignmentsPage | null
  loading: boolean
  error: string | null
  onLoadMore: () => void
  loadingMore: boolean
  isAdmin?: boolean
  readOnly?: boolean
  onRequestCreated?: () => void
}) {
  const [adminCabeceras, setAdminCabeceras] = useState<CabeceraRow[] | null>(null)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [pickedCue, setPickedCue] = useState<string | null>(null)
  // An admin has no cabecera of their own: they pick the requesting cabecera from the admin list.
  const showAdminPicker = isAdmin && !readOnly

  useEffect(() => {
    if (!showAdminPicker) return
    const controller = new AbortController()
    fetch('/api/cuadernillos/cabeceras', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await readJson(response)
        if (!response.ok || !isCabeceraList(data)) throw new Error('No se pudieron cargar las cabeceras.')
        setAdminCabeceras(data.cabeceras)
        setAdminError(null)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setAdminError(reason instanceof Error ? reason.message : 'No se pudieron cargar las cabeceras.')
      })
    return () => controller.abort()
  }, [showAdminPicker])

  const pageCabeceras: RequestCabecera[] = (page?.items ?? [])
    .filter((item) => item.relationship === 'cabecera')
    .map((item) => ({ cueAnexo: item.cueAnexo, schoolName: item.schoolName }))
  const pickedCabecera = adminCabeceras?.find((cabecera) => cabecera.cue === pickedCue)
  // A read-only view never creates requests; the session actor owns every write.
  const requestCabeceras: RequestCabecera[] | null = readOnly ? null
    : isAdmin ? (pickedCabecera ? [{ cueAnexo: pickedCabecera.cue, schoolName: pickedCabecera.nombre }] : null)
    : page ? pageCabeceras : null

  return (
    <section aria-labelledby="cuadernillos-view-title">
      <header style={{ marginBottom: '1.5rem' }}>
        <p style={{ margin: '0 0 .35rem', color: 'var(--accent)', fontSize: '.75rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          Responsabilidad de módulo
        </p>
        <h2 id="cuadernillos-view-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', lineHeight: 1.1 }}>
          Cabecera
        </h2>
        <p style={{ maxWidth: '48rem', margin: '.75rem 0 0', color: 'var(--ink-soft)', lineHeight: 1.55 }}>
          La escuela destinataria no necesita asignación: la cabecera busca la escuela por CUE y realiza el pedido. Las cantidades recomendadas deben basarse en matrícula agregada del corte vigente.
        </p>
      </header>

      <section aria-labelledby="assignment-list-title">
        <h3 id="assignment-list-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
          Cabeceras de esta cuenta
        </h3>
        {loading && !page ? <p role="status" style={{ color: 'var(--ink-soft)' }}>Cargando asignaciones…</p> : null}
        {error ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{error}</p> : null}
        {page ? <AssignmentList items={page.items} /> : null}
        {page?.nextCursor ? (
          <button type="button" onClick={onLoadMore} disabled={loadingMore} className="ui-button ui-button--secondary" style={{ marginTop: '1rem' }}>
            {loadingMore ? 'Cargando…' : 'Ver más escuelas'}
          </button>
        ) : null}
      </section>

      {showAdminPicker ? <AdminCabeceraPicker cabeceras={adminCabeceras} error={adminError} selectedCue={pickedCue} onPick={setPickedCue} /> : null}
      {requestCabeceras ? <CabeceraRequestForm key={requestCabeceras.map((cabecera) => cabecera.cueAnexo).join(',')} cabeceraCues={requestCabeceras} onRequestCreated={onRequestCreated} /> : null}
    </section>
  )
}
