import { getDb } from '@/lib/db'
import { categorias, recursos, recursoTags, tags } from '@/lib/db/schema'

// ID estable: ya anticipado por el test de B5 en
// app/api/mapas/infraestructura/route.test.ts, que ejercita puedeAbrir()
// contra este mismo recurso.
export const RECURSO_INFRAESTRUCTURA_ID = 'recurso-infraestructura'

const CATEGORIA_INFRAESTRUCTURA = {
  id: 'infraestructura',
  nombre: 'Infraestructura',
  color: 'danger' as const,
}

const TAGS_REQUERIDOS = [
  { id: 'territorial', nombre: 'Territorial' },
  { id: 'alertas', nombre: 'Alertas' },
]

const RECURSO_INFRAESTRUCTURA = {
  id: RECURSO_INFRAESTRUCTURA_ID,
  titulo: 'Mapa de infraestructura',
  descripcion:
    'Alertas activas de infraestructura escolar georreferenciadas, con indicadores consolidados por territorio, nivel y establecimiento.',
  formato: 'mapa' as const,
  nivelId: 'transversal',
  tipoId: 'georref',
  categoriaId: CATEGORIA_INFRAESTRUCTURA.id,
  area: 'Dirección de Gestión Escolar',
  actualizado: '2026-09-16',
  estado: 'publicado' as const,
  ruta: '/mapas/infraestructura',
}

// Alta idempotente del recurso del catálogo, pensada para correr en cada
// arranque sobre una base ya poblada (no solo en el seed inicial). Nunca
// toca recurso_audiencia_niveles ni recurso_audiencia_usuarios: la audiencia
// que un admin configuró para este recurso no se pisa en un reinicio.
export async function upsertRecursoInfraestructura() {
  const db = getDb()

  await db
    .insert(categorias)
    .values(CATEGORIA_INFRAESTRUCTURA)
    .onConflictDoNothing()

  for (const tag of TAGS_REQUERIDOS) {
    await db.insert(tags).values(tag).onConflictDoNothing()
  }

  await db
    .insert(recursos)
    .values(RECURSO_INFRAESTRUCTURA)
    .onConflictDoUpdate({
      target: recursos.id,
      set: {
        titulo: RECURSO_INFRAESTRUCTURA.titulo,
        descripcion: RECURSO_INFRAESTRUCTURA.descripcion,
        formato: RECURSO_INFRAESTRUCTURA.formato,
        nivelId: RECURSO_INFRAESTRUCTURA.nivelId,
        tipoId: RECURSO_INFRAESTRUCTURA.tipoId,
        categoriaId: RECURSO_INFRAESTRUCTURA.categoriaId,
        area: RECURSO_INFRAESTRUCTURA.area,
        actualizado: RECURSO_INFRAESTRUCTURA.actualizado,
        estado: RECURSO_INFRAESTRUCTURA.estado,
        ruta: RECURSO_INFRAESTRUCTURA.ruta,
      },
    })

  for (const tag of TAGS_REQUERIDOS) {
    await db
      .insert(recursoTags)
      .values({ recursoId: RECURSO_INFRAESTRUCTURA_ID, tagId: tag.id })
      .onConflictDoNothing()
  }
}
