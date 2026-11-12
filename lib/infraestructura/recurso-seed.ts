import { getDb } from '@/lib/db'
import { categorias, recursos, recursoTags, tags } from '@/lib/db/schema'
import { RECURSO_ENOS_MANAOS_ID, RUTA_MAPA_INFRAESTRUCTURA } from '@/lib/infraestructura/rutas-hub'
import { esRutaExterna } from '@/lib/ruta-externa'

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
  titulo: 'ENOS Corrientes',
  descripcion:
    'Alertas activas de infraestructura escolar georreferenciadas, con indicadores consolidados por territorio, nivel y establecimiento.',
  formato: 'mapa' as const,
  nivelId: 'transversal',
  tipoId: 'georref',
  categoriaId: CATEGORIA_INFRAESTRUCTURA.id,
  area: 'Dirección de Gestión Escolar',
  actualizado: '2026-09-16',
  estado: 'publicado' as const,
  ruta: RUTA_MAPA_INFRAESTRUCTURA,
}

// Alta idempotente del recurso del catálogo, pensada para correr en cada
// arranque sobre una base ya poblada (no solo en el seed inicial). Nunca
// toca recurso_audiencia_niveles_jur ni recurso_audiencia_usuarios: la audiencia
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

// Card externa al despliegue de Manaos (D5). Sólo se da de alta si
// ENOS_MANAOS_URL es una URL https: sin ella es no-op, así Corrientes y e2e no cambian.
// Sin audiencia propia: lib/acl.ts la abre a cualquier sesión, igual que la de Corrientes.
export async function upsertRecursoManaos() {
  const url = process.env.ENOS_MANAOS_URL?.trim() ?? ''
  if (!url.startsWith('https://') || !esRutaExterna(url)) return

  const db = getDb()

  await db
    .insert(categorias)
    .values(CATEGORIA_INFRAESTRUCTURA)
    .onConflictDoNothing()

  const card = {
    id: RECURSO_ENOS_MANAOS_ID,
    titulo: 'ENOS Manaos',
    descripcion: 'Mapa de infraestructura escolar del despliegue de Manaos (Amazonas, Brasil).',
    formato: 'mapa' as const,
    nivelId: 'transversal',
    tipoId: 'georref',
    categoriaId: CATEGORIA_INFRAESTRUCTURA.id,
    area: 'Dirección de Gestión Escolar',
    actualizado: RECURSO_INFRAESTRUCTURA.actualizado,
    estado: 'publicado' as const,
    ruta: url,
  }

  await db
    .insert(recursos)
    .values(card)
    .onConflictDoUpdate({
      target: recursos.id,
      set: {
        titulo: card.titulo,
        descripcion: card.descripcion,
        formato: card.formato,
        nivelId: card.nivelId,
        tipoId: card.tipoId,
        categoriaId: card.categoriaId,
        area: card.area,
        actualizado: card.actualizado,
        estado: card.estado,
        ruta: card.ruta,
      },
    })
}
