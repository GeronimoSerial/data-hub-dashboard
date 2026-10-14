// Lectura de la salud de las fuentes que usa el veredicto. Una fuente está
// disponible si su registro de salud es reciente (no_disponible no cuenta, y el
// último éxito debe estar dentro de la tolerancia propia de la fuente) o si sus
// datos son recientes. Los datos mandan cuando el registro falta o se atrasa: el
// job de salud puede no estar corriendo aunque la ingesta sí. Degradado con un
// éxito reciente sigue contando como disponible.
import { and, desc, eq, inArray } from 'drizzle-orm'
import {
  hazardEnsembleProb,
  hazardForecast,
  hazardObservation,
  hazardSourceHealth,
  hidroLectura,
} from '@/lib/db/schema'
import { PROVIDER_OBSERVADO, VARIABLE_OBSERVADA } from '@/lib/infraestructura/riesgo/peligro/observado'
import { PROVEEDOR_LLUVIA_ECMWF } from './pronostico'
import type { Db } from './repositorio'
import type { FuenteVeredicto } from './reglas'

/** Proveedor con el que cada fuente del veredicto reporta su salud. */
export const PROVEEDOR_SALUD_FUENTE: Record<FuenteVeredicto, string> = {
  imerg: 'nasa-imerg',
  prefectura: 'prefectura-alturas',
  smn: 'smn-alertas',
  glofas: 'open-meteo-flood',
  ensamble: 'open-meteo-ensemble',
  ecmwf: PROVEEDOR_LLUVIA_ECMWF,
}

/**
 * Tolerancia en horas por fuente, medida desde el último éxito o último dato.
 * IMERG tiene ~4 h de latencia por diseño, por eso su ventana es amplia. SMN se
 * mide solo por salud: su `fetched_at` cambia cuando cambian las alertas, no cuando
 * hay un dato nuevo, así que usarlo como dato daría falsos vencimientos o frescos.
 */
export const TOLERANCIA_SALUD_HORAS: Record<FuenteVeredicto, number> = {
  imerg: 12,
  prefectura: 36,
  smn: 6,
  glofas: 48,
  ensamble: 48,
  ecmwf: 48,
}

export type MotivoSaludFuente = 'ok' | 'vencida' | 'no_disponible' | 'sin_registro'

export type SaludFuenteVeredicto = {
  disponible: boolean
  motivo: MotivoSaludFuente
  ultimoExitoEn: string | null
  ultimoDato: string | null
}

export type SaludFuentes = Record<FuenteVeredicto, SaludFuenteVeredicto>

type FilaSalud = {
  estado: string
  ultimoExitoEn: string | null
}

const HORA_MS = 3_600_000

function dentroDeTolerancia(instante: string, fuente: FuenteVeredicto, ahora: Date): boolean {
  const ms = Date.parse(instante)
  if (Number.isNaN(ms)) return false
  return ahora.getTime() - ms <= TOLERANCIA_SALUD_HORAS[fuente] * HORA_MS
}

/** Evalúa solo el registro de salud. */
export function evaluarSaludFuente(
  fuente: FuenteVeredicto,
  fila: FilaSalud | undefined,
  ahora: Date,
): Omit<SaludFuenteVeredicto, 'ultimoDato'> {
  if (fila === undefined) return { disponible: false, motivo: 'sin_registro', ultimoExitoEn: null }
  if (fila.estado === 'no_disponible' || fila.ultimoExitoEn === null) {
    return { disponible: false, motivo: 'no_disponible', ultimoExitoEn: fila.ultimoExitoEn }
  }
  if (Number.isNaN(Date.parse(fila.ultimoExitoEn))) {
    return { disponible: false, motivo: 'no_disponible', ultimoExitoEn: fila.ultimoExitoEn }
  }
  if (!dentroDeTolerancia(fila.ultimoExitoEn, fuente, ahora)) {
    return { disponible: false, motivo: 'vencida', ultimoExitoEn: fila.ultimoExitoEn }
  }
  return { disponible: true, motivo: 'ok', ultimoExitoEn: fila.ultimoExitoEn }
}

