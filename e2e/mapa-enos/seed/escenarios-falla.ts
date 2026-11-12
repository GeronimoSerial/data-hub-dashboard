import { randomUUID } from 'node:crypto'
import { eq, inArray, isNotNull, notInArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  hazardPrecipitacionSerie,
  hazardSourceHealth,
  infraGeoProfile,
  infraJobRun,
  infraRiskRun,
  infraSituacionCorte,
} from '@/lib/db/schema'
import { ANIOS_MINIMOS_CLIMATOLOGIA } from '@/lib/infraestructura/riesgo/climatologia/umbrales'
import { JOBS_ESPERADOS } from '@/lib/infraestructura/riesgo/jobs-esperados'
import { actualizarSaludFuente } from '@/lib/infraestructura/riesgo/jobs/salud-fuente'
import { agruparPuntosPorEra5, type PuntoClimatologia } from '@/lib/infraestructura/riesgo/providers/climatologia'
import { generarCorte } from '@/lib/infraestructura/riesgo/situacion/corte'

// Escenarios de falla del Centro de Situación (plan 9.4). Cada escenario se aplica dentro de la
// prueba y devuelve su restauración, que deja la base con los valores exactos previos.
// Usa las funciones y el esquema de la app: el corte lo arma generarCorte, la misma función del job,
// y las fuentes con sin filas se escriben con actualizarSaludFuente, la función real de los jobs.

export type Restaurar = () => Promise<void>
type Db = ReturnType<typeof getDb>

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Corte nuevo sobre la corrida vigente, sin tocar la corrida. El seed no genera cortes, así que sin
 * esto el encabezado dice "Todavía no se generó ningún corte" y el control sano no prueba nada.
 */
export async function prepararCorteFresco(): Promise<Restaurar> {
  const db = getDb()
  const previos = (await db.select({ id: infraSituacionCorte.id }).from(infraSituacionCorte)).map((fila) => fila.id)
  await generarCorte({ ahora: new Date(), jobRunId: null })
  return async () => {
    // Borra solo los cortes creados por el escenario; los previos quedan intactos.
    await db.delete(infraSituacionCorte).where(notInArray(infraSituacionCorte.id, previos))
  }
}

/**
 * La corrida de riesgo vigente se publicó hace `dias` días y el corte se genera encima de ella, así
 * el corte es nuevo y el dato que muestra es viejo (I1). Restaura la fecha de publicación original.
 */
export async function prepararRunDesactualizada(dias: number): Promise<Restaurar> {
  const db = getDb()
  const [vigente] = await db
    .select({ id: infraRiskRun.id, publicadoEn: infraRiskRun.publicadoEn })
    .from(infraRiskRun)
    .where(eq(infraRiskRun.estado, 'vigente'))
    .limit(1)
  if (!vigente) throw new Error('prepararRunDesactualizada: no hay corrida de riesgo vigente en la base e2e')

  await db
    .update(infraRiskRun)
    .set({ publicadoEn: new Date(Date.now() - dias * DIA_MS).toISOString() })
    .where(eq(infraRiskRun.id, vigente.id))
  const restaurarCorte = await prepararCorteFresco()

  return async () => {
    await restaurarCorte()
    await db.update(infraRiskRun).set({ publicadoEn: vigente.publicadoEn }).where(eq(infraRiskRun.id, vigente.id))
  }
}

export type AjustesSano = {
  // Filas recibidas por tipo de job, combinadas sobre el valor sano (p. ej. `{ filas: 0 }` en un job bajo su mínimo).
  contadores?: Record<string, Record<string, number>>
  // Fuentes que la app escribe con 0 filas recibidas: actualizarSaludFuente las guarda degradado.
  fuentesSinFilas?: string[]
}

// Fuentes que el seed sano deja `ok`; los providers son los que escribe la app (jobs/*.ts).
const FUENTES_SANAS = [
  { provider: 'nasa-imerg', ttlMinutos: 180 },
  { provider: 'open-meteo-ensemble', ttlMinutos: 360 },
  { provider: 'open-meteo-flood', ttlMinutos: 360 },
  { provider: 'open-meteo-seasonal', ttlMinutos: 2160 },
  { provider: 'exposicion-rio-dem', ttlMinutos: 2880 },
]

// Contadores sanos de los jobs con trampa (plan 9.4: "todo sano" incluye los casos que no son fallas).
const CONTADORES_TRAMPA: Record<string, Record<string, number>> = {
  // IMERG completo y en sincronía: 0 celdas actualizadas no es un problema (no declara mínimo).
  'sync-hazard-imerg': {
    celdasActualizadas: 0,
    granulosProcesados: 0,
    granulosFallidos: 0,
    granulosNoPublicados: 0,
    granulosConError: 0,
  },
  // Prefectura recibió 3 lecturas, todas duplicadas: 0 insertadas no es un problema; cuenta lo recibido.
  'sync-prefectura-alturas': {
    filasPublicadas: 3,
    estacionesCatalogo: 3,
    desconocidas: 0,
    insertadas: 0,
    duplicadas: 3,
    sinFecha: 0,
    inconsistentes: 0,
  },
}

/**
 * Seed sano: una corrida completada reciente para cada job programado de la lista de la app, fuentes
 * `ok` y una serie de climatología completa. Con esto el panel de estado tiene que decir
 * "Todos los datos al día". Los ajustes cambian una parte y dejan el resto sano.
 */
