'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { AssignmentAccepted, AssignmentConflict, AssignmentUnresolved, AssignmentUnresolvedReason } from '@/lib/cuadernillos/types'

const UPLOAD_URL = '/api/cuadernillos/assignments/sources'
const MEMBERSHIPS_URL = '/api/cuadernillos/memberships'

type AssignmentRevision = {
  revisionId: string
  sourceId: string
  status: string
  createdAt: string
  counts: { accepted: number; conflicts: number; unresolved: number }
}

type UploadPreview = {
  revisionId: string
  previewHash: string
  accepted: AssignmentAccepted[]
  conflicts: AssignmentConflict[]
  unresolved: AssignmentUnresolved[]
  supervisorNames: string[]
  cabeceras: { cue: string; nombre: string }[]
}

type MappedUser = { id: string; name: string; email: string }

type SkippedReason = 'supervisor_unmapped' | 'cabecera_unmapped' | 'dependency_not_confirmed'

type ConfirmResult = {
  confirmedCount: number
  confirmed: string[]
  skipped: { cueAnexo: string; reason: SkippedReason }[]
  retainedConflictCueAnexos: string[]
}

const UNRESOLVED_COPY: Record<AssignmentUnresolvedReason, string> = {
  missing_cue: 'Falta el CUE',
  invalid_cue: 'CUE inválido',
  missing_annex: 'Falta el anexo',
  missing_supervisor: 'Sin supervisor',
  missing_cabecera: 'Sin cabecera',
  invalid_cabecera: 'Cabecera inválida',
}

const SKIPPED_COPY: Record<SkippedReason, string> = {
  supervisor_unmapped: 'Sin cuenta de supervisor',
  cabecera_unmapped: 'Sin cuenta de cabecera',
  dependency_not_confirmed: 'Dependencia no confirmada',
}

const REVISION_STATUS_COPY: Record<string, string> = {
  staged: 'Pendiente de confirmar',
  confirmed: 'Confirmada',
}

const ERROR_COPY: Record<string, string> = {
  file_too_large: 'El archivo supera el tamaño máximo permitido (2 MB).',
  missing_file: 'Seleccione un archivo CSV antes de subirlo.',
  invalid_upload: 'No se pudo leer el archivo subido.',
  unsupported_media_type: 'Formato no admitido. Suba un archivo CSV.',
  invalid_encoding: 'El archivo debe estar codificado en UTF-8.',
  invalid_csv_header: 'El encabezado del CSV no coincide con el formato de asignaciones.',
  assignment_source_already_staged: 'Este archivo ya fue previsualizado. Revise las subidas recientes.',
  staged_revision_mismatch: 'La previsualización ya no coincide. Vuelva a subir el archivo.',
  staged_revision_not_found: 'No se encontró la previsualización. Vuelva a subir el archivo.',
  staged_revision_integrity_failure: 'La previsualización no es válida. Vuelva a subir el archivo.',
  staged_revision_already_confirmed: 'Esta revisión ya fue confirmada.',
  forbidden: 'No tiene permisos para cargar asignaciones.',
}
const GENERIC_ERROR = 'No se pudo completar la operación. Intente nuevamente.'

class AssignmentRequestError extends Error {}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new AssignmentRequestError(typeof body.error === 'string' ? body.error : 'request_failed')
  return body as T
}

const errorCopy = (error: unknown) => (error instanceof AssignmentRequestError && ERROR_COPY[error.message]) || GENERIC_ERROR

const dateCopy = (iso: string) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })

const schoolsLabel = (count: number) => `${count} ${count === 1 ? 'escuela' : 'escuelas'}`

const idsOf = (accounts: Record<string, MappedUser>) => Object.fromEntries(
  Object.entries(accounts).map(([key, user]) => [key, user.id]),
)

