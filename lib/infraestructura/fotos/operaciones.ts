import { abrirAlmacenParte } from '../parte/almacen-indexeddb'
import type { FotoPreparada } from './flujo-formulario'
import { confirmarSubidasFotos, descartarSubidaFotoNoDeclarada, iniciarSubidaFotos } from './subida-cola'
import { hashFoto } from './hash'

export const EVENTO_FOTOS = 'parte:fotos-actualizadas'
const PREFIX = 'fotos-operacion:'
const DEDUP_MS = 30 * 60_000
export type EstadoOperacionFoto = 'pendiente' | 'subiendo' | 'confirmada' | 'error'
export type EntradaOperacionFoto = {
  draftId: string
  movimientoBaseId?: string
  cue?: string
  idempotencyKey: string
  fotos: readonly FotoPreparada[]
}
export type OperacionFoto = Omit<EntradaOperacionFoto, 'fotos'> & {
  draftId: string
  origenDraftId: string
  fotos: FotoPreparada[]
  estado: EstadoOperacionFoto
  creadaEn: number
  movimientoId?: string
  attachmentIds?: string[]
  vinculada?: boolean
  reintentarDespues?: number
}

export function notificarOperacionesFotos(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_FOTOS))
}

async function guardar(op: OperacionFoto): Promise<void> {
  const almacen = await abrirAlmacenParte()
  try { await almacen.guardarContexto(op) } finally { almacen.cerrar() }
  notificarOperacionesFotos()
}

export async function obtenerOperacionFotos(draftId: string): Promise<OperacionFoto | null> {
  const almacen = await abrirAlmacenParte()
  try { return await almacen.obtenerContexto<OperacionFoto>(PREFIX + draftId) } finally { almacen.cerrar() }
}

const activas = new Map<string, Promise<unknown>>()
async function conBloqueo<T>(draftId: string, task: () => Promise<T>): Promise<T> {
  const anterior = activas.get(draftId) ?? Promise.resolve()
  const siguiente = anterior.catch(() => undefined).then(async () => {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return navigator.locks.request(`${PREFIX}${draftId}`, task)
    }
    return task()
  })
  activas.set(draftId, siguiente)
  try { return await siguiente } finally {
    if (activas.get(draftId) === siguiente) activas.delete(draftId)
  }
}

async function conHashes(fotos: readonly FotoPreparada[]): Promise<FotoPreparada[]> {
  const almacen = await abrirAlmacenParte()
  try {
    return await Promise.all(fotos.map(async (foto) => {
      const [optimizada, miniatura] = await Promise.all([
        almacen.obtenerArchivo(`${foto.attachmentId}:optimizada`),
        almacen.obtenerArchivo(`${foto.attachmentId}:miniatura`),
      ])
      if (!optimizada || !miniatura) throw new Error('Faltan fotos en el almacenamiento local.')
      const [optimizadaSha256, miniaturaSha256] = await Promise.all([hashFoto(optimizada), hashFoto(miniatura)])
      return { ...foto, optimizadaSha256, miniaturaSha256 }
    }))
  } finally { almacen.cerrar() }
}

function firma(fotos: readonly FotoPreparada[]): string {
  return fotos.map((foto) => `${foto.optimizadaSha256}:${foto.miniaturaSha256}`).sort().join('|')
}

