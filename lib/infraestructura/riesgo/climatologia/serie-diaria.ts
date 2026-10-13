// Almacenamiento de la serie diaria de precipitación ERA5 para la
// climatología progresiva (`hazard_precipitacion_serie`). La unidad de
// descarga y de persistencia es (celda ERA5, año calendario): cada request
// exitosa se guarda al instante, y re-bajar el mismo año hace upsert sobre la
// misma fila. Los percentiles se recalculan después desde todo lo acumulado
// (ver climatologia/progresiva.ts).
import { eq, sql } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { hazardPrecipitacionSerie } from '@/lib/db/schema'

type Db = ReturnType<typeof getDb>

const MS_POR_DIA = 86_400_000

export function diasDelAnio(anio: number): number {
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0
  return bisiesto ? 366 : 365
}

/**
 * Arma el array del año indexado por día (0 = 1 de enero). Los días que no
 * vinieron en la respuesta, o vinieron null, quedan null: nunca se imputan 0 mm.
 */
export function armarValoresAnio(
  anio: number,
  fechas: readonly string[],
  valores: readonly (number | null)[],
): Array<number | null> {
  const resultado: Array<number | null> = new Array(diasDelAnio(anio)).fill(null)
  const inicio = Date.UTC(anio, 0, 1)
  fechas.forEach((fecha, indice) => {
    const dia = Math.round((Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`) - inicio) / MS_POR_DIA)
    if (dia < 0 || dia >= resultado.length) return
    resultado[dia] = valores[indice] ?? null
  })
  return resultado
}

export type AnioSerie = {
  celdaEra5: string
  anio: number
  lat: number
  lon: number
  valores: Array<number | null>
  descargadoEn: string
}

export async function guardarAnioSerie(db: Db, fila: AnioSerie): Promise<void> {
  const diasConDato = fila.valores.filter((valor) => valor !== null).length
  await conReintentoPorBloqueo(() =>
    db
      .insert(hazardPrecipitacionSerie)
      .values({ ...fila, diasConDato })
      .onConflictDoUpdate({
        target: [hazardPrecipitacionSerie.celdaEra5, hazardPrecipitacionSerie.anio],
        set: {
          lat: sql`excluded.lat`,
          lon: sql`excluded.lon`,
          valores: sql`excluded.valores`,
          diasConDato: sql`excluded.dias_con_dato`,
          descargadoEn: sql`excluded.descargado_en`,
        },
      }),
  )
}

/** Años ya guardados por celda ERA5 (sin leer los valores). */
export async function aniosDescargadosPorCelda(db: Db): Promise<Map<string, Set<number>>> {
  const filas = await db
    .select({ celdaEra5: hazardPrecipitacionSerie.celdaEra5, anio: hazardPrecipitacionSerie.anio })
    .from(hazardPrecipitacionSerie)
  const porCelda = new Map<string, Set<number>>()
  for (const fila of filas) {
    const anios = porCelda.get(fila.celdaEra5) ?? new Set<number>()
    anios.add(fila.anio)
    porCelda.set(fila.celdaEra5, anios)
  }
  return porCelda
}

/** Años guardados de una celda con sus valores y días con dato. */
export async function cargarSerieCelda(
  db: Db,
  celdaEra5: string,
): Promise<Array<{ anio: number; valores: Array<number | null>; diasConDato: number }>> {
  return db
    .select({
      anio: hazardPrecipitacionSerie.anio,
      valores: hazardPrecipitacionSerie.valores,
      diasConDato: hazardPrecipitacionSerie.diasConDato,
    })
    .from(hazardPrecipitacionSerie)
    .where(eq(hazardPrecipitacionSerie.celdaEra5, celdaEra5))
}
