import type { ConfirmacionEnvio, EnvioInmutable } from '../reportes-offline-contratos'
import {
  type AlmacenParte,
  type ConfirmacionLocal,
  type TrabajoEnvioLocal,
} from './almacen-indexeddb'

export type TipoTrabajoEnvio = 'reporte_final' | 'sincronizacion_borrador' | 'foto'

export interface TrabajoColaEnvio extends TrabajoEnvioLocal {
  tipo: TipoTrabajoEnvio
  readonly cuerpo: Record<string, unknown>
}

export interface NuevoTrabajoEnvio {
  tipo: Exclude<TipoTrabajoEnvio, 'reporte_final'>
  idempotencyKey: string
  draftId?: string
  cuerpo: Record<string, unknown>
  cuerpoHash?: string
}

const PRIORIDAD: Record<TipoTrabajoEnvio, number> = {
  reporte_final: 0,
  sincronizacion_borrador: 1,
  foto: 2,
}

function clonarCuerpo(cuerpo: Record<string, unknown>): Record<string, unknown> {
  const serializado = JSON.stringify(cuerpo)
  if (serializado === undefined) throw new TypeError('The job body must be JSON serializable')
  return JSON.parse(serializado) as Record<string, unknown>
}

function congelar<T>(valor: T): T {
  if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
    Object.freeze(valor)
    for (const hijo of Object.values(valor)) congelar(hijo)
  }
  return valor
}

function cuerpoIgual(izquierdo: unknown, derecho: unknown): boolean {
  return JSON.stringify(izquierdo) === JSON.stringify(derecho)
}

function tipoTrabajo(trabajo: TrabajoEnvioLocal): TipoTrabajoEnvio {
  // Older pending records are final submissions and stay ahead of lower priorities.
  return trabajo.tipo ?? 'reporte_final'
}

function ordenar(trabajos: TrabajoEnvioLocal[]): TrabajoColaEnvio[] {
  return trabajos
    .map((trabajo) => ({ ...trabajo, tipo: tipoTrabajo(trabajo) }) as TrabajoColaEnvio)
    .sort((a, b) => {
      const prioridad = PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo]
      if (prioridad !== 0) return prioridad
      const fecha = (a.creadoEn ?? '').localeCompare(b.creadoEn ?? '')
      return fecha || a.idempotencyKey.localeCompare(b.idempotencyKey)
    })
}

function validarTrabajoExistente(
  existente: TrabajoEnvioLocal | null,
  nuevo: TrabajoEnvioLocal,
): void {
  if (
    !existente
    || existente.cuerpoHash !== nuevo.cuerpoHash
    || existente.draftId !== nuevo.draftId
    || tipoTrabajo(existente) !== tipoTrabajo(nuevo)
    || !cuerpoIgual(existente.cuerpo, nuevo.cuerpo)
  ) {
    throw new Error('An idempotency key cannot be reused with a different immutable body')
  }
}

