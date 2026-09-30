'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDelete } from '@/components/confirm-delete'

type PermisoNominal = {
  id: string
  userId: string
  otorgadoPor: string
  otorgadoEn: string
  venceEn: string
  revocadoEn: string | null
}

type Usuario = { id: string; name: string; email: string }

function apiError(data: { error?: unknown } | null, fallback: string) {
  return typeof data?.error === 'string' ? data.error : fallback
}

export function NominalPermisosAdmin() {
  const [permisos, setPermisos] = React.useState<PermisoNominal[]>([])
  const [usuarios, setUsuarios] = React.useState<Usuario[]>([])
  const [cargandoUsuarios, setCargandoUsuarios] = React.useState(true)
  const [errorUsuarios, setErrorUsuarios] = React.useState<string | null>(null)
  const [userId, setUserId] = React.useState('')
  const [venceEn, setVenceEn] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [cargando, setCargando] = React.useState(true)
  const [guardando, setGuardando] = React.useState(false)

  const cargar = React.useCallback(async () => {
    const response = await fetch('/api/infraestructura/nominal/permisos')
    const data = (await response.json().catch(() => null)) as { permisos?: PermisoNominal[]; error?: unknown } | null
    if (!response.ok) throw new Error(apiError(data, 'No se pudieron cargar los permisos.'))
    setPermisos(data?.permisos ?? [])
    setError(null)
  }, [])

  React.useEffect(() => {
    let activo = true
    void Promise.resolve().then(cargar).catch((cause: unknown) => {
      if (activo) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los permisos.')
    }).finally(() => {
      if (activo) setCargando(false)
    })
    return () => { activo = false }
  }, [cargar])

  React.useEffect(() => {
    let activo = true
    void Promise.resolve().then(async () => {
      const response = await fetch('/api/usuarios')
      const data = (await response.json().catch(() => null)) as { usuarios?: Usuario[]; error?: unknown } | null
      if (!response.ok) throw new Error(apiError(data, 'No se pudieron cargar los usuarios.'))
      if (activo) setUsuarios(data?.usuarios ?? [])
    }).catch((cause: unknown) => {
      if (activo) setErrorUsuarios(cause instanceof Error ? cause.message : 'No se pudieron cargar los usuarios.')
    }).finally(() => {
      if (activo) setCargandoUsuarios(false)
    })
    return () => { activo = false }
  }, [])

  const otorgar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fechaVencimiento = new Date(venceEn)
    if (!venceEn || Number.isNaN(fechaVencimiento.getTime())) {
      setError('Ingrese una fecha de vencimiento válida.')
      return
    }
    if (fechaVencimiento.getTime() <= Date.now()) {
      setError('La fecha de vencimiento debe ser futura.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const response = await fetch('/api/infraestructura/nominal/permisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim(), venceEn: fechaVencimiento.toISOString() }),
      })
      const data = (await response.json().catch(() => null)) as { error?: unknown } | null
      if (!response.ok) throw new Error(apiError(data, 'No se pudo otorgar el permiso.'))
      setUserId('')
      setVenceEn('')
      await cargar()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo otorgar el permiso.')
    } finally {
      setGuardando(false)
    }
  }

  const revocar = async (id: string) => {
    setError(null)
    try {
      const response = await fetch(`/api/infraestructura/nominal/permisos?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = (await response.json().catch(() => null)) as { error?: unknown } | null
      if (!response.ok) throw new Error(apiError(data, 'No se pudo revocar el permiso.'))
      await cargar()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo revocar el permiso.')
    }
  }

  return (
    <section className="page-stack" aria-label="Acceso nominal">
      <p className="ui-hint">Este permiso habilita el acceso a conteos nominales (a nivel de estudiante) hasta la fecha indicada.</p>
      {error ? <div className="ui-messagebar ui-messagebar--error" role="alert">{error}</div> : null}
      {errorUsuarios ? <div className="ui-messagebar ui-messagebar--error" role="alert">{errorUsuarios}</div> : null}
      <form className="ui-form-grid" onSubmit={(event) => void otorgar(event)}>
        <div className="ui-two-col">
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="nominal-user-id">Usuario</label>
            <div className="ui-field__control">
              <select id="nominal-user-id" className="ui-input" value={userId} onChange={(event) => setUserId(event.currentTarget.value)} required disabled={cargandoUsuarios || Boolean(errorUsuarios)}>
                <option value="">{cargandoUsuarios ? 'Cargando usuarios…' : 'Seleccionar usuario'}</option>
                {usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.name} ({usuario.email})</option>)}
              </select>
            </div>
          </div>
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="nominal-expiry">Vence el</label>
            <div className="ui-field__control"><Input id="nominal-expiry" type="datetime-local" value={venceEn} onChange={(event) => setVenceEn(event.currentTarget.value)} required /></div>
          </div>
        </div>
        <div><Button type="submit" disabled={guardando || cargandoUsuarios || !userId.trim() || !venceEn}>Otorgar acceso</Button></div>
      </form>
      <div className="ui-table-wrap">
        <table className="ui-table" aria-label="Permisos nominales">
          <thead><tr><th>Usuario</th><th>Otorgado</th><th>Vence</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {permisos.map((permiso) => (
              <tr key={permiso.id}>
                <td>{usuarios.find((usuario) => usuario.id === permiso.userId)?.name
                  ? `${usuarios.find((usuario) => usuario.id === permiso.userId)?.name} (${usuarios.find((usuario) => usuario.id === permiso.userId)?.email})`
                  : permiso.userId}</td><td>{new Date(permiso.otorgadoEn).toLocaleString()}</td><td>{new Date(permiso.venceEn).toLocaleString()}</td>
                <td>{permiso.revocadoEn ? 'Revocado' : new Date(permiso.venceEn) <= new Date() ? 'Vencido' : 'Vigente'}</td>
                <td>{permiso.revocadoEn ? '—' : <ConfirmDelete title="¿Revocar acceso nominal?" description="El usuario dejará de acceder a los conteos nominales." onConfirm={() => void revocar(permiso.id)} triggerLabel="Revocar acceso" />}</td>
              </tr>
            ))}
            {!cargando && permisos.length === 0 ? <tr><td colSpan={5}>No hay permisos nominales otorgados.</td></tr> : null}
            {cargando ? <tr><td colSpan={5}>Cargando permisos…</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
