// Persistencia y lectura de la serie diaria INA A5 (hidro_serie_diaria) y de
// sus lotes crudos (hidro_lote_crudo). Reejecutar un lote no crea filas ni
// cambia valores o fechas: la primera observación de cada fecha se conserva y
// un valor distinto se devuelve como discrepancia.
import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { hidroLoteCrudo, hidroSerieDiaria } from '@/lib/db/schema'
import type { FilaSerieDiaria } from './parser-a5'

type Db = ReturnType<typeof getDb>

export const FUENTE_INA_A5 = 'ina-a5'
const TAMANO_LOTE = 500

export type LoteSerieDiaria = {
  estacionId: string
  serieId: number
  url: string
  payload: unknown
  sha256: string
  descargadoEn: string
  filas: readonly FilaSerieDiaria[]
}

export type DiscrepanciaSerieDiaria = { fecha: string; guardadoM: number; nuevoM: number }

export type ResultadoGuardarSerieDiaria = {
  insertadas: number
  existentesIguales: number
  discrepancias: DiscrepanciaSerieDiaria[]
}

export async function guardarLoteSerieDiaria(db: Db, lote: LoteSerieDiaria): Promise<ResultadoGuardarSerieDiaria> {
  return db.transaction(async (tx) => {
    await tx
      .insert(hidroLoteCrudo)
      .values({
        sha256: lote.sha256,
        fuente: FUENTE_INA_A5,
        url: lote.url,
        serieId: lote.serieId,
        payload: lote.payload,
        descargadoEn: lote.descargadoEn,
      })
      .onConflictDoNothing()

    const resultado: ResultadoGuardarSerieDiaria = { insertadas: 0, existentesIguales: 0, discrepancias: [] }
    for (let i = 0; i < lote.filas.length; i += TAMANO_LOTE) {
      const tramo = lote.filas.slice(i, i + TAMANO_LOTE)
      const existentes = await tx
        .select({ fecha: hidroSerieDiaria.fecha, valorM: hidroSerieDiaria.valorM })
        .from(hidroSerieDiaria)
        .where(and(
          eq(hidroSerieDiaria.estacionId, lote.estacionId),
          eq(hidroSerieDiaria.fuente, FUENTE_INA_A5),
          inArray(hidroSerieDiaria.fecha, tramo.map((f) => f.fecha)),
        ))
      const guardado = new Map(existentes.map((f) => [f.fecha, f.valorM]))
      const nuevas = []
      for (const fila of tramo) {
        const previo = guardado.get(fila.fecha)
        if (previo === undefined) nuevas.push(fila)
        else if (previo === fila.valorM) resultado.existentesIguales++
        else resultado.discrepancias.push({ fecha: fila.fecha, guardadoM: previo, nuevoM: fila.valorM })
      }
      if (nuevas.length === 0) continue
      const insertadas = await tx
        .insert(hidroSerieDiaria)
        .values(nuevas.map((f) => ({
          estacionId: lote.estacionId,
          fecha: f.fecha,
          fuente: FUENTE_INA_A5,
          valorM: f.valorM,
          serieId: lote.serieId,
          loteSha256: lote.sha256,
          descargadoEn: lote.descargadoEn,
        })))
        .onConflictDoNothing()
        .returning({ fecha: hidroSerieDiaria.fecha })
      resultado.insertadas += insertadas.length
    }
    return resultado
  })
}

export async function ultimaFechaSerieDiaria(db: Db, estacionId: string): Promise<string | null> {
  const [fila] = await db
    .select({ fecha: hidroSerieDiaria.fecha })
    .from(hidroSerieDiaria)
    .where(and(eq(hidroSerieDiaria.estacionId, estacionId), eq(hidroSerieDiaria.fuente, FUENTE_INA_A5)))
    .orderBy(desc(hidroSerieDiaria.fecha))
    .limit(1)
  return fila?.fecha ?? null
}

export type FilaSerieDiariaGuardada = { fecha: string; valorM: number; serieId: number; descargadoEn: string }

/**
 * Serie diaria de una estación hasta `asOf` inclusive (fecha local
 * `YYYY-MM-DD`). Ninguna fecha posterior se devuelve.
 */
export function leerSerieDiaria(db: Db, estacionId: string, asOf: string): Promise<FilaSerieDiariaGuardada[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('asOf debe ser YYYY-MM-DD')
  return db
    .select({
      fecha: hidroSerieDiaria.fecha,
      valorM: hidroSerieDiaria.valorM,
      serieId: hidroSerieDiaria.serieId,
      descargadoEn: hidroSerieDiaria.descargadoEn,
    })
    .from(hidroSerieDiaria)
    .where(and(
      eq(hidroSerieDiaria.estacionId, estacionId),
      eq(hidroSerieDiaria.fuente, FUENTE_INA_A5),
      lte(hidroSerieDiaria.fecha, asOf),
    ))
    .orderBy(asc(hidroSerieDiaria.fecha))
}
