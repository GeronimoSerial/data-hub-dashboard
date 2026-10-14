// Job de climatología diaria IMERG (one-off + permanente): baja de NASA GPM IMERG
// Final diario (GPM_3IMERGDF v07) los subsets por bbox vía OPeNDAP de Earthdata
// Cloud y guarda la serie diaria por celda de 0.1° en `hazard_precipitacion_serie`
// bajo la clave `imerg:<geometryRef>`. Luego recalcula `hazard_climatology` con la
// versión `climatologia-imerg-v1`.
//
// Idempotencia y reanudación: la unidad de trabajo es un mes. Un mes sólo se guarda
// si todos sus días bajaron bien; ante cualquier error se descarta el mes completo y
// se corta el loop. Cada corrida retoma los días que todavía no tienen valor en
// ninguna celda. Las descargas son secuenciales (uso justo de NASA).
//
// El período sale de `ahora` (ver periodoClimatologiaImerg), sin fechas fijas.
import { randomUUID } from 'node:crypto'
import { isNotNull, like, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hazardClimatology, hazardPrecipitacionSerie, infraGeoProfile } from '@/lib/db/schema'
import { actualizarSaludFuente } from './salud-fuente'
import { adquirirLease, publicarResultado, renovarLease } from '../job-run'
import { diasDelAnio, guardarAnioSerie } from '../climatologia/serie-diaria'
import { calcularUmbralesAcumulados } from '../climatologia/umbrales'
import {
  claveSerieImerg,
  construirUrlCmrMes,
  construirUrlSubsetDiario,
  listarGranulosDiarios,
  parsearSubsetDiario,
  periodoClimatologiaImerg,
  PREFIJO_SERIE_IMERG,
  VERSION_CLIMATOLOGIA_IMERG,
  type GranuloDiarioImerg,
} from '../providers/climatologia-imerg'

export type ResultadoCalcularClimatologiaImerg = {
  /** Días (de cualquier celda) bajados y guardados en esta corrida. */
  diasDescargados: number
  /** Días del período que todavía no tienen valor en ninguna celda. */
  diasPendientes: number
  /** Meses que fallaron (un error descarta el mes y corta la corrida). */
  diasConError: number
  /** Celdas con >= 10 años completos cuyos umbrales IMERG se escribieron. */
  celdasConUmbral: number
  /** Requests HTTP hechas en esta corrida (CMR + subsets). */
  requests: number
  /** `true` si el presupuesto de días por corrida cortó el loop antes de terminar. */
  cortadoPorPresupuesto: boolean
  /** Mensaje saneado del primer error, o null. */
  error: string | null
}

const TIPO_JOB = 'calculo-climatologia-imerg'
const PROVIDER = 'nasa-imerg-climatologia'
const TTL_MINUTOS = 2880
const LICENCIA = 'NASA GPM IMERG Final (GPM_3IMERGDF v07) — GES DISC, cuenta NASA Earthdata requerida'
const DURACION_LEASE_MS = 15 * 60 * 1000
const DIAS_POR_CORRIDA_DEFAULT = 1200
const TIMEOUT_MS = 60_000
const MS_POR_DIA = 86_400_000
const LARGO_MAX_ERROR = 300

type Db = ReturnType<typeof getDb>
type SeriesPorAnio = Map<number, Map<string, Array<number | null>>>
type MesPeriodo = { anio: number; mes: number; fechas: string[] }