/** Combina salud y dato: basta que uno de los dos sea reciente. */
export function combinarSaludFuente(
  fuente: FuenteVeredicto,
  salud: Omit<SaludFuenteVeredicto, 'ultimoDato'>,
  ultimoDato: string | null,
  ahora: Date,
): SaludFuenteVeredicto {
  const datoFresco = ultimoDato !== null && dentroDeTolerancia(ultimoDato, fuente, ahora)
  if (salud.disponible || datoFresco) {
    return { disponible: true, motivo: 'ok', ultimoExitoEn: salud.ultimoExitoEn, ultimoDato }
  }
  return { ...salud, ultimoDato }
}

/** Último instante de dato de cada fuente; SMN no tiene dato propio y devuelve null. */
async function leerUltimoDato(db: Db, fuente: FuenteVeredicto): Promise<string | null> {
  switch (fuente) {
    case 'imerg': {
      const [fila] = await db
        .select({ validoHasta: hazardObservation.validoHasta })
        .from(hazardObservation)
        .where(
          and(
            eq(hazardObservation.provider, PROVIDER_OBSERVADO),
            eq(hazardObservation.variable, VARIABLE_OBSERVADA),
          ),
        )
        .orderBy(desc(hazardObservation.validoHasta))
        .limit(1)
      return fila?.validoHasta ?? null
    }
    case 'prefectura': {
      const [fila] = await db
        .select({ medidaEn: hidroLectura.medidaEn })
        .from(hidroLectura)
        .orderBy(desc(hidroLectura.medidaEn))
        .limit(1)
      return fila?.medidaEn ?? null
    }
    case 'glofas': {
      const [fila] = await db
        .select({ corridaEn: hazardForecast.corridaEn })
        .from(hazardForecast)
        .where(
          and(
            eq(hazardForecast.provider, PROVEEDOR_SALUD_FUENTE.glofas),
            eq(hazardForecast.variable, 'caudal'),
          ),
        )
        .orderBy(desc(hazardForecast.corridaEn))
        .limit(1)
      return fila?.corridaEn ?? null
    }
    case 'ensamble': {
      const [fila] = await db
        .select({ corridaEn: hazardEnsembleProb.corridaEn })
        .from(hazardEnsembleProb)
        .orderBy(desc(hazardEnsembleProb.corridaEn))
        .limit(1)
      return fila?.corridaEn ?? null
    }
    case 'ecmwf': {
      const [fila] = await db
        .select({ corridaEn: hazardForecast.corridaEn })
        .from(hazardForecast)
        .where(
          and(
            eq(hazardForecast.provider, PROVEEDOR_LLUVIA_ECMWF),
            eq(hazardForecast.variable, 'precipitacion'),
          ),
        )
        .orderBy(desc(hazardForecast.corridaEn))
        .limit(1)
      return fila?.corridaEn ?? null
    }
    case 'smn':
      return null
  }
}

export async function leerSaludFuentes(db: Db, ahora: Date): Promise<SaludFuentes> {
  const proveedores = Object.values(PROVEEDOR_SALUD_FUENTE)
  const filas = await db
    .select()
    .from(hazardSourceHealth)
    .where(inArray(hazardSourceHealth.provider, proveedores))
  const porProveedor = new Map(filas.map((fila) => [fila.provider, fila]))

  const resultado = {} as SaludFuentes
  for (const fuente of Object.keys(PROVEEDOR_SALUD_FUENTE) as FuenteVeredicto[]) {
    const salud = evaluarSaludFuente(fuente, porProveedor.get(PROVEEDOR_SALUD_FUENTE[fuente]), ahora)
    const ultimoDato = await leerUltimoDato(db, fuente)
    resultado[fuente] = combinarSaludFuente(fuente, salud, ultimoDato, ahora)
  }
  return resultado
}
