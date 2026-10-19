import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { cambioAuditado } from '../auditoria/servidor'
import { infraAdjunto } from '@/lib/db/schema'
import { getObsBucket, headAttachmentObject, ObsObjectMissingError, type AttachmentObjectMetadata } from './obs'

export type ConfirmarAdjuntoInput = {
  attachmentId: string
  movimientoId: string
  optimizadaEtag?: string
  miniaturaEtag?: string
}

export type ConfirmarAdjuntoResult =
  | { ok: true; repetido: boolean; optimizadaEtag: string; miniaturaEtag: string }
  | { ok: false; status: 404 | 409; code: 'not_found' | 'object_not_ready'; missingVariants?: ('optimizada' | 'miniatura')[] }

/** Verifies both OBS objects and marks the row confirmed in an idempotent update. */
export async function confirmarAdjunto(input: ConfirmarAdjuntoInput): Promise<ConfirmarAdjuntoResult> {
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
  return cambioAuditado(async tx => {
    if (!repetido) {
      await tx.update(infraAdjunto).set({
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
  }, () => ({ status: 200, objetoTipo: 'adjunto', objetoId: input.attachmentId,
    resultado: repetido ? 'repetido' : 'exito', metadatos: { attachmentId: input.attachmentId, movimientoId: input.movimientoId } }), db)
}