export async function ejecutarCalculoClimatologiaImerg(params?: {
  ahora?: Date
  earthdataToken?: string
  fetchImpl?: typeof fetch
  diasPorCorrida?: number
  periodoDesde?: string
  periodoHasta?: string
}): Promise<{ ok: true; resultado: ResultadoCalcularClimatologiaImerg } | { ok: false; motivo: 'lease_no_disponible' | 'sin_token' }> {
  const db = getDb()
  const ahora = params?.ahora ?? new Date()
  const periodo = periodoClimatologiaImerg(ahora)
  const periodoDesde = params?.periodoDesde ?? periodo.periodoDesde
  const periodoHasta = params?.periodoHasta ?? periodo.periodoHasta
  const diasPorCorrida = params?.diasPorCorrida ?? diasPorCorridaDesdeEntorno()
  const earthdataToken = params?.earthdataToken
  const fetchImpl = params?.fetchImpl ?? fetch

  const fechaUtc = ahora.toISOString().slice(0, 10)
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente: `${periodoHasta}_${VERSION_CLIMATOLOGIA_IMERG}_${fechaUtc}`,
    version: VERSION_CLIMATOLOGIA_IMERG,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) {
    return { ok: false, motivo: 'lease_no_disponible' }
  }

  // Igual que calcular-climatologia.ts: cualquier excepción tras adquirir el lease
  // debe marcar la corrida 'fallido' antes de relanzar, si no queda 'en_progreso'.
  try {
    if (!earthdataToken) {
      const mensaje = 'falta EARTHDATA_TOKEN'
      await actualizarSaludFuente(db, {
        provider: PROVIDER,
        ttlMinutos: TTL_MINUTOS,
        licencia: LICENCIA,
        estado: 'no_disponible',
        ultimoErrorSaneado: mensaje,
        ahoraIso: ahora.toISOString(),
      })
      await publicarResultado({
        jobRunId: lease.jobRunId,
        leaseOwner: lease.leaseOwner,
        estado: 'fallido',
        errorSaneado: mensaje,
        ahora,
      })
      return { ok: false, motivo: 'sin_token' }
    }

    return await ejecutarCuerpoDelJobImerg({
      db,
      ahora,
      periodoDesde,
      periodoHasta,
      diasPorCorrida,
      earthdataToken,
      fetchImpl,
      lease,
    })
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al ejecutar calculo-climatologia-imerg',
      ahora,
    })
    throw error
  }
}

