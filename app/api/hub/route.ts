import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  categorias,
  niveles,
  recursoAudienciaNiveles,
  recursoAudienciaUsuarios,
  recursoTags,
  recursos,
  tags,
  tipos,
} from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import type { Formato, Recurso } from '@/lib/model'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()
  const db = getDb()

  const [
    recursoRows,
    nivelRows,
    tipoRows,
    categoriaRows,
    tagRows,
    tagJoins,
    audNivelRows,
    audUserRows,
  ] = await Promise.all([
    db.select().from(recursos).where(eq(recursos.estado, 'publicado')),
    db.select().from(niveles),
    db.select().from(tipos),
    db.select().from(categorias),
    db.select().from(tags),
    db.select().from(recursoTags),
    db.select().from(recursoAudienciaNiveles),
    db.select().from(recursoAudienciaUsuarios),
  ])

  const tagIdsByRecurso = groupIds(
    tagJoins,
    (row) => row.recursoId,
    (row) => row.tagId,
  )
  const audNivelesByRecurso = groupIds(
    audNivelRows,
    (row) => row.recursoId,
    (row) => row.nivelId,
  )
  const audUsersByRecurso = groupIds(
    audUserRows,
    (row) => row.recursoId,
    (row) => row.userId,
  )

  const published: Recurso[] = recursoRows.map((row) => ({
    id: row.id,
    titulo: row.titulo,
    descripcion: row.descripcion,
    formato: row.formato as Formato,
    nivelId: row.nivelId,
    tipoId: row.tipoId,
    categoriaId: row.categoriaId,
    tagIds: tagIdsByRecurso.get(row.id) ?? [],
    area: row.area,
    actualizado: row.actualizado,
    estado: row.estado as Recurso['estado'],
    ruta: row.ruta ?? undefined,
    storageKey: row.storageKey ?? undefined,
    mime: row.mime ?? undefined,
    nombreOriginal: row.nombreOriginal ?? undefined,
    size: row.size ?? undefined,
    audienciaNivelIds: audNivelesByRecurso.get(row.id) ?? [],
    audienciaUserIds: audUsersByRecurso.get(row.id) ?? [],
  }))

  return Response.json({
    recursos: published,
    niveles: nivelRows,
    tipos: tipoRows,
    categorias: categoriaRows,
    tags: tagRows,
  })
}

function groupIds<T>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => string,
) {
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const id = key(row)
    const list = map.get(id)
    if (list) list.push(value(row))
    else map.set(id, [value(row)])
  }
  return map
}
