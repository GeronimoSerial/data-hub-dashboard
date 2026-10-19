import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { infraAdjunto, infraMovimiento, infraParte } from '@/lib/db/schema'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { firmarLecturaAdjunto } from '@/lib/infraestructura/adjuntos/lectura'
import { getReportesOfflineFeatures, reportesOfflineFlagDisabledResponse } from '@/lib/infraestructura/parte/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' }
const ID_SEGURO = /^[a-zA-Z0-9_-]{1,128}$/

async function atenderGET(request: Request) {
  if (!getReportesOfflineFeatures().fotos) return reportesOfflineFlagDisabledResponse()
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const { searchParams } = new URL(request.url)
  const cue = normalizeCue(searchParams.get('cue') ?? '')
  if (!cue) return Response.json({ error: 'CUE inválido' }, { status: 400, headers: CACHE_HEADERS })
  await ensureSeeded()

  const attachmentId = searchParams.get('attachmentId')
  describirAuditoria({ objetoTipo: 'adjunto', cueAnexo: cue.value, objetoId: attachmentId })
  const variant = searchParams.get('variant')
  if (attachmentId !== null) {
    if (!ID_SEGURO.test(attachmentId) || variant !== 'optimizada') {
      return Response.json({ error: 'Adjunto inválido' }, { status: 400, headers: CACHE_HEADERS })
    }
    const [row] = await getDb()
      .select({ key: infraAdjunto.optimizadaObsKey })
      .from(infraAdjunto)
      .innerJoin(infraMovimiento, eq(infraMovimiento.id, infraAdjunto.movimientoId))
      .innerJoin(infraParte, eq(infraParte.id, infraMovimiento.parteId))
      .where(and(eq(infraParte.cueAnexo, cue.value), eq(infraAdjunto.id, attachmentId), eq(infraAdjunto.estado, 'confirmed')))
      .limit(1)
    if (!row) return Response.json({ error: 'Adjunto no encontrado' }, { status: 404, headers: CACHE_HEADERS })
    try {
      const url = await firmarLecturaAdjunto(row.key)
      return Response.json({ url }, { headers: CACHE_HEADERS })
    } catch {
      return Response.json({ error: 'No se pudo autorizar la lectura del adjunto' }, { status: 503, headers: CACHE_HEADERS })
    }
  }

  const rows = await getDb()
    .select({
      attachmentId: infraAdjunto.id,
      thumbnailKey: infraAdjunto.miniaturaObsKey,
      movementId: infraMovimiento.id,
      movementType: infraMovimiento.tipo,
      createdAt: infraMovimiento.creadaEn,
    })
    .from(infraAdjunto)
    .innerJoin(infraMovimiento, eq(infraMovimiento.id, infraAdjunto.movimientoId))
    .innerJoin(infraParte, eq(infraParte.id, infraMovimiento.parteId))
    .where(and(eq(infraParte.cueAnexo, cue.value), eq(infraAdjunto.estado, 'confirmed')))
    .orderBy(desc(infraMovimiento.creadaEn), desc(infraAdjunto.id))

  const movements = new Map<string, {
    id: string
    type: string
    createdAt: string
    photos: { attachmentId: string; thumbnailUrl: string }[]
  }>()
  let signedRows: { row: (typeof rows)[number]; thumbnailUrl: string }[]
  try {
    signedRows = await Promise.all(rows.map(async (row) => ({
      row,
      thumbnailUrl: await firmarLecturaAdjunto(row.thumbnailKey),
    })))
  } catch {
    return Response.json({ error: 'No se pudo autorizar la lectura de las fotos' }, { status: 503, headers: CACHE_HEADERS })
  }
  for (const { row, thumbnailUrl } of signedRows) {
    let movement = movements.get(row.movementId)
    if (!movement) {
      movement = {
        id: row.movementId,
        type: row.movementType,
        createdAt: row.createdAt,
        photos: [],
      }
      movements.set(row.movementId, movement)
    }
    movement.photos.push({ attachmentId: row.attachmentId, thumbnailUrl })
  }
  describirAuditoria({ metadatos: { cantidad: signedRows.length } })
  return Response.json({ movements: [...movements.values()] }, { headers: CACHE_HEADERS })
}

export const GET = conAuditoria('foto.autorizar_lectura', '/api/infraestructura/adjuntos', atenderGET)
