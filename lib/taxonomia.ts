import { count, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  recursoAudienciaNiveles,
  recursoTags,
  recursos,
  userNiveles,
} from '@/lib/db/schema'

export const TAXONOMY_KINDS = [
  'niveles',
  'tipos',
  'categorias',
  'tags',
] as const
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number]

export function isTaxonomyKind(value: string): value is TaxonomyKind {
  return (TAXONOMY_KINDS as readonly string[]).includes(value)
}

export function nivelInUseTotal(parts: {
  recursos: number
  userNiveles: number
  audienciaNiveles: number
}) {
  return parts.recursos + parts.userNiveles + parts.audienciaNiveles
}

export async function taxonomyInUseCount(kind: TaxonomyKind, id: string) {
  const db = getDb()
  if (kind === 'niveles') {
    const [recursoRows, userRows, audienciaRows] = await Promise.all([
      db
        .select({ n: count() })
        .from(recursos)
        .where(eq(recursos.nivelId, id)),
      db
        .select({ n: count() })
        .from(userNiveles)
        .where(eq(userNiveles.nivelId, id)),
      db
        .select({ n: count() })
        .from(recursoAudienciaNiveles)
        .where(eq(recursoAudienciaNiveles.nivelId, id)),
    ])
    return nivelInUseTotal({
      recursos: recursoRows[0]?.n ?? 0,
      userNiveles: userRows[0]?.n ?? 0,
      audienciaNiveles: audienciaRows[0]?.n ?? 0,
    })
  }
  if (kind === 'tipos') {
    const [row] = await db
      .select({ n: count() })
      .from(recursos)
      .where(eq(recursos.tipoId, id))
    return row?.n ?? 0
  }
  if (kind === 'categorias') {
    const [row] = await db
      .select({ n: count() })
      .from(recursos)
      .where(eq(recursos.categoriaId, id))
    return row?.n ?? 0
  }
  const [row] = await db
    .select({ n: count() })
    .from(recursoTags)
    .where(eq(recursoTags.tagId, id))
  return row?.n ?? 0
}
