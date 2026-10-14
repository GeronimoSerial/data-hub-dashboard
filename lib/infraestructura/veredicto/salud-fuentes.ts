// Lectura de la salud de las fuentes que usa el veredicto. Una fuente no está
// disponible si no tiene registro, su estado es no_disponible, nunca tuvo un éxito
// o su último éxito es más viejo que ttl × TOLERANCIA_ATRASO_JOB. Degradado con un
// éxito reciente sigue contando como disponible.
import { inArray } from 'drizzle-orm'
import { hazardSourceHealth } from '@/lib/db/schema'
import { TOLERANCIA_ATRASO_JOB } from '@/lib/infraestructura/riesgo/jobs-esperados'
import type { Db } from './repositorio'
import type { FuenteVeredicto } from './reglas'

/** Proveedor con el que cada fuente del veredicto reporta su salud. */
export const PROVEEDOR_SALUD_FUENTE: Record<FuenteVeredicto, string> = {
  imerg: 'nasa-imerg',
  prefectura: 'prefectura-alturas',
  smn: 'smn-alertas',
  glofas: 'open-meteo-flood',
  ensamble: 'open-meteo-ensemble',
}

export type MotivoSaludFuente = 'ok' | 'vencida' | 'no_disponible' | 'sin_registro'

export type SaludFuenteVeredicto = {
  disponible: boolean
  motivo: MotivoSaludFuente
  ultimoExitoEn: string | null
}

export type SaludFuentes = Record<FuenteVeredicto, SaludFuenteVeredicto>

type FilaSalud = {
  estado: string
  ultimoExitoEn: string | null
  ttlMinutos: number
}

export function evaluarSaludFuente(fila: FilaSalud | undefined, ahora: Date): SaludFuenteVeredicto {
  if (fila === undefined) return { disponible: false, motivo: 'sin_registro', ultimoExitoEn: null }
  if (fila.estado === 'no_disponible' || fila.ultimoExitoEn === null) {
    return { disponible: false, motivo: 'no_disponible', ultimoExitoEn: fila.ultimoExitoEn }
  }
  const exitoMs = Date.parse(fila.ultimoExitoEn)
  if (Number.isNaN(exitoMs)) {
    return { disponible: false, motivo: 'no_disponible', ultimoExitoEn: fila.ultimoExitoEn }
  }
  const limiteMs = fila.ttlMinutos * 60_000 * TOLERANCIA_ATRASO_JOB
  if (ahora.getTime() - exitoMs > limiteMs) {
    return { disponible: false, motivo: 'vencida', ultimoExitoEn: fila.ultimoExitoEn }
  }
  return { disponible: true, motivo: 'ok', ultimoExitoEn: fila.ultimoExitoEn }
}

export async function leerSaludFuentes(db: Db, ahora: Date): Promise<SaludFuentes> {
  const proveedores = Object.values(PROVEEDOR_SALUD_FUENTE)
  const filas = await db
    .select()
    .from(hazardSourceHealth)
    .where(inArray(hazardSourceHealth.provider, proveedores))
  const porProveedor = new Map(filas.map((fila) => [fila.provider, fila]))

  const resultado = {} as SaludFuentes
  for (const [fuente, proveedor] of Object.entries(PROVEEDOR_SALUD_FUENTE) as [
    FuenteVeredicto,
    string,
  ][]) {
    resultado[fuente] = evaluarSaludFuente(porProveedor.get(proveedor), ahora)
  }
  return resultado
}
