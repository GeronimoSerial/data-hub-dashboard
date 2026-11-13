'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { ConfirmDelete } from '@/components/confirm-delete'
import { useTextos } from '@/lib/i18n/idioma-provider'

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
  const t = useTextos().parteResto.nominal
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
    if (!response.ok) throw new Error(apiError(data, t.errores.cargarPermisos))
    setPermisos(data?.permisos ?? [])
    setError(null)
  }, [t])

  React.useEffect(() => {
    let activo = true
    void Promise.resolve().then(cargar).catch((cause: unknown) => {
      if (activo) setError(cause instanceof Error ? cause.message : t.errores.cargarPermisos)
    }).finally(() => {
      if (activo) setCargando(false)
    })
    return () => { activo = false }
  }, [cargar, t])

  React.useEffect(() => {
    let activo = true
    void Promise.resolve().then(async () => {
      const response = await fetch('/api/usuarios')
      const data = (await response.json().catch(() => null)) as { usuarios?: Usuario[]; error?: unknown } | null
      if (!response.ok) throw new Error(apiError(data, t.errores.cargarUsuarios))
      if (activo) setUsuarios(data?.usuarios ?? [])
    }).catch((cause: unknown) => {
      if (activo) setErrorUsuarios(cause instanceof Error ? cause.message : t.errores.cargarUsuarios)
    }).finally(() => {
      if (activo) setCargandoUsuarios(false)
    })
    return () => { activo = false }
  }, [t])

  const otorgar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fechaVencimiento = new Date(venceEn)
    if (!venceEn || Number.isNaN(fechaVencimiento.getTime())) {
      setError(t.errores.fechaInvalida)
      return
    }
    if (fechaVencimiento.getTime() <= Date.now()) {
      setError(t.errores.fechaFutura)
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
      if (!response.ok) throw new Error(apiError(data, t.errores.otorgar))
      setUserId('')
      setVenceEn('')
      await cargar()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errores.otorgar)
    } finally {
      setGuardando(false)
    }
  }

  const revocar = async (id: string) => {
    setError(null)
    try {
      const response = await fetch(`/api/infraestructura/nominal/permisos?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = (await response.json().catch(() => null)) as { error?: unknown } | null
      if (!response.ok) throw new Error(apiError(data, t.errores.revocar))
      await cargar()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errores.revocar)
    }
  }

  return (
    <section className="page-stack" aria-label={t.ariaSeccion}>
      <p className="ui-hint">{t.ayuda}</p>
      {error ? <div className="ui-messagebar ui-messagebar--error" role="alert">{error}</div> : null}
      {errorUsuarios ? <div className="ui-messagebar ui-messagebar--error" role="alert">{errorUsuarios}</div> : null}
      <form className="ui-form-grid" onSubmit={(event) => void otorgar(event)}>
        <div className="ui-two-col">
          <div className="ui-field">
            <label className="ui-field__label" id="nominal-user-label">{t.usuario}</label>
            <div className="ui-field__control">
              <Select
                value={userId}
                items={[{ value: '', label: cargandoUsuarios ? t.cargandoUsuarios : t.seleccionarUsuario }, ...usuarios.map((usuario) => ({ value: usuario.id, label: `${usuario.name} (${usuario.email})` }))]}
                onValueChange={(next) => setUserId((next as string | null) ?? '')}
                disabled={cargandoUsuarios || Boolean(errorUsuarios)}
              >
                <SelectTrigger aria-labelledby="nominal-user-label" />
                <SelectContent>
                  {usuarios.map((usuario) => <SelectItem key={usuario.id} value={usuario.id}>{usuario.name} ({usuario.email})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="nominal-expiry">{t.venceEl}</label>
            <div className="ui-field__control"><Input id="nominal-expiry" type="datetime-local" value={venceEn} onChange={(event) => setVenceEn(event.currentTarget.value)} required /></div>
          </div>
        </div>
        <div><Button type="submit" disabled={guardando || cargandoUsuarios || !userId.trim() || !venceEn}>{t.otorgarAcceso}</Button></div>
      </form>
      <div className="ui-table-wrap">
        <table className="ui-table" aria-label={t.tablaAria}>
          <thead><tr><th>{t.columnas.usuario}</th><th>{t.columnas.otorgado}</th><th>{t.columnas.vence}</th><th>{t.columnas.estado}</th><th>{t.columnas.acciones}</th></tr></thead>
          <tbody>
            {permisos.map((permiso) => (
              <tr key={permiso.id}>
                <td>{usuarios.find((usuario) => usuario.id === permiso.userId)?.name
                  ? `${usuarios.find((usuario) => usuario.id === permiso.userId)?.name} (${usuarios.find((usuario) => usuario.id === permiso.userId)?.email})`
                  : permiso.userId}</td><td data-label={t.columnas.otorgado}>{new Date(permiso.otorgadoEn).toLocaleString()}</td><td data-label={t.columnas.vence}>{new Date(permiso.venceEn).toLocaleString()}</td>
                <td data-label={t.columnas.estado}>{permiso.revocadoEn ? t.estados.revocado : new Date(permiso.venceEn) <= new Date() ? t.estados.vencido : t.estados.vigente}</td>
                <td>{permiso.revocadoEn ? '—' : <ConfirmDelete title={t.revocarTitulo} description={t.revocarDescripcion} onConfirm={() => void revocar(permiso.id)} triggerLabel={t.revocarAcceso} />}</td>
              </tr>
            ))}
            {!cargando && permisos.length === 0 ? <tr><td colSpan={5} className="admin-empty-cell">{t.sinPermisos}</td></tr> : null}
            {cargando ? <tr><td colSpan={5} className="admin-empty-cell">{t.cargandoPermisos}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