/** Durable queue for immutable submissions and lower-priority offline work. */
export function crearColaTrabajosEnvio(almacen: AlmacenParte) {
  let recuperacionInicialHecha = false

  async function encolarTrabajo(trabajo: TrabajoEnvioLocal): Promise<void> {
    const insertado = await almacen.guardarTrabajoEnvioSiAusente(trabajo)
    if (!insertado) validarTrabajoExistente(
      await almacen.obtenerTrabajosEnvio().then((todos) =>
        todos.find((actual) => actual.idempotencyKey === trabajo.idempotencyKey) ?? null),
      trabajo,
    )
  }

  async function recuperar(): Promise<TrabajoColaEnvio[]> {
    const trabajos = await almacen.obtenerTrabajosEnvio()
    const disponibles: TrabajoEnvioLocal[] = []
    for (const trabajo of trabajos) {
      const confirmacion = await almacen.obtenerConfirmacion(trabajo.idempotencyKey)
      if (confirmacion) {
        await almacen.eliminarTrabajoEnvio(trabajo.idempotencyKey)
        continue
      }
      if (trabajo.estado === 'enviando') {
        const recuperado: TrabajoEnvioLocal = { ...trabajo, estado: 'pendiente' }
        await almacen.guardarTrabajoEnvio(recuperado)
        disponibles.push(recuperado)
      } else {
        disponibles.push(trabajo)
      }
    }
    recuperacionInicialHecha = true
    return ordenar(disponibles)
  }

  return {
    /** Persists the exact frozen body and server idempotency key before any attempt. */
    async guardarEnvio(envio: EnvioInmutable): Promise<void> {
      if (!envio.idempotencyKey || !envio.draftId) throw new TypeError('Submission identity is required')
      if (!envio.cuerpoHash) throw new TypeError('Submission body hash is required')
      const trabajo: TrabajoEnvioLocal = {
        idempotencyKey: envio.idempotencyKey,
        draftId: envio.draftId,
        cuerpo: congelar(clonarCuerpo(envio.cuerpo)),
        cuerpoHash: envio.cuerpoHash,
        estado: 'pendiente',
        version: envio.version,
        tipo: 'reporte_final',
        creadoEn: new Date().toISOString(),
      }
      await encolarTrabajo(trabajo)
    },

    /** Adds draft-sync or photo work; both carry metadata-only JSON bodies. */
    async encolar(nuevo: NuevoTrabajoEnvio): Promise<void> {
      if (!nuevo.idempotencyKey) throw new TypeError('Job idempotency key is required')
      const trabajo: TrabajoEnvioLocal = {
        idempotencyKey: nuevo.idempotencyKey,
        ...(nuevo.draftId ? { draftId: nuevo.draftId } : {}),
        cuerpo: congelar(clonarCuerpo(nuevo.cuerpo)),
        cuerpoHash: nuevo.cuerpoHash ?? '',
        estado: 'pendiente',
        version: 1,
        tipo: nuevo.tipo,
        creadoEn: new Date().toISOString(),
      }
      await encolarTrabajo(trabajo)
    },

    recuperar,

    /** Reconciles confirmations and marks one pending job as in flight. */
    async reclamarSiguiente(): Promise<TrabajoColaEnvio | null> {
      if (!recuperacionInicialHecha) await recuperar()
      const trabajos = ordenar(await almacen.obtenerTrabajosEnvio())
      let siguiente: TrabajoColaEnvio | undefined
      for (const trabajo of trabajos) {
        if (await almacen.obtenerConfirmacion(trabajo.idempotencyKey)) {
          await almacen.eliminarTrabajoEnvio(trabajo.idempotencyKey)
        } else if (!siguiente && trabajo.estado === 'pendiente') {
          siguiente = trabajo
        }
      }
      if (!siguiente) return null
      const enviando: TrabajoColaEnvio = { ...siguiente, estado: 'enviando' }
      await almacen.guardarTrabajoEnvio(enviando)
      return congelar(enviando)
    },

    /** A confirmation is durable before the corresponding queue entry is deleted. */
    async confirmar(idempotencyKey: string, confirmacion: ConfirmacionEnvio): Promise<void> {
      if (!confirmacion.movimientoId) throw new TypeError('Movement identity is required')
      const existente = await almacen.obtenerConfirmacion(idempotencyKey)
      if (existente && existente.movimientoId !== confirmacion.movimientoId) {
        throw new Error('An idempotency key already has a different movement confirmation')
      }
      const registro: ConfirmacionLocal = {
        idempotencyKey,
        ...confirmacion,
        version: 1,
      }
      await almacen.guardarConfirmacion(registro)
      await almacen.eliminarTrabajoEnvio(idempotencyKey)
    },

    obtenerConfirmacion(idempotencyKey: string) {
      return almacen.obtenerConfirmacion(idempotencyKey)
    },
  }
}
