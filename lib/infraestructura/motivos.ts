import { and, asc, eq } from 'drizzle-orm'
import { getDb, getRawClient } from '@/lib/db'
import { infraMotivo } from '@/lib/db/schema'
import { esCategoria, type CategoriaAfectacion } from './categorias'
import { crearEjecutorSql } from './ge-db'
import { esSeveridad, type Severidad } from './validacion'

export interface MotivoRow {
  id: string
  nombre: string
  categoria: CategoriaAfectacion
  orden: number
  // Optional so fixtures need not set it; DB rows normalize absence to null.
  severidadSugerida?: Severidad | null
}

// Semilla inicial de motivos (reparto acordado en la spec de diseño).
//
// INVARIANTE: el nombre de un motivo es ÚNICO en toda la tabla, sin importar
// la categoría. No es cosmético: `infra_afectacion.motivo` guarda el NOMBRE
// (texto histórico, no FK) y resolverCategoria() deduce la categoría a partir
// de ese nombre. Dos motivos con el mismo nombre en categorías distintas
// harían esa deducción ambigua, y el síntoma sería un 400 al azar cuando un
// director elige el comodín de "alumnos" y marca alumnos individuales.
//
// Por eso los dos comodines se llaman distinto en vez de "Otro" a secas, y por
// eso ensureMotivoNombreUnico() impone la unicidad a nivel de base: así el ABM
// del admin tampoco puede recrear la ambigüedad más adelante.
export const MOTIVOS_SEED: MotivoRow[] = [
  {
    id: 'inundacion',
    nombre: 'Inundación',
    categoria: 'establecimiento',
    orden: 10,
    severidadSugerida: 'Crítica',
  },
  {
    id: 'tormenta-severa',
    nombre: 'Tormenta severa',
    categoria: 'establecimiento',
    orden: 20,
    severidadSugerida: 'Alta',
  },
  {
    id: 'sin-energia-o-agua',
    nombre: 'Sin energía o agua',
    categoria: 'establecimiento',
    orden: 30,
    severidadSugerida: 'Media',
  },
  {
    id: 'evacuacion-preventiva',
    nombre: 'Evacuación preventiva',
    categoria: 'establecimiento',
    orden: 40,
    severidadSugerida: 'Crítica',
  },
  {
    id: 'inaccesibilidad-docentes',
    nombre: 'Inaccesibilidad de docentes',
    categoria: 'establecimiento',
    orden: 50,
    severidadSugerida: 'Alta',
  },
  {
    id: 'otro-establecimiento',
    nombre: 'Otro problema en el establecimiento',
    categoria: 'establecimiento',
    orden: 90,
    severidadSugerida: null,
  },
  {
    id: 'anegamiento',
    nombre: 'Anegamiento',
    categoria: 'alumnos',
    orden: 10,
    severidadSugerida: 'Alta',
  },
  {
    id: 'acceso-interrumpido',
    nombre: 'Acceso interrumpido',
    categoria: 'alumnos',
    orden: 20,
    severidadSugerida: 'Alta',
  },
  { id: 'otro-alumnos', nombre: 'Otro problema de acceso', categoria: 'alumnos', orden: 90, severidadSugerida: null },
]

// Nombres que usaron los comodines antes de que la unicidad fuera un
// invariante. Una base sembrada con la versión anterior tiene dos filas
// llamadas "Otro" y el índice único no podría crearse sobre ella.
const RENOMBRES_COMODINES: { id: string; nombreViejo: string }[] = [
  { id: 'otro-establecimiento', nombreViejo: 'Otro' },
  { id: 'otro-alumnos', nombreViejo: 'Otro' },
]

// Alta idempotente de la semilla: onConflictDoNothing para que un admin
// pueda borrar un motivo semilla sin que reaparezca en el próximo arranque.
export async function sembrarMotivos(): Promise<void> {
  const db = getDb()
  for (const motivo of MOTIVOS_SEED) {
    await db.insert(infraMotivo).values(motivo).onConflictDoNothing()
  }
}

// Impone el invariante de nombre único a nivel de base. Va acá y no en las
// migraciones de drizzle-kit a propósito: el índice no puede crearse mientras
// existan las filas duplicadas de una base vieja, así que primero hay que
// renombrar los comodines y recién después crear el índice. El DDL de arranque
// corre sobre bases ya pobladas y no debe depender del orden en que esas bases
// aplicaron renombres previos.
export async function ensureMotivoNombreUnico(): Promise<void> {
  const db = getDb()
  for (const { id, nombreViejo } of RENOMBRES_COMODINES) {
    const semilla = MOTIVOS_SEED.find((m) => m.id === id)
    if (!semilla) continue
    await db
      .update(infraMotivo)
      .set({ nombre: semilla.nombre })
      .where(and(eq(infraMotivo.id, id), eq(infraMotivo.nombre, nombreViejo)))
  }
  await crearEjecutorSql(getRawClient()).execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS infra_motivo_nombre_unico ON infra_motivo (nombre)',
  )
}

export async function listarMotivos(): Promise<MotivoRow[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(infraMotivo)
    .orderBy(asc(infraMotivo.categoria), asc(infraMotivo.orden), asc(infraMotivo.nombre))
  return rows
    .filter((r): r is typeof r & { categoria: CategoriaAfectacion } => esCategoria(r.categoria))
    .map((r): MotivoRow => ({
      ...r,
      severidadSugerida: esSeveridad(r.severidadSugerida) ? r.severidadSugerida : null,
    }))
}