export async function prepararEstadoSano(ajustes: AjustesSano = {}): Promise<Restaurar> {
  const db = getDb()
  const restauraciones: Restaurar[] = []
  const deshacer = async () => {
    for (const restaurar of restauraciones.reverse()) await restaurar()
  }

  try {
    restauraciones.push(await sembrarCorridasSanas(db, ajustes.contadores ?? {}))
    restauraciones.push(await sembrarFuentesSanas(db, ajustes.fuentesSinFilas ?? []))
    restauraciones.push(await sembrarClimatologiaCompleta(db))
  } catch (error) {
    await deshacer()
    throw error
  }
  return deshacer
}

async function sembrarCorridasSanas(db: Db, ajustes: Record<string, Record<string, number>>): Promise<Restaurar> {
  const ahoraIso = new Date().toISOString()
  const inicioIso = new Date(Date.now() - 60_000).toISOString()
  const filas = JOBS_ESPERADOS.filter((job) => job.tipo !== null && job.habilitado).map((job) => {
    const tipo = job.tipo as string
    const base = job.contadorFilas !== undefined ? { [job.contadorFilas]: job.minimoFilas ?? 1 } : {}
    return {
      id: randomUUID(),
      tipo,
      claveIdempotente: `e2e-sano-${randomUUID()}`,
      intento: 1,
      iniciadoEn: inicioIso,
      finalizadoEn: ahoraIso,
      estado: 'completado',
      contadores: { ...base, ...CONTADORES_TRAMPA[tipo], ...ajustes[tipo] },
      errorSaneado: null,
      version: 'e2e',
      leaseOwner: null,
      leaseExpiraEn: null,
      creadaEn: inicioIso,
      actualizadaEn: ahoraIso,
    }
  })
  await db.insert(infraJobRun).values(filas)
  const ids = filas.map((fila) => fila.id)
  return async () => {
    await db.delete(infraJobRun).where(inArray(infraJobRun.id, ids))
  }
}

async function sembrarFuentesSanas(db: Db, sinFilas: string[]): Promise<Restaurar> {
  const ahoraIso = new Date().toISOString()
  const providers = FUENTES_SANAS.map((fuente) => fuente.provider)
  // Se guardan las filas previas para restaurarlas tal cual, aunque el seed no las tenga.
  const previas = await db.select().from(hazardSourceHealth).where(inArray(hazardSourceHealth.provider, providers))
  await db.delete(hazardSourceHealth).where(inArray(hazardSourceHealth.provider, providers))
  await db.insert(hazardSourceHealth).values(
    FUENTES_SANAS.map((fuente) => ({
      provider: fuente.provider,
      ultimoExitoEn: ahoraIso,
      ultimoIntentoEn: ahoraIso,
      estado: 'ok',
      ultimoErrorSaneado: null,
      ttlMinutos: fuente.ttlMinutos,
      licencia: 'e2e',
      actualizadaEn: ahoraIso,
    })),
  )
  for (const provider of sinFilas) {
    const fuente = FUENTES_SANAS.find((f) => f.provider === provider)
    if (!fuente) throw new Error(`sembrarFuentesSanas: ${provider} no está en FUENTES_SANAS`)
    // Lo mismo que hace el job al recibir una respuesta vacía: ok sin filas se guarda degradado.
    await actualizarSaludFuente(db, {
      provider,
      ttlMinutos: fuente.ttlMinutos,
      licencia: 'e2e',
      estado: 'ok',
      ultimoErrorSaneado: null,
      ahoraIso,
      filasRecibidas: 0,
    })
  }
  return async () => {
    await db.delete(hazardSourceHealth).where(inArray(hazardSourceHealth.provider, providers))
    if (previas.length > 0) await db.insert(hazardSourceHealth).values(previas)
  }
}

async function sembrarClimatologiaCompleta(db: Db): Promise<Restaurar> {
  // Mismo universo de celdas que la cobertura de salud.ts: un punto por geometryRef con lat/lon.
  const perfiles = await db
    .select({ geometryRef: infraGeoProfile.geometryRef, lat: infraGeoProfile.lat, lon: infraGeoProfile.lon })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))
  const puntos = new Map<string, PuntoClimatologia>()
  for (const perfil of perfiles) {
    if (perfil.geometryRef === null || perfil.lat === null || perfil.lon === null) continue
    if (!puntos.has(perfil.geometryRef)) {
      puntos.set(perfil.geometryRef, { geometryRef: perfil.geometryRef, lat: perfil.lat, lon: perfil.lon })
    }
  }
  const celdas = agruparPuntosPorEra5([...puntos.values()])
  const claves = celdas.map((celda) => celda.claveEra5)
  if (claves.length === 0) throw new Error('sembrarClimatologiaCompleta: no hay perfiles geográficos con celda ERA5')

  // No se pisa una serie existente: si el seed ya trae climatología, el escenario falla en vez de borrarla.
  const existentes = await db
    .select({ celdaEra5: hazardPrecipitacionSerie.celdaEra5 })
    .from(hazardPrecipitacionSerie)
    .where(inArray(hazardPrecipitacionSerie.celdaEra5, claves))
  if (existentes.length > 0) throw new Error('sembrarClimatologiaCompleta: ya hay serie de precipitación para celdas del seed')

  const ahoraIso = new Date().toISOString()
  const filas = celdas.flatMap((celda) =>
    Array.from({ length: ANIOS_MINIMOS_CLIMATOLOGIA }, (_, i) => ({
      celdaEra5: celda.claveEra5,
      anio: 1980 + i,
      lat: celda.lat,
      lon: celda.lon,
      valores: [],
      diasConDato: 365,
      descargadoEn: ahoraIso,
    })),
  )
  await db.insert(hazardPrecipitacionSerie).values(filas)
  return async () => {
    await db.delete(hazardPrecipitacionSerie).where(inArray(hazardPrecipitacionSerie.celdaEra5, claves))
  }
}