async function ejecutarCuerpoDelJobImerg(ctx: {
  db: Db
  ahora: Date
  periodoDesde: string
  periodoHasta: string
  diasPorCorrida: number
  earthdataToken: string
  fetchImpl: typeof fetch
  lease: { adquirido: true; jobRunId: string; leaseOwner: string }
}): Promise<{ ok: true; resultado: ResultadoCalcularClimatologiaImerg }> {
  const { db, ahora, periodoDesde, periodoHasta, diasPorCorrida, earthdataToken, fetchImpl, lease } = ctx
  const ahoraIso = ahora.toISOString()
  const anioDesde = Number(periodoDesde.slice(0, 4))
  const anioHasta = Number(periodoHasta.slice(0, 4))

  const celdas = await cargarCeldas(db)
  const seriesPorAnio = await cargarSeriesGuardadas(db)
  const meses = diasDelPeriodo(periodoDesde, periodoHasta)

  let diasDescargados = 0
  let diasConError = 0
  let requests = 0
  let cortadoPorPresupuesto = false
  let error: string | null = null

  for (const mes of meses) {
    const pendientes = mes.fechas.filter((fecha) => !diaHecho(seriesPorAnio, fecha))
    if (pendientes.length === 0) continue
    if (diasDescargados + pendientes.length > diasPorCorrida) {
      cortadoPorPresupuesto = true
      break
    }

    // Todo el mes se baja antes de guardar: un error descarta el mes completo.
    const valoresPorFecha = new Map<string, Map<string, number | null>>()
    try {
      requests += 1
      const granulos = await buscarGranulosMes(fetchImpl, mes)
      for (const fecha of pendientes) {
        const granulo = granulos.find((candidato) => candidato.fecha === fecha)
        if (!granulo) throw new Error(`granulo IMERG ausente ${fecha}`)
        requests += 1
        valoresPorFecha.set(fecha, await descargarDia(fetchImpl, earthdataToken, granulo))
      }
    } catch (fallo) {
      diasConError += 1
      error = mensajeDeError(fallo)
      break
    }

    for (const celda of celdas) {
      for (const fecha of pendientes) {
        const { anio, indice } = indiceDelDia(fecha)
        const porCelda = seriesPorAnio.get(anio) ?? new Map<string, Array<number | null>>()
        const valores = porCelda.get(celda.geometryRef) ?? new Array<number | null>(diasDelAnio(anio)).fill(null)
        valores[indice] = valoresPorFecha.get(fecha)?.get(celda.geometryRef) ?? null
        porCelda.set(celda.geometryRef, valores)
        seriesPorAnio.set(anio, porCelda)
      }
      await guardarAnioSerie(db, {
        celdaEra5: claveSerieImerg(celda.geometryRef),
        anio: mes.anio,
        lat: celda.lat,
        lon: celda.lon,
        valores: seriesPorAnio.get(mes.anio)?.get(celda.geometryRef) ?? [],
        descargadoEn: ahoraIso,
      })
    }

    diasDescargados += pendientes.length
    await renovarLease({ jobRunId: lease.jobRunId, leaseOwner: lease.leaseOwner, duracionLeaseMs: DURACION_LEASE_MS, ahora })
  }

  // Umbrales: sólo años completos dentro del período; la celda necesita >= 10 años.
  let celdasConUmbral = 0
  for (const celda of celdas) {
    const anios: Array<{ anio: number; valores: Array<number | null> }> = []
    for (const [anio, porCelda] of seriesPorAnio) {
      const valores = porCelda.get(celda.geometryRef)
      if (valores && anio >= anioDesde && anio <= anioHasta) anios.push({ anio, valores })
    }
    const umbrales = calcularUmbralesAcumulados({ geometryRef: celda.geometryRef, anios })
    if (!umbrales) continue

    const filas = umbrales.puntos.map((punto) => ({
      id: randomUUID(),
      geometryRef: celda.geometryRef,
      variable: punto.variable,
      percentil: punto.percentil,
      muestra: punto.muestra,
      valor: punto.valor,
      unidad: punto.unidad,
      periodoDesde: umbrales.periodoDesde,
      periodoHasta: umbrales.periodoHasta,
      version: VERSION_CLIMATOLOGIA_IMERG,
      calculadoEn: ahoraIso,
      aniosCobertura: umbrales.aniosCobertura,
      diasCobertura: umbrales.diasCobertura,
    }))
    if (filas.length === 0) continue

    await db
      .insert(hazardClimatology)
      .values(filas)
      .onConflictDoUpdate({
        target: [
          hazardClimatology.geometryRef,
          hazardClimatology.variable,
          hazardClimatology.percentil,
          hazardClimatology.muestra,
          hazardClimatology.periodoDesde,
          hazardClimatology.periodoHasta,
          hazardClimatology.version,
        ],
        set: {
          valor: sql`excluded.valor`,
          unidad: sql`excluded.unidad`,
          calculadoEn: sql`excluded.calculado_en`,
          aniosCobertura: sql`excluded.anios_cobertura`,
          diasCobertura: sql`excluded.dias_cobertura`,
        },
      })
    celdasConUmbral += 1
  }

  let diasPendientes = 0
  for (const mes of meses) {
    for (const fecha of mes.fechas) {
      if (!diaHecho(seriesPorAnio, fecha)) diasPendientes += 1
    }
  }

  const errorSaneado = error === null ? null : error.slice(0, LARGO_MAX_ERROR)
  await actualizarSaludFuente(db, {
    provider: PROVIDER,
    ttlMinutos: TTL_MINUTOS,
    licencia: LICENCIA,
    estado: errorSaneado === null ? 'ok' : 'degradado',
    ultimoErrorSaneado: errorSaneado,
    ahoraIso,
  })

  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: errorSaneado === null ? 'completado' : 'fallido',
    errorSaneado: errorSaneado ?? undefined,
    contadores: { diasDescargados, diasPendientes, diasConError, celdasConUmbral, requests },
    ahora,
  })

  return {
    ok: true,
    resultado: {
      diasDescargados,
      diasPendientes,
      diasConError,
      celdasConUmbral,
      requests,
      cortadoPorPresupuesto,
      error: errorSaneado,
    },
  }
}

function diasPorCorridaDesdeEntorno(): number {
  const valor = Number(process.env.IMERG_CLIMATOLOGIA_DIAS_POR_CORRIDA)
  return Number.isInteger(valor) && valor > 0 ? valor : DIAS_POR_CORRIDA_DEFAULT
}

/** Celdas con perfil válido; lat/lon salen de la clave "<lat>_<lon>". */
async function cargarCeldas(db: Db): Promise<Array<{ geometryRef: string; lat: number; lon: number }>> {
  const filas = await db
    .selectDistinct({ geometryRef: infraGeoProfile.geometryRef })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))

  const celdas: Array<{ geometryRef: string; lat: number; lon: number }> = []
  for (const fila of filas) {
    if (fila.geometryRef === null) continue
    const [latTexto, lonTexto] = fila.geometryRef.split('_')
    const lat = Number(latTexto)
    const lon = Number(lonTexto)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    celdas.push({ geometryRef: fila.geometryRef, lat, lon })
  }
  return celdas
}