export async function declararOperacionFotos(input: EntradaOperacionFoto): Promise<void> {
  if (!input.fotos.length) return
  await conBloqueo(input.draftId, async () => {
    let op = await obtenerOperacionFotos(input.draftId)
    // Retrying the original IDs also works after the uploader has released its blobs.
    const mismosIds = op && input.fotos.length === op.fotos.length
      && input.fotos.every((foto, i) => foto.attachmentId === op!.fotos[i].attachmentId)
    const fotos = mismosIds ? op!.fotos : await conHashes(input.fotos)
    const mismoDestino = op && (input.movimientoBaseId
      ? op.movimientoBaseId === input.movimientoBaseId : op.cue === input.cue)
    const mismoLote = mismoDestino && firma(op!.fotos) === firma(fotos)
    if (op && op.estado !== 'confirmada' && !mismoLote) {
      throw new Error('Hay una carga pendiente. Reintente esa carga antes de elegir otro lote.')
    }
    if (op && mismoLote && (op.estado !== 'confirmada' || Date.now() - op.creadaEn <= DEDUP_MS)) {
      for (const foto of input.fotos) {
        if (!op.fotos.some((original) => original.attachmentId === foto.attachmentId)) {
          await descartarSubidaFotoNoDeclarada(foto.attachmentId)
        }
      }
    }
    if (!op || !mismoLote || (op.estado === 'confirmada' && Date.now() - op.creadaEn > DEDUP_MS)) {
      const nueva: OperacionFoto = { ...input, draftId: PREFIX + input.draftId, origenDraftId: input.draftId,
        fotos, estado: 'pendiente', creadaEn: Date.now() }
      const almacen = await abrirAlmacenParte()
      let guardada: boolean
      try { guardada = await almacen.guardarContextoSiActual(nueva, op?.idempotencyKey) } finally { almacen.cerrar() }
      if (!guardada) {
        // IndexedDB CAS preserves one identity even in browsers without Web Locks.
        const ganadora = await obtenerOperacionFotos(input.draftId)
        if (!ganadora || firma(ganadora.fotos) !== firma(fotos)
          || ganadora.movimientoBaseId !== input.movimientoBaseId || ganadora.cue !== input.cue) {
          throw new Error('Otra pestaña guardó una carga. Vuelva a abrir la carga pendiente.')
        }
        op = ganadora
      } else op = nueva
      notificarOperacionesFotos()
    }
    if (op.estado === 'confirmada') return
    try { await enviar(op) } catch (error) { iniciarSubidaFotos(); throw error }
  })
}

async function vincular(op: OperacionFoto): Promise<void> {
  const almacen = await abrirAlmacenParte()
  try {
    for (const [i, foto] of op.fotos.entries()) {
      const target = op.attachmentIds![i]
      if (target === foto.attachmentId) continue
      const jobs = await almacen.obtenerTrabajosEnvio()
      const source = jobs.find((job) => job.idempotencyKey === `foto:${foto.attachmentId}`)
      if (!source) continue // A previous recovery already remapped this job.
      for (const variant of ['optimizada', 'miniatura']) {
        const blob = await almacen.obtenerArchivo(`${foto.attachmentId}:${variant}`)
        if (blob) await almacen.guardarArchivo(`${target}:${variant}`, blob)
      }
      await almacen.guardarTrabajoEnvioSiAusente({ ...source, idempotencyKey: `foto:${target}`,
        cuerpo: { ...(source.cuerpo as object), attachmentId: target, movimientoId: op.movimientoId,
          optimizadaAuthorization: undefined, miniaturaAuthorization: undefined, reintentarDespues: undefined, intentos: undefined }, estado: 'pendiente' })
      await almacen.eliminarTrabajoEnvio(source.idempotencyKey)
      for (const variant of ['optimizada', 'miniatura']) await almacen.eliminarArchivo(`${foto.attachmentId}:${variant}`)
    }
  } finally { almacen.cerrar() }
  // Only mark linkage durable AFTER every queue job has its server movement.
  // Defer the uploader until this marker is saved so crash recovery can replay either step.
  await confirmarSubidasFotos(op.origenDraftId, op.movimientoId!, op.attachmentIds, false)
  op.vinculada = true
  op.estado = 'subiendo'
  await guardar(op)
  iniciarSubidaFotos()
}

