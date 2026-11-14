import { randomUUID } from 'node:crypto'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hazardObservation, infraDatasetPublicacion } from '@/lib/db/schema'
import { PROVIDER_OBSERVADO, VARIABLE_OBSERVADA } from '@/lib/infraestructura/riesgo/peligro/observado'
import type { Restaurar } from './escenarios-falla'

// Escenarios de series del Centro de Situación (I5: huecos IMERG del día; I11: vigencia de datasets).
// Cada escenario deja la base con los valores exactos previos, igual que escenarios-falla.ts.

const MINUTO_MS = 60_000
const HORA_MS = 60 * MINUTO_MS
const DIA_MS = 24 * HORA_MS
const PASO_IMERG_MS = 30 * MINUTO_MS
// Buenos Aires no tiene horario de verano: UTC-3 fijo. El día se arma acá, independiente de la app,
// para que el escenario no dependa de la función que está probando.
const DESFASE_BUENOS_AIRES_MS = 3 * HORA_MS

/** Medianoche de Buenos Aires del día de `ahora`, en milisegundos UTC. */
function inicioDiaBuenosAires(ahora: Date): number {
  const local = new Date(ahora.getTime() - DESFASE_BUENOS_AIRES_MS)
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + DESFASE_BUENOS_AIRES_MS
}

/** Horas del día IMERG de Buenos Aires ya transcurridas. El escenario con hueco necesita 4 h para caber. */
export function horasTranscurridasDelDiaImerg(ahora: Date): number {
  return (ahora.getTime() - inicioDiaBuenosAires(ahora)) / HORA_MS
}

/**
 * Gránulos de hoy (Buenos Aires) cada 30 min hasta `ahora`. Con `conHueco`, no hay gránulos entre
 * 01:00 y 04:00 BA: 3 h de hueco, y el tramo posterior empieza a las 04:00 para que el hueco sea el único.
 */
function granulosDeHoy(ahora: Date, conHueco: boolean): string[] {
  const inicio = inicioDiaBuenosAires(ahora)
  const limite = ahora.getTime()
  const instantes: number[] = []
  const tramo = (desde: number, hasta: number) => {
    for (let t = desde; t <= hasta && t <= limite; t += PASO_IMERG_MS) instantes.push(t)
  }
  if (conHueco) {
    tramo(inicio, inicio + HORA_MS)
    tramo(inicio + 4 * HORA_MS, Number.POSITIVE_INFINITY)
  } else {
    tramo(inicio, Number.POSITIVE_INFINITY)
  }
  return instantes.map((t) => new Date(t).toISOString())
}

/**
 * Reemplaza los gránulos IMERG de hoy por una serie controlada. Los gránulos previos del día (los del seed)
 * se guardan y vuelven en la restauración, así la serie de prueba no se mezcla con ellos.
 */
export async function prepararSerieImergDeHoy(conHueco: boolean): Promise<Restaurar> {
  const db = getDb()
  const ahora = new Date()
  const delDia = and(
    eq(hazardObservation.provider, PROVIDER_OBSERVADO),
    eq(hazardObservation.variable, VARIABLE_OBSERVADA),
    gte(hazardObservation.observadoEn, new Date(inicioDiaBuenosAires(ahora)).toISOString()),
  )
  const previas = await db.select().from(hazardObservation).where(delDia)
  await db.delete(hazardObservation).where(delDia)

  const nuevas = granulosDeHoy(ahora, conHueco).map((observadoEn) => ({
    id: randomUUID(),
    provider: PROVIDER_OBSERVADO,
    variable: VARIABLE_OBSERVADA,
    geometryRef: 'e2e-imerg-serie-hoy',
    valor: 0.5,
    unidad: 'mm',
    observadoEn,
    validoDesde: new Date(Date.parse(observadoEn) - 30 * MINUTO_MS).toISOString(),
    validoHasta: observadoEn,
    calidad: 1,
    rawRef: null,
    ingeridoEn: ahora.toISOString(),
  }))
  await db.insert(hazardObservation).values(nuevas)
  const idsNuevas = nuevas.map((fila) => fila.id)

  return async () => {
    await db.delete(hazardObservation).where(inArray(hazardObservation.id, idsNuevas))
    if (previas.length > 0) await db.insert(hazardObservation).values(previas)
  }
}

/**
 * Deja la publicación vigente de un dataset con fecha de hace `dias` días. El clasificador de vigencia lee
 * `infra_dataset_publicacion.publicada_en`; la versión queda intacta (es inmutable por trigger) y solo se
 * cambia la fecha de la publicación, que no tiene ese trigger. Restaura la fecha original.
 */
export async function prepararPublicacionAntigua(datasetId: string, dias: number): Promise<Restaurar> {
  const db = getDb()
  const [vigente] = await db
    .select({ publicadaEn: infraDatasetPublicacion.publicadaEn })
    .from(infraDatasetPublicacion)
    .where(eq(infraDatasetPublicacion.datasetId, datasetId))
  if (!vigente) throw new Error(`prepararPublicacionAntigua: ${datasetId} no tiene publicación vigente en la base e2e`)

  const condicion = eq(infraDatasetPublicacion.datasetId, datasetId)
  await db.update(infraDatasetPublicacion).set({ publicadaEn: new Date(Date.now() - dias * DIA_MS) }).where(condicion)
  return async () => {
    await db.update(infraDatasetPublicacion).set({ publicadaEn: vigente.publicadaEn }).where(condicion)
  }
}
