import { AsyncLocalStorage } from 'node:async_hooks'

export type ActorAuditoria = {
  actorTipo: 'usuario' | 'enlace' | 'compartido' | 'anonimo' | 'sistema'
  actorId: string | null
  actorRol: string | null
  viaAcceso: string
}
export type ResultadoAuditoria = 'pendiente' | 'exito' | 'rechazado' | 'invalido' | 'conflicto' | 'repetido' | 'sin_cambio' | 'error'
export type DatosAuditoria = {
  objetoTipo?: string
  objetoId?: string | null
  cueAnexo?: string | null
  resultado?: ResultadoAuditoria
  metadatos?: Record<string, unknown>
}
export type ContextoAuditoria = DatosAuditoria & ActorAuditoria & {
  id: string
  requestId: string
  ocurridoEn: Date
  inicio: number
  accion: string
  metodo: string
  rutaPlantilla: string
  persistido: boolean
  fallo: boolean
}
const key = Symbol.for('enos.infraestructura.auditoria')
const globalContext = globalThis as typeof globalThis & { [key]?: AsyncLocalStorage<ContextoAuditoria> }
export const contextoAuditoria = globalContext[key] ??= new AsyncLocalStorage<ContextoAuditoria>()

export function describirAuditoria(datos: DatosAuditoria) {
  const contexto = contextoAuditoria.getStore()
  if (!contexto) return
  Object.assign(contexto, { ...datos, metadatos: { ...contexto.metadatos, ...datos.metadatos } })
}

export function actorAuditoria(actor: ActorAuditoria) {
  const contexto = contextoAuditoria.getStore()
  if (contexto) Object.assign(contexto, actor)
}

/** Lo llama getSessionUser() con el usuario que ya resolvió; no vuelve a consultar la sesión. */
export function observarUsuarioAuditoria(user: { id: string; role: string } | null) {
  const contexto = contextoAuditoria.getStore()
  if (user && contexto && (contexto.viaAcceso === 'sin_identificar' || contexto.viaAcceso === 'sesion')) {
    actorAuditoria({ actorTipo: 'usuario', actorId: user.id, actorRol: user.role, viaAcceso: 'sesion' })
  }
}

export function autorAuditoria(): string {
  const contexto = contextoAuditoria.getStore()
  return contexto?.actorTipo === 'usuario' ? contexto.actorId! : contexto?.actorTipo ?? 'sin_identificar'
}

export function rolAuditoria(): string {
  const contexto = contextoAuditoria.getStore()
  return contexto?.actorRol ?? contexto?.actorTipo ?? 'sin_identificar'
}
