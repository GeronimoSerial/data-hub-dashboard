import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraAdjunto } from '@/lib/db/schema'
import { contextoAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { cambioAuditado, type DescripcionResultado } from '@/lib/infraestructura/auditoria/servidor'
import { getObsBucket, headAttachmentObject, ObsObjectMissingError, type AttachmentObjectMetadata } from './obs'

/** Ejecuta la escritura junto con su evento (cambioAuditado). Por defecto, sin auditoría. */
export type TransaccionConfirmacion = <T>(
  ejecutar: () => Promise<T>,
  describir: (valor: T) => DescripcionResultado,
) => Promise<T>

export type ConfirmarAdjuntoInput = {
  attachmentId: string
  movimientoId: string
  optimizadaEtag?: string
  miniaturaEtag?: string
}

export type ConfirmarAdjuntoResult =
  | { ok: true; repetido: boolean; optimizadaEtag: string; miniaturaEtag: string }
  | { ok: false; status: 404 | 409; code: 'not_found' | 'object_not_ready'; missingVariants?: ('optimizada' | 'miniatura')[] }

/**
 * Verifies both OBS objects and marks the row confirmed in an idempotent update.
 * La verificación OBS queda fuera de `transaccion`; solo la escritura y su evento comparten transacción.
 */
/** Dentro de una solicitud auditada, la escritura y su evento comparten transacción; fuera, se escribe sin evento. */
const transaccionPorDefecto: TransaccionConfirmacion = (ejecutar, describir) =>
  contextoAuditoria.getStore() ? cambioAuditado(ejecutar, describir) : ejecutar()

export async function confirmarAdjunto(
  input: ConfirmarAdjuntoInput,
  transaccion: TransaccionConfirmacion = transaccionPorDefecto,
): Promise<ConfirmarAdjuntoResult> {
  const db = getDb()
  const [adjunto] = await db.select({
    id: infraAdjunto.id,
    movimientoId: infraAdjunto.movimientoId,
    optimizadaObsKey: infraAdjunto.optimizadaObsKey,
    optimizadaSize: infraAdjunto.optimizadaSize,
    optimizadaContentType: infraAdjunto.optimizadaContentType,
    optimizadaEtag: infraAdjunto.optimizadaEtag,
    miniaturaObsKey: infraAdjunto.miniaturaObsKey,
    miniaturaSize: infraAdjunto.miniaturaSize,
    miniaturaContentType: infraAdjunto.miniaturaContentType,
    miniaturaEtag: infraAdjunto.miniaturaEtag,
    estado: infraAdjunto.estado,
  }).from(infraAdjunto).where(and(
    eq(infraAdjunto.id, input.attachmentId),
    eq(infraAdjunto.movimientoId, input.movimientoId),
  )).limit(1)

  if (!adjunto) return { ok: false, status: 404, code: 'not_found' }

  const reads = await Promise.allSettled([
    headAttachmentObject(getObsBucket(), adjunto.optimizadaObsKey),
    headAttachmentObject(getObsBucket(), adjunto.miniaturaObsKey),
  ])
  const missingVariants: ('optimizada' | 'miniatura')[] = []
  for (const [index, read] of reads.entries()) {
    if (read.status === 'rejected') {
      if (read.reason instanceof ObsObjectMissingError) missingVariants.push(index === 0 ? 'optimizada' : 'miniatura')
      else throw read.reason
    }
  }
  if (missingVariants.length) return { ok: false, status: 409, code: 'object_not_ready', missingVariants }
  const objects = {
    optimizada: (reads[0] as PromiseFulfilledResult<AttachmentObjectMetadata>).value,
    miniatura: (reads[1] as PromiseFulfilledResult<AttachmentObjectMetadata>).value,
  }
  const invalidVariants: ('optimizada' | 'miniatura')[] = []
  if (objects.optimizada.size !== adjunto.optimizadaSize
    || objects.optimizada.contentType !== adjunto.optimizadaContentType
    || (input.optimizadaEtag && input.optimizadaEtag.replaceAll('"', '') !== objects.optimizada.etag)) {
    invalidVariants.push('optimizada')
  }
  if (objects.miniatura.size !== adjunto.miniaturaSize
    || objects.miniatura.contentType !== adjunto.miniaturaContentType
    || (input.miniaturaEtag && input.miniaturaEtag.replaceAll('"', '') !== objects.miniatura.etag)) {
    invalidVariants.push('miniatura')
  }
  if (invalidVariants.length) return { ok: false, status: 409, code: 'object_not_ready', missingVariants: invalidVariants }

  const repetido = adjunto.estado === 'confirmed'
    && adjunto.optimizadaEtag === objects.optimizada.etag
    && adjunto.miniaturaEtag === objects.miniatura.etag
  return transaccion(async () => {
    if (!repetido) {
      // getDb() dentro de la transacción: une la escritura con el evento (db se capturó antes).
      await getDb().update(infraAdjunto).set({
        estado: 'confirmed',
        optimizadaEtag: objects.optimizada.etag,
        miniaturaEtag: objects.miniatura.etag,
      }).where(and(
        eq(infraAdjunto.id, input.attachmentId),
        eq(infraAdjunto.movimientoId, input.movimientoId),
      ))
    }
    return {
      ok: true as const,
      repetido,
      optimizadaEtag: objects.optimizada.etag,
      miniaturaEtag: objects.miniatura.etag,
    }
  }, valor => ({ status: 200, resultado: valor.repetido ? 'repetido' : 'exito' }))
}
