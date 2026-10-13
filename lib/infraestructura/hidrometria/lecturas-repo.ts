import { createHash, randomUUID } from 'node:crypto'
import type { getDb } from '@/lib/db'
import { hidroLectura } from '@/lib/db/schema'
import type { FilaAlturaPrefectura } from './prefectura-parser'

// A parsed row already resolved to a catalogue station (`estacionId`).
export type LecturaResuelta = Pick<
  FilaAlturaPrefectura,
  | 'lecturaM'
  | 'variacionM'
  | 'periodoHoras'
  | 'medidaEn'
  | 'estadoPublicado'
  | 'lecturaAnteriorM'
  | 'medidaAnteriorEn'
  | 'alertaM'
  | 'evacuacionM'
  | 'inconsistente'
  | 'motivosInconsistencia'
> & { estacionId: string }

export type OpcionesGuardarLecturas = {
  capturadaEn: string
  catalogoVersion: string
}

export type ResultadoGuardarLecturas = {
  insertadas: number
  duplicadas: number
  sinFecha: number
}

type Db = ReturnType<typeof getDb>

// Keeps each INSERT well below the Postgres bind-parameter limit.
const TAMANO_LOTE = 500

function tieneFecha(
  lectura: LecturaResuelta,
): lectura is LecturaResuelta & { medidaEn: string } {
  return lectura.medidaEn !== null
}

// sha256 over the normalized source row, in a fixed field order so the same input
// always yields the same hash.
export function hashLecturaOriginal(lectura: LecturaResuelta): string {
  const canonica = JSON.stringify([
    lectura.estacionId,
    lectura.medidaEn,
    lectura.lecturaM,
    lectura.variacionM,
    lectura.periodoHoras,
    lectura.estadoPublicado,
    lectura.lecturaAnteriorM,
    lectura.medidaAnteriorEn,
    lectura.alertaM,
    lectura.evacuacionM,
  ])
  return createHash('sha256').update(canonica).digest('hex')
}

/**
 * Stores readings idempotently. A reading already stored for the same
 * (estacion, medida) is skipped and never overwritten. Rows without `medidaEn`
 * cannot be keyed and are counted as `sinFecha`.
 */
export async function guardarLecturasPrefectura(
  db: Db,
  lecturas: readonly LecturaResuelta[],
  { capturadaEn, catalogoVersion }: OpcionesGuardarLecturas,
): Promise<ResultadoGuardarLecturas> {
  const conFecha = lecturas.filter(tieneFecha)
  const sinFecha = lecturas.length - conFecha.length
  let insertadas = 0

  for (let inicio = 0; inicio < conFecha.length; inicio += TAMANO_LOTE) {
    const lote = conFecha.slice(inicio, inicio + TAMANO_LOTE).map((lectura) => ({
      id: randomUUID(),
      estacionId: lectura.estacionId,
      lecturaM: lectura.lecturaM,
      variacionM: lectura.variacionM,
      periodoHoras: lectura.periodoHoras,
      medidaEn: lectura.medidaEn,
      estadoPublicado: lectura.estadoPublicado,
      lecturaAnteriorM: lectura.lecturaAnteriorM,
      medidaAnteriorEn: lectura.medidaAnteriorEn,
      alertaM: lectura.alertaM,
      evacuacionM: lectura.evacuacionM,
      inconsistente: lectura.inconsistente,
      motivosInconsistencia: lectura.motivosInconsistencia,
      hashOriginal: hashLecturaOriginal(lectura),
      catalogoVersion,
      capturadaEn,
    }))

    const creadas = await db
      .insert(hidroLectura)
      .values(lote)
      .onConflictDoNothing({
        target: [hidroLectura.estacionId, hidroLectura.medidaEn],
      })
      .returning({ id: hidroLectura.id })
    insertadas += creadas.length
  }

  return { insertadas, duplicadas: conFecha.length - insertadas, sinFecha }
}