export function AssignmentImport() {
  const [revisions, setRevisions] = useState<AssignmentRevision[] | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<UploadPreview | null>(null)
  const [supervisorAccounts, setSupervisorAccounts] = useState<Record<string, MappedUser>>({})
  const [cabeceraAccounts, setCabeceraAccounts] = useState<Record<string, MappedUser>>({})
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<ConfirmResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadRevisions = useCallback(async () => {
    try {
      const body = await request<{ revisions?: AssignmentRevision[] }>(UPLOAD_URL)
      setRevisions(Array.isArray(body.revisions) ? body.revisions : [])
    } catch (caught) {
      setError(errorCopy(caught))
    }
  }, [])

  useEffect(() => {
    void loadRevisions()
  }, [loadRevisions])

  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const body = await request<UploadPreview>(UPLOAD_URL, { method: 'POST', body: form })
      setPreview(body)
      setSupervisorAccounts({})
      setCabeceraAccounts({})
      await loadRevisions()
    } catch (caught) {
      setError(errorCopy(caught))
    } finally {
      setUploading(false)
    }
  }

  async function confirm() {
    if (!preview) return
    setConfirming(true)
    setError(null)
    try {
      const body = await request<ConfirmResult>(`${UPLOAD_URL}/${encodeURIComponent(preview.revisionId)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewHash: preview.previewHash,
          supervisorAccounts: idsOf(supervisorAccounts),
          cabeceraAccounts: idsOf(cabeceraAccounts),
        }),
      })
      setResult(body)
      setPreview(null)
      await loadRevisions()
    } catch (caught) {
      setError(errorCopy(caught))
    } finally {
      setConfirming(false)
    }
  }

  const mappedCount = Object.keys(supervisorAccounts).length + Object.keys(cabeceraAccounts).length

  return (
    <section aria-labelledby="assignment-import-title" style={{ marginTop: '2rem' }}>
      <h3 id="assignment-import-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
        Carga de asignaciones
      </h3>
      {error ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{error}</p> : null}

      <section aria-labelledby="assignment-revisions-title" style={{ marginTop: '1rem' }}>
        <h4 id="assignment-revisions-title" style={{ margin: 0, color: 'var(--ink)', fontSize: '1rem' }}>Subidas recientes</h4>
        {revisions === null ? <p role="status" style={{ color: 'var(--ink-soft)' }}>Cargando subidas…</p> : null}
        {revisions !== null && revisions.length === 0 ? <p style={{ color: 'var(--ink-soft)' }}>Sin subidas recientes.</p> : null}
        {revisions !== null && revisions.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: '.5rem 0 0', display: 'grid', gap: '.4rem' }}>
            {revisions.map((revision) => (
              <li key={revision.revisionId} style={{ color: 'var(--ink-soft)' }}>
                {`${dateCopy(revision.createdAt)} — ${REVISION_STATUS_COPY[revision.status] ?? 'Estado desconocido'}`}
                {` · Aceptadas ${revision.counts.accepted} · Conflictos ${revision.counts.conflicts} · No resueltas ${revision.counts.unresolved}`}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <form onSubmit={upload} style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '1rem' }}>
        <label style={{ display: 'grid', gap: '.35rem' }}>
          <span>Archivo CSV de asignaciones</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" className="ui-button ui-button--secondary" disabled={!file || uploading}>
          {uploading ? 'Subiendo…' : 'Subir y previsualizar'}
        </button>
      </form>

      {preview ? (
        <section aria-label="Previsualización" style={{ marginTop: '1.5rem', display: 'grid', gap: '1rem' }}>
          <ul style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
            <li>{`Aceptadas: ${preview.accepted.length}`}</li>
            <li>{`Conflictos: ${preview.conflicts.length}`}</li>
            <li>{`No resueltas: ${preview.unresolved.length}`}</li>
          </ul>

          <details>
            <summary>{`Escuelas aceptadas (${preview.accepted.length})`}</summary>
            <table aria-label="Escuelas aceptadas" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr><th scope="col">CUE</th><th scope="col">Escuela</th><th scope="col">Relación</th><th scope="col">Supervisor</th></tr>
              </thead>
              <tbody>
                {preview.accepted.map((item) => (
                  <tr key={item.cueAnexo}>
                    <td>{item.cueAnexo}</td>
                    <td>{item.schoolName}</td>
                    <td>{item.relationship === 'cabecera' ? 'Cabecera' : 'Dependiente'}</td>
                    <td>{item.supervisorName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <details>
            <summary>{`Conflictos (${preview.conflicts.length})`}</summary>
            <table aria-label="Conflictos" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr><th scope="col">CUE</th><th scope="col">Escuela</th><th scope="col">Motivo</th></tr>
              </thead>
              <tbody>
                {preview.conflicts.map((item) => (
                  <tr key={item.cueAnexo}>
                    <td>{item.cueAnexo}</td>
                    <td>{item.rows[0]?.schoolName ?? '—'}</td>
                    <td>Filas contradictorias en la fuente</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <details>
            <summary>{`No resueltas (${preview.unresolved.length})`}</summary>
            <table aria-label="No resueltas" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr><th scope="col">CUE</th><th scope="col">Escuela</th><th scope="col">Motivo</th></tr>
              </thead>
              <tbody>
                {preview.unresolved.map((item, index) => (
                  <tr key={`${item.cue ?? 'sin-cue'}-${index}`}>
                    <td>{item.cue ?? '—'}</td>
                    <td>{item.schoolName}</td>
                    <td>{UNRESOLVED_COPY[item.reason] ?? 'Motivo desconocido'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <section aria-labelledby="assignment-mapping-title" style={{ display: 'grid', gap: '1rem' }}>
            <h4 id="assignment-mapping-title" style={{ margin: 0, color: 'var(--ink)', fontSize: '1rem' }}>Asignar cuentas</h4>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
              Elija una cuenta existente para cada nombre. Las cuentas sin asignar dejan sus escuelas fuera de la confirmación.
            </p>
            {preview.supervisorNames.map((name) => (
              <AccountPicker
                key={`supervisor-${name}`}
                title={name}
                unlocks={preview.accepted.filter((item) => item.supervisorName === name).length}
                selected={supervisorAccounts[name] ?? null}
                onSelect={(user) => setSupervisorAccounts((current) => ({ ...current, [name]: user }))}
                onClear={() => setSupervisorAccounts(({ [name]: _removed, ...rest }) => rest)}
              />
            ))}
            {preview.cabeceras.map((cabecera) => (
              <AccountPicker
                key={`cabecera-${cabecera.cue}`}
                title={`${cabecera.cue} — ${cabecera.nombre}`}
                unlocks={preview.accepted.filter((item) => item.cabeceraCue === cabecera.cue).length}
                selected={cabeceraAccounts[cabecera.cue] ?? null}
                onSelect={(user) => setCabeceraAccounts((current) => ({ ...current, [cabecera.cue]: user }))}
                onClear={() => setCabeceraAccounts(({ [cabecera.cue]: _removed, ...rest }) => rest)}
              />
            ))}
            <div>
              <button
                type="button"
                className="ui-button ui-button--primary"
                onClick={() => void confirm()}
                disabled={confirming || mappedCount === 0}
              >
                {confirming ? 'Confirmando…' : 'Confirmar asignaciones'}
              </button>
            </div>
          </section>
        </section>
      ) : null}

      {result ? (
        <section aria-label="Resultado de la confirmación" style={{ marginTop: '1.5rem', display: 'grid', gap: '.5rem' }}>
          <p style={{ margin: 0, color: 'var(--ink)' }}>{`Confirmadas: ${result.confirmedCount}`}</p>
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{`Conflictos retenidos: ${result.retainedConflictCueAnexos.length}`}</p>
          {result.skipped.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--ink-soft)' }}>
              {(Object.keys(SKIPPED_COPY) as SkippedReason[]).map((reason) => {
                const count = result.skipped.filter((item) => item.reason === reason).length
                return count > 0 ? <li key={reason}>{`${SKIPPED_COPY[reason]}: ${count}`}</li> : null
              })}
            </ul>
          ) : null}
        </section>
      ) : null}
    </section>
  )
}

function AccountPicker({ title, unlocks, selected, onSelect, onClear }: {
  title: string
  unlocks: number
  selected: MappedUser | null
  onSelect: (user: MappedUser) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MappedUser[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(event: FormEvent) {
    event.preventDefault()
    const term = query.trim()
    if (term === '') return
    setBusy(true)
    setError(null)
    try {
      const body = await request<{ users: MappedUser[] }>(`${MEMBERSHIPS_URL}?q=${encodeURIComponent(term)}`)
      setResults(body.users)
    } catch (caught) {
      setError(errorCopy(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="group" aria-label={title} style={{ display: 'grid', gap: '.5rem', paddingLeft: '.75rem', borderLeft: '2px solid var(--border)' }}>
      <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 600 }}>{title}</p>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{`Desbloquea ${schoolsLabel(unlocks)}`}</p>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
        {selected ? `Cuenta asignada: ${selected.name} (${selected.email})` : 'Sin asignar'}
      </p>
      {selected ? (
        <div>
          <button type="button" className="ui-button ui-button--secondary" onClick={onClear}>Quitar asignación</button>
        </div>
      ) : null}
      <form onSubmit={search} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: '.25rem' }}>
          <span>{`Buscar cuenta para ${title}`}</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button type="submit" className="ui-button ui-button--secondary" disabled={busy || query.trim() === ''}>Buscar</button>
      </form>
      {error ? <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{error}</p> : null}
      {results ? (
        results.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Sin cuentas que coincidan.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '.35rem' }}>
            {results.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className="ui-button ui-button--secondary"
                  onClick={() => {
                    onSelect(user)
                    setResults(null)
                  }}
                >
                  {user.name} <span style={{ color: 'var(--ink-soft)' }}>{user.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}
