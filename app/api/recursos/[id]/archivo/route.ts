import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { eq } from 'drizzle-orm'
import {
  archivoAbsPath,
  archivoCanServe,
  archivoGate,
  archivoResponseHeaders,
  archivoStorageKey,
  unlinkStoredFile,
} from '@/lib/archivo'
import { getUploadsDir } from '@/lib/data-dir'
import { getDb } from '@/lib/db'
import {
  recursoAudienciaNivelesJur,
  recursoAudienciaUsuarios,
  recursos,
} from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { isAllowedUpload } from '@/lib/upload'
import { normalizeUploadedMapHtml } from '@/lib/html-map-tiles'
import type { RecursoAccess } from '@/lib/acl'
import { ruta } from '@/lib/http/ruta'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { puedeVerEnSeccion } from '@/lib/acl'
import { nombreArchivo } from '@/lib/archivo-metadata'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function loadRecursoWithAccess(id: string) {
  const db = getDb()
  const [row] = await db.select().from(recursos).where(eq(recursos.id, id))
  if (!row) return null
  const [nivelRows, userRows] = await Promise.all([
    db
      .select({ nivelJurisdiccionalId: recursoAudienciaNivelesJur.nivelJurisdiccionalId })
      .from(recursoAudienciaNivelesJur)
      .where(eq(recursoAudienciaNivelesJur.recursoId, id)),
    db
      .select({ userId: recursoAudienciaUsuarios.userId })
      .from(recursoAudienciaUsuarios)
      .where(eq(recursoAudienciaUsuarios.recursoId, id)),
  ])
  const access: RecursoAccess = {
    id: row.id,
    estado: row.estado as RecursoAccess['estado'],
    audienciaNivelJurIds: nivelRows.map((r) => r.nivelJurisdiccionalId),
    audienciaUserIds: userRows.map((r) => r.userId),
  }
  return { row, access }
}

async function handleGET(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const user = await getSessionUser()
  const { id } = await ctx.params
  const loaded = await loadRecursoWithAccess(id)
  const hasBlob = Boolean(loaded?.row.storageKey)
  const status = archivoGate(user, loaded?.access ?? null, hasBlob)
  const sectionAllowed = Boolean(user && loaded && puedeVerEnSeccion(user, {
    ...loaded.access,
    formato: loaded.row.formato as 'reporte' | 'tablero' | 'mapa',
    ruta: loaded.row.ruta,
  }, user.hubPolicy))
  if (status === 401) {
    return Response.json({ error: 'No autenticado' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  }
  if (status === 403 || (user && loaded && !sectionAllowed)) {
    return Response.json({ error: 'No tiene acceso a este recurso' }, {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
  if (status !== 200 || !loaded?.row.storageKey) {
    return Response.json({ error: 'Archivo no encontrado' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  }
  const mime = loaded.row.mime
  if (!archivoCanServe(mime)) {
    return Response.json({ error: 'Archivo no encontrado' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const abs = archivoAbsPath(loaded.row.storageKey)
  if (!abs) {
    return Response.json({ error: 'Archivo no encontrado' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  }
  const fileStat = await stat(abs).catch(() => null)
  if (!fileStat?.isFile()) {
    return Response.json({ error: 'Archivo no encontrado' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const url = new URL(request.url)
  const download = url.searchParams.get('download') === '1'
  const headers = archivoResponseHeaders({
    mime,
    nombreOriginal: nombreArchivo(loaded.row) || (mime === 'text/html' ? 'archivo.html' : 'archivo'),
    download,
  })
  headers['Cache-Control'] = 'private, no-store'

  if (mime === 'text/html' && !download) {
    const html = await readFile(abs, 'utf8')
    return new Response(normalizeUploadedMapHtml(html), { headers })
  }

  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream<Uint8Array>
  return new Response(stream, { headers })
}

async function handlePOST(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const denied = staffGuard(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  const { id } = await ctx.params
  describirAuditoria({ objetoTipo: 'recurso', objetoId: id })
  const db = getDb()
  const [row] = await db
    .select({ id: recursos.id, storageKey: recursos.storageKey })
    .from(recursos)
    .where(eq(recursos.id, id))
  if (!row) {
    return Response.json({ error: 'Recurso no encontrado' }, { status: 404 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'Archivo requerido' }, { status: 400 })
  }

  const allowed = isAllowedUpload({
    type: file.type,
    size: file.size,
    name: file.name,
  })
  if (!allowed.ok) {
    return Response.json({ error: allowed.error }, { status: 400 })
  }

  const fileId = crypto.randomUUID()
  const storageKey = archivoStorageKey(id, fileId)
  const destDir = path.join(getUploadsDir(), id)
  const destPath = path.join(destDir, fileId)
  let storedBytes: Buffer
  try {
    const uploadedBytes = Buffer.from(await file.arrayBuffer())
    storedBytes =
      allowed.mime === 'text/html'
        ? Buffer.from(normalizeUploadedMapHtml(uploadedBytes.toString('utf8')))
        : uploadedBytes
    await mkdir(destDir, { recursive: true })
    await writeFile(destPath, storedBytes)
  } catch {
    await unlinkStoredFile(storageKey)
    return Response.json({ error: 'No se pudo guardar el archivo' }, { status: 500 })
  }

  const previousKey = row.storageKey
  const cargadoEn = new Date().toISOString()
  try {
    await cambioAuditado(
      async tx => {
        await tx
          .update(recursos)
          .set({
            storageKey,
            mime: allowed.mime,
            nombreOriginal: file.name,
            cargadoEn,
            size: storedBytes.length,
            ruta: null,
          })
          .where(eq(recursos.id, id))
      },
      () => ({
        status: 200,
        objetoTipo: 'recurso',
        objetoId: id,
        metadatos: { formato: allowed.mime.split('/')[1], cantidad: storedBytes.length },
      }),
    )
  } catch (error) {
    // El archivo ya está escrito y la fila no apunta a él: se descarta para no dejar huérfanos.
    await unlinkStoredFile(storageKey)
    throw error
  }

  if (previousKey && previousKey !== storageKey) {
    await unlinkStoredFile(previousKey)
  }

  return Response.json({
    ok: true,
    storageKey,
    mime: allowed.mime,
    nombreOriginal: file.name,
    cargadoEn,
    size: storedBytes.length,
  })
}

export const GET = ruta('recursos.id.archivo.get', handleGET)
export const POST = conAuditoria('recurso.archivo', '/api/recursos/[id]/archivo', ruta('recursos.id.archivo.post', handlePOST))