/** Series IMERG ya guardadas: año -> geometryRef -> valores diarios. */
async function cargarSeriesGuardadas(db: Db): Promise<SeriesPorAnio> {
  const filas = await db
    .select({
      celdaEra5: hazardPrecipitacionSerie.celdaEra5,
      anio: hazardPrecipitacionSerie.anio,
      valores: hazardPrecipitacionSerie.valores,
    })
    .from(hazardPrecipitacionSerie)
    .where(like(hazardPrecipitacionSerie.celdaEra5, `${PREFIJO_SERIE_IMERG}%`))

  const series: SeriesPorAnio = new Map()
  for (const fila of filas) {
    const geometryRef = fila.celdaEra5.slice(PREFIJO_SERIE_IMERG.length)
    const porCelda = series.get(fila.anio) ?? new Map<string, Array<number | null>>()
    porCelda.set(geometryRef, fila.valores)
    series.set(fila.anio, porCelda)
  }
  return series
}

/** Un día está hecho si alguna celda tiene valor numérico en ese índice. */
function diaHecho(series: SeriesPorAnio, fecha: string): boolean {
  const { anio, indice } = indiceDelDia(fecha)
  const porCelda = series.get(anio)
  if (!porCelda) return false
  for (const valores of porCelda.values()) {
    if (typeof valores[indice] === 'number') return true
  }
  return false
}

/** Índice del día dentro de su año (0 = 1 de enero), en UTC. */
function indiceDelDia(fecha: string): { anio: number; indice: number } {
  const anio = Number(fecha.slice(0, 4))
  const indice = Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.UTC(anio, 0, 1)) / MS_POR_DIA)
  return { anio, indice }
}

/** Agrupa los días del período (UTC, inclusive) por mes calendario, en orden. */
function diasDelPeriodo(desde: string, hasta: string): MesPeriodo[] {
  const meses: MesPeriodo[] = []
  const fin = Date.parse(`${hasta}T00:00:00Z`)
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= fin; t += MS_POR_DIA) {
    const fecha = new Date(t).toISOString().slice(0, 10)
    const anio = Number(fecha.slice(0, 4))
    const mes = Number(fecha.slice(5, 7))
    const ultimo = meses[meses.length - 1]
    if (ultimo && ultimo.anio === anio && ultimo.mes === mes) {
      ultimo.fechas.push(fecha)
    } else {
      meses.push({ anio, mes, fechas: [fecha] })
    }
  }
  return meses
}

async function buscarGranulosMes(fetchImpl: typeof fetch, mes: MesPeriodo): Promise<GranuloDiarioImerg[]> {
  const etiqueta = `${mes.anio}-${String(mes.mes).padStart(2, '0')}`
  let respuesta: Response
  try {
    respuesta = await fetchImpl(construirUrlCmrMes(mes.anio, mes.mes))
  } catch {
    throw new Error(`cmr error ${etiqueta}`)
  }
  if (!respuesta.ok) throw new Error(`cmr HTTP ${respuesta.status} ${etiqueta}`)
  try {
    return listarGranulosDiarios(await respuesta.json())
  } catch {
    throw new Error(`cmr error ${etiqueta}`)
  }
}

async function descargarDia(
  fetchImpl: typeof fetch,
  earthdataToken: string,
  granulo: GranuloDiarioImerg,
): Promise<Map<string, number | null>> {
  let respuesta: Response
  try {
    respuesta = await fetchImpl(construirUrlSubsetDiario(granulo.urlOpendap), {
      headers: { Authorization: `Bearer ${earthdataToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new Error(`subset error ${granulo.fecha}`)
  }
  if (!respuesta.ok) throw new Error(`subset HTTP ${respuesta.status} ${granulo.fecha}`)
  try {
    return parsearSubsetDiario(await respuesta.text())
  } catch {
    throw new Error(`subset error ${granulo.fecha}`)
  }
}

function mensajeDeError(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : 'error desconocido'
}
