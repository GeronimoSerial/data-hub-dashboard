import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  categorias,
  niveles,
  recursoAudienciaNivelesJur,
  recursoAudienciaUsuarios,
  recursoTags,
  recursos,
  tags,
  tipos,
} from '@/lib/db/schema'
import type { Categoria, Formato, Recurso, Tipo } from '@/lib/model'

export async function loadHubCatalog(opts: { publishedOnly: boolean }) {
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
    opts.publishedOnly
      ? db.select().from(recursos).where(eq(recursos.estado, 'publicado'))
      : db.select().from(recursos),
    db.select().from(niveles),
    db.select().from(tipos),
    db.select().from(categorias),
    db.select().from(tags),
    db.select().from(recursoTags),
    db.select().from(recursoAudienciaNivelesJur),
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
    (row) => row.nivelJurisdiccionalId,
  )
  const audUsersByRecurso = groupIds(
    audUserRows,
    (row) => row.recursoId,
    (row) => row.userId,
  )

  const mapped: Recurso[] = recursoRows.map((row) => ({
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
    cargadoEn: row.cargadoEn ?? undefined,
    size: row.size ?? undefined,
    audienciaNivelJurIds: audNivelesByRecurso.get(row.id) ?? [],
    audienciaUserIds: audUsersByRecurso.get(row.id) ?? [],
  }))

  return {
    recursos: mapped,
    niveles: nivelRows,
    // aplicaA/color se guardan como text (string) en el schema; el modelo
    // los tipa como uniones acotadas (Formato[]/BadgeColor) por dominio real.
    tipos: tipoRows as unknown as Tipo[],
    categorias: categoriaRows as unknown as Categoria[],
    tags: tagRows,
  }
}

function groupIds<T, V = string>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => V,
) {
  const map = new Map<string, V[]>()
  for (const row of rows) {
    const id = key(row)
    const list = map.get(id)
    if (list) list.push(value(row))
    else map.set(id, [value(row)])
  }
  return map
}
