import { getDb } from '@/lib/db'
import { categorias, recursos, recursoTags, tags } from '@/lib/db/schema'

// ID estable, mismo patrón que RECURSO_INFRAESTRUCTURA_ID
// (lib/infraestructura/recurso-seed.ts): un id fijo evita tener que buscar el
// recurso por título en el resto del código.
export const RECURSO_NATALIDAD_ID = 'recurso-natalidad'

const CATEGORIA_NATALIDAD = {
  id: 'demografia',
  nombre: 'Demografía',
  color: 'informative' as const,
}

const TAGS_REQUERIDOS = [
  { id: 'territorial', nombre: 'Territorial' },
  { id: 'planificacion', nombre: 'Planificación' },
]

const RECURSO_NATALIDAD = {
  id: RECURSO_NATALIDAD_ID,
  titulo: 'Mapa de natalidad',
  descripcion:
    'Nacidos vivos por departamento (2014–2023) contra la oferta vigente de nivel inicial, para planificar dónde la caída de la natalidad ya alcanza a la matrícula de Sala de 3/4/5.',
  formato: 'mapa' as const,
  nivelId: 'transversal',
  tipoId: 'georref',
  categoriaId: CATEGORIA_NATALIDAD.id,
  area: 'Dirección de Planeamiento',
  actualizado: '2026-09-25',
  estado: 'publicado' as const,
  ruta: '/mapas/natalidad',
}

// Alta idempotente del recurso del catálogo, corre en cada arranque (ver
// upsertRecursoInfraestructura, mismo patrón). Nunca toca
// recurso_audiencia_niveles ni recurso_audiencia_usuarios: la audiencia que
// un admin configuró para este recurso no se pisa en un reinicio.
export async function upsertRecursoNatalidad() {
  const db = getDb()

  await db.insert(categorias).values(CATEGORIA_NATALIDAD).onConflictDoNothing()

  for (const tag of TAGS_REQUERIDOS) {
    await db.insert(tags).values(tag).onConflictDoNothing()
  }

  await db
    .insert(recursos)
    .values(RECURSO_NATALIDAD)
    .onConflictDoUpdate({
      target: recursos.id,
      set: {
        titulo: RECURSO_NATALIDAD.titulo,
        descripcion: RECURSO_NATALIDAD.descripcion,
        formato: RECURSO_NATALIDAD.formato,
        nivelId: RECURSO_NATALIDAD.nivelId,
        tipoId: RECURSO_NATALIDAD.tipoId,
        categoriaId: RECURSO_NATALIDAD.categoriaId,
        area: RECURSO_NATALIDAD.area,
        actualizado: RECURSO_NATALIDAD.actualizado,
        estado: RECURSO_NATALIDAD.estado,
        ruta: RECURSO_NATALIDAD.ruta,
      },
    })

  for (const tag of TAGS_REQUERIDOS) {
    await db
      .insert(recursoTags)
      .values({ recursoId: RECURSO_NATALIDAD_ID, tagId: tag.id })
      .onConflictDoNothing()
  }
}
