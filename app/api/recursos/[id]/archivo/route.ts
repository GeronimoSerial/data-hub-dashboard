import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { eq } from 'drizzle-orm'
import {
  archivoAbsPath,
  archivoGate,
  archivoResponseHeaders,
  archivoStorageKey,
  unlinkStoredFile,
} from '@/lib/archivo'
import { getUploadsDir } from '@/lib/data-dir'
import { getDb } from '@/lib/db'
import {
  recursoAudienciaNiveles,
  recursoAudienciaUsuarios,
  recursos,
} from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { isAllowedUpload } from '@/lib/upload'
import type { RecursoAccess } from '@/lib/acl'

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
      .select({ nivelId: recursoAudienciaNiveles.nivelId })
      .from(recursoAudienciaNiveles)
      .where(eq(recursoAudienciaNiveles.recursoId, id)),
    db
      .select({ userId: recursoAudienciaUsuarios.userId })
      .from(recursoAudienciaUsuarios)
      .where(eq(recursoAudienciaUsuarios.recursoId, id)),
  ])
  const access: RecursoAccess = {
    estado: row.estado as RecursoAccess['estado'],
    audienciaNivelIds: nivelRows.map((r) => r.nivelId),
    audienciaUserIds: userRows.map((r) => r.userId),
  }
  return { row, access }
}

export async function GET(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const user = await getSessionUser()
  const { id } = await ctx.params
  const loaded = await loadRecursoWithAccess(id)
  const hasBlob = Boolean(loaded?.row.storageKey)
  const status = archivoGate(user, loaded?.access ?? null, hasBlob)
  if (status === 401) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (status === 403) {
    return Response.json(
      { error: 'No tenés acceso a este recurso' },
      { status: 403 },
    )
  }
  if (status !== 200 || !loaded?.row.storageKey) {
    return Response.json({ error: 'Archivo no encontrado' }, { status: 404 })
  }

  const abs = archivoAbsPath(loaded.row.storageKey)
  if (!abs) {
    return Response.json({ error: 'Archivo no encontrado' }, { status: 404 })
  }
  const fileStat = await stat(abs).catch(() => null)
  if (!fileStat?.isFile()) {
    return Response.json({ error: 'Archivo no encontrado' }, { status: 404 })
  }

  const url = new URL(request.url)
  const download = url.searchParams.get('download') === '1'
  const headers = archivoResponseHeaders({
    mime: loaded.row.mime || 'application/octet-stream',
    nombreOriginal: loaded.row.nombreOriginal || 'archivo',
    download,
  })

  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream<Uint8Array>
  return new Response(stream, { headers })
}

export async function POST(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const denied = staffGuard(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  const { id } = await ctx.params
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
  try {
    await mkdir(destDir, { recursive: true })
    await writeFile(destPath, Buffer.from(await file.arrayBuffer()))
  } catch {
    await unlinkStoredFile(storageKey)
    return Response.json({ error: 'No se pudo guardar el archivo' }, { status: 500 })
  }

  const previousKey = row.storageKey
  await db
    .update(recursos)
    .set({
      storageKey,
      mime: allowed.mime,
      nombreOriginal: file.name,
      size: file.size,
      ruta: null,
    })
    .where(eq(recursos.id, id))

  if (previousKey && previousKey !== storageKey) {
    await unlinkStoredFile(previousKey)
  }

  return Response.json({
    ok: true,
    storageKey,
    mime: allowed.mime,
    nombreOriginal: file.name,
    size: file.size,
  })
}