async function enviar(op: OperacionFoto): Promise<void> {
  try {
    if (!op.movimientoId) {
      op.estado = 'pendiente'
      await guardar(op)
      const response = await fetch('/api/problematicas/parte/evidencia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimientoBaseId: op.movimientoBaseId, cue: op.cue, idempotencyKey: op.idempotencyKey,
          fotos: op.fotos.map((foto) => ({ attachmentId: foto.attachmentId,
            optimizadaSize: foto.bytesOptimizado, miniaturaSize: foto.bytesMiniatura,
            optimizadaContentType: foto.optimizadaContentType, miniaturaContentType: foto.miniaturaContentType,
            optimizadaSha256: foto.optimizadaSha256, miniaturaSha256: foto.miniaturaSha256 })) }),
      })
      if (response.status === 404) {
        const body = await response.json().catch(() => null) as { code?: string } | null
        if (body?.code === 'sin_parte') {
          // Keep the public error type used by the report form without a runtime import cycle.
          const { SinParteError } = await import('./flujo-formulario')
          throw new SinParteError()
        }
      }
      if (!response.ok) throw new Error('No se pudieron asociar las fotos; se conservaron en este dispositivo.')
      const result = await response.json() as { movimientoId?: string; documentaMovimientoId?: string; attachmentIds?: string[] }
      if (!result.movimientoId) throw new Error('El servidor no confirmó la evidencia fotográfica.')
      const ids = result.attachmentIds ?? op.fotos.map((foto) => foto.attachmentId)
      if (ids.length !== op.fotos.length || ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
        throw new Error('El servidor no confirmó los identificadores de las fotos.')
      }
      op.movimientoId = result.movimientoId
      op.attachmentIds = ids
      // This also pins CUE-only operations after an ambiguous/lost reply.
      op.movimientoBaseId = result.documentaMovimientoId ?? op.movimientoBaseId
      await guardar(op)
    }
    await vincular(op)
  } catch (error) {
    op.estado = 'error'
    op.reintentarDespues = Date.now() + 5_000
    await guardar(op)
    throw error
  }
}

async function listar(): Promise<OperacionFoto[]> {
  const almacen = await abrirAlmacenParte()
  try {
    return (await almacen.obtenerContextos<OperacionFoto>()).filter((op) => op.draftId.startsWith(PREFIX))
  } finally { almacen.cerrar() }
}

export async function proximoReintentoOperacion(): Promise<number | undefined> {
  const fechas = (await listar()).filter((op) => op.estado !== 'confirmada' && !op.vinculada)
    .map((op) => op.reintentarDespues).filter((fecha): fecha is number => typeof fecha === 'number')
  return fechas.length ? Math.min(...fechas) : undefined
}

export async function recuperarOperacionesFotos(): Promise<void> {
  const almacen = await abrirAlmacenParte()
  let jobs: Awaited<ReturnType<typeof almacen.obtenerTrabajosEnvio>>
  try { jobs = await almacen.obtenerTrabajosEnvio() } finally { almacen.cerrar() }
  for (const op of await listar()) {
    if (op.estado === 'confirmada') continue
    if (op.movimientoId && op.vinculada) {
      const ids = [...op.fotos.map((foto) => foto.attachmentId), ...(op.attachmentIds ?? [])]
      const vinculados = jobs.filter((job) => job.tipo === 'foto' && ids.includes((job.cuerpo as { attachmentId: string }).attachmentId))
      if (vinculados.every((job) => (job.cuerpo as { movimientoId?: string }).movimientoId === op.movimientoId)) continue
    }
    if (op.reintentarDespues && op.reintentarDespues > Date.now()) continue
    await conBloqueo(op.origenDraftId, async () => {
      const actual = await obtenerOperacionFotos(op.origenDraftId)
      if (actual && actual.estado !== 'confirmada') await enviar(actual).catch(() => undefined)
    })
  }
}

export async function actualizarEstadosOperaciones(): Promise<void> {
  const almacen = await abrirAlmacenParte()
  try {
    const jobs = await almacen.obtenerTrabajosEnvio()
    for (const op of await listar()) {
      if (!op.movimientoId || !op.vinculada || op.estado === 'confirmada') continue
      const pendientes = jobs.filter((job) => job.tipo === 'foto' && op.attachmentIds?.includes((job.cuerpo as { attachmentId: string }).attachmentId))
      const estado = !pendientes.length ? 'confirmada' : pendientes.some((job) => job.estado === 'error' || job.estado === 'sesion-vencida') ? 'error' : 'subiendo'
      if (estado !== op.estado) await guardar({ ...op, estado })
    }
  } finally { almacen.cerrar() }
}
