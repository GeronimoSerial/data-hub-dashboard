import { getDb } from '@/lib/db'
import { categorias, recursos, recursoTags, tags } from '@/lib/db/schema'

// ID estable, mismo patrón que RECURSO_NATALIDAD_ID (lib/mapas/recurso-seed-natalidad.ts).
export const RECURSO_REORGANIZACION_ID = 'recurso-reorganizacion'

const CATEGORIA_REORGANIZACION = {
  id: 'planificacion-territorial',
  nombre: 'Planificación territorial',
  color: 'informative' as const,
}

const TAGS_REQUERIDOS = [
  { id: 'territorial', nombre: 'Territorial' },
  { id: 'planificacion', nombre: 'Planificación' },
]

const RECURSO_REORGANIZACION = {
  id: RECURSO_REORGANIZACION_ID,
  titulo: 'Reorganización escolar',
  descripcion:
    'Establecimientos primarios de hasta 10 alumnos, zonas de agrupamiento, tendencia de matrícula y potencial económico bruto para planificar la reorganización de la oferta.',
  formato: 'mapa' as const,
  nivelId: 'transversal',
  tipoId: 'georref',
  categoriaId: CATEGORIA_REORGANIZACION.id,
  area: 'Dirección de Planeamiento',
  actualizado: '2026-10-29',
  estado: 'publicado' as const,
  ruta: '/mapas/reorganizacion',
}

// Alta idempotente del recurso del catálogo, corre en cada arranque. Nunca
// toca recurso_audiencia_niveles ni recurso_audiencia_usuarios: la audiencia
// configurada por un admin no se pisa en un reinicio.
export async function upsertRecursoReorganizacion() {
  const db = getDb()

  await db
    .insert(categorias)
    .values(CATEGORIA_REORGANIZACION)
    .onConflictDoNothing()

  for (const tag of TAGS_REQUERIDOS) {
    await db.insert(tags).values(tag).onConflictDoNothing()
  }

  await db
    .insert(recursos)
    .values(RECURSO_REORGANIZACION)
    .onConflictDoUpdate({
      target: recursos.id,
      set: {
        titulo: RECURSO_REORGANIZACION.titulo,
        descripcion: RECURSO_REORGANIZACION.descripcion,
        formato: RECURSO_REORGANIZACION.formato,
        nivelId: RECURSO_REORGANIZACION.nivelId,
        tipoId: RECURSO_REORGANIZACION.tipoId,
        categoriaId: RECURSO_REORGANIZACION.categoriaId,
        area: RECURSO_REORGANIZACION.area,
        actualizado: RECURSO_REORGANIZACION.actualizado,
        estado: RECURSO_REORGANIZACION.estado,
        ruta: RECURSO_REORGANIZACION.ruta,
      },
    })

  for (const tag of TAGS_REQUERIDOS) {
    await db
      .insert(recursoTags)
      .values({ recursoId: RECURSO_REORGANIZACION_ID, tagId: tag.id })
      .onConflictDoNothing()
  }
}
