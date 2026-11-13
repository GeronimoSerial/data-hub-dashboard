import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { and, desc, eq, gte, lt, ne } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db'
import { radarMeteoEnsembleRun } from '@/lib/db/schema'
import { listarDepartamentos, obtenerVersionGeografia } from './departamentos'
import {
  agregarApiKey,
  apiKeyDesdeEntorno,
  construirBaseUrl,
  crearControladorCupo,
  pesoLlamada,
} from '../riesgo/providers/cupo-om'
import { adquirirLease, publicarResultado } from '../riesgo/job-run'
import { formatoFechaRegion, zonaHorariaRegion } from '../formato-region'

export const MODELO_ENSEMBLE = 'ecmwf_ifs025'
export const PESO_ENSEMBLE = pesoLlamada({ ubicaciones: 25, variables: 51, dias: 7 })

const TOPE_DIARIO = 600
const MAXIMO_CORRIDAS_DIARIAS = 4
const DURACION_LEASE_MS = 20 * 60 * 1000
const RETENCION_MS = 14 * 86_400_000

export type SerieEnsemble = {
  departamentoId: string
  times: string[]
  miembros: Array<Array<number | null>>
}

type ResumenEnsemble = ReturnType<typeof agregarEnsembleDiario>
type PayloadEnsemble = {
  diarios: ResumenEnsemble
  peso?: number
  miembros?: number
  error?: string
}
type EstadisticaDiaria = {
  p10: number | null
  p50: number | null
  p90: number | null
  pMayor10: number | null
  pMayor25: number | null
  pMayor50: number | null
  miembrosValidos: number
}
type FilaProveedorEnsemble = { hourly?: Record<string, unknown> }

export function radarEnsembleEnabled(): boolean {
  return process.env.RADAR_ENSEMBLE_ENABLED !== 'false'
}

function fechaLocal(iso: string): string {
  const partes = formatoFechaRegion('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso))
  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]))
  return `${valores.year}-${valores.month}-${valores.day}`
}

function percentil(valores: number[], probabilidad: number): number {
  const ordenados = [...valores].sort((a, b) => a - b)
  const posicion = (ordenados.length - 1) * probabilidad
  const inferior = Math.floor(posicion)
  const superior = Math.ceil(posicion)
  return ordenados[inferior] + (ordenados[superior] - ordenados[inferior]) * (posicion - inferior)
}

function acumularMiembroDia(miembro: Array<number | null>, indices: number[]): number | null {
  const valores = indices.map((indice) => miembro[indice])
  if (!valores.length || !valores.every((valor) => typeof valor === 'number' && Number.isFinite(valor))) {
    return null
  }
  return valores.reduce<number>((total, valor) => total + (valor ?? 0), 0)
}

function calcularEstadistica(acumulados: number[]): EstadisticaDiaria {
  if (acumulados.length === 0) {
    return {
      p10: null,
      p50: null,
      p90: null,
      pMayor10: null,
      pMayor25: null,
      pMayor50: null,
      miembrosValidos: 0,
    }
  }

  const probabilidadSobre = (umbral: number) =>
    acumulados.filter((total) => total >= umbral).length / acumulados.length
  return {
    p10: percentil(acumulados, 0.1),
    p50: percentil(acumulados, 0.5),
    p90: percentil(acumulados, 0.9),
    pMayor10: probabilidadSobre(10),
    pMayor25: probabilidadSobre(25),
    pMayor50: probabilidadSobre(50),
    miembrosValidos: acumulados.length,
  }
}

/** Suma primero las horas locales de cada miembro y calcula después cuantiles y probabilidades. */
export function agregarEnsembleDiario(
  series: SerieEnsemble[],
): Record<string, Record<string, EstadisticaDiaria>> {
  const salida: Record<string, Record<string, EstadisticaDiaria>> = {}

  for (const serie of series) {
    const dias = [...new Set(serie.times.map(fechaLocal))]
    salida[serie.departamentoId] = {}

    for (const dia of dias) {
      const indices = serie.times
        .map((tiempo, indice) => (fechaLocal(tiempo) === dia ? indice : -1))
        .filter((indice) => indice >= 0)
      const acumulados = serie.miembros
        .map((miembro) => acumularMiembroDia(miembro, indices))
        .filter((valor): valor is number => valor !== null)
      salida[serie.departamentoId][dia] = calcularEstadistica(acumulados)
    }
  }

  return salida
}

function slotSeisHoras(ahora: Date): { inicio: Date; clave: string } {
  const inicio = new Date(ahora)
  inicio.setUTCMinutes(0, 0, 0)
  inicio.setUTCHours(Math.floor(inicio.getUTCHours() / 6) * 6)
  return { inicio, clave: inicio.toISOString().slice(0, 13) }
}

function inicioDiaUtc(ahora: Date): { inicio: string; fin: string } {
  const fecha = ahora.toISOString().slice(0, 10)
  return { inicio: `${fecha}T00:00:00.000Z`, fin: `${fecha}T23:59:59.999Z` }
}

export async function obtenerUltimoRunEnsemble(db = getDb()) {
  await cargarReferencias()
  const [run] = await db
    .select()
    .from(radarMeteoEnsembleRun)
    .where(eq(radarMeteoEnsembleRun.status, 'completo'))
    .orderBy(desc(radarMeteoEnsembleRun.fetchedAt))
    .limit(1)
  return run ?? null
}

export async function purgarEnsembleAntiguo(
  db = getDb(),
  ahora = new Date(),
  preservarId?: string,
): Promise<void> {
  await cargarReferencias()
  const limite = new Date(ahora.getTime() - RETENCION_MS).toISOString()
  const vencido = lt(radarMeteoEnsembleRun.fetchedAt, limite)
  const condicion = preservarId
    ? and(vencido, ne(radarMeteoEnsembleRun.id, preservarId))
    : vencido
  await db.delete(radarMeteoEnsembleRun).where(condicion)
}

async function buscarRunIdempotente(clave: string) {
  const [run] = await getDb()
    .select()
    .from(radarMeteoEnsembleRun)
    .where(eq(radarMeteoEnsembleRun.idempotencyKey, clave))
    .limit(1)
  return run ?? null
}

async function contarUsoDiario(ahora: Date) {
  const { inicio, fin } = inicioDiaUtc(ahora)
  const corridas = await getDb()
    .select()
    .from(radarMeteoEnsembleRun)
    .where(
      and(
        gte(radarMeteoEnsembleRun.fetchedAt, inicio),
        lt(radarMeteoEnsembleRun.fetchedAt, fin),
      ),
    )
  const solicitudes = corridas.filter((run) =>
    ['completo', 'fallido', 'pausado'].includes(run.status),
  ).length
  const peso = corridas.reduce(
    (total, run) => total + Number((run.payload as PayloadEnsemble)?.peso ?? 0),
    0,
  )
  const pausado = corridas.some((run) => run.status === 'pausado')
  return { solicitudes, peso, pausado }
}

function crearClaveIdempotente(claveSlot: string): string {
  return `open-meteo-ensemble:${MODELO_ENSEMBLE}:${obtenerVersionGeografia()}:${claveSlot}`
}

function parsearFilasProveedor(respuesta: unknown, cantidadEsperada: number): FilaProveedorEnsemble[] {
  const filas: FilaProveedorEnsemble[] = Array.isArray(respuesta)
    ? (respuesta as FilaProveedorEnsemble[])
    : [respuesta as FilaProveedorEnsemble]
  if (filas.length !== cantidadEsperada) {
    throw new Error('Cantidad de ubicaciones Ensemble inválida')
  }
  return filas
}

function validarTiempos(fila: FilaProveedorEnsemble | undefined): string[] {
  const tiempos = fila?.hourly?.time
  if (!Array.isArray(tiempos) || !tiempos.length || !tiempos.every((t) => typeof t === 'string')) {
    throw new Error('Ensemble sin timestamps')
  }
  return tiempos as string[]
}

function validarMiembros(fila: FilaProveedorEnsemble, longitud: number): Array<Array<number | null>> {
  const series = fila.hourly ?? {}
  const claves = Object.keys(series)
    .filter((clave) => /^precipitation_member\d+$/.test(clave))
    .sort()
  const miembros = claves.map((clave) => {
    const valores = series[clave]
    const validos =
      Array.isArray(valores) &&
      valores.length === longitud &&
      valores.every((valor) =>
        valor === null || (typeof valor === 'number' && Number.isFinite(valor)),
      )
    if (!validos) throw new Error('Serie Ensemble inválida')
    return valores as Array<number | null>
  })
  if (miembros.length === 0) throw new Error('Ensemble sin miembros')
  return miembros
}

function construirUrl(apiKey: string | undefined): URL {
  const departamentos = listarDepartamentos()
  const url = new URL(construirBaseUrl('ensemble-api', '/v1/ensemble', apiKey))
  url.searchParams.set('latitude', departamentos.map((d) => d.centro[1]).join(','))
  url.searchParams.set('longitude', departamentos.map((d) => d.centro[0]).join(','))
  url.searchParams.set('models', MODELO_ENSEMBLE)
  url.searchParams.set('hourly', 'precipitation')
  url.searchParams.set('forecast_days', '7')
  url.searchParams.set('timezone', 'UTC')
  return url
}

async function solicitarEnsemble(
  url: URL,
  apiKey: string | undefined,
  fetchImpl: typeof fetch,
  ahora: Date,
) {
  const db = getDb()
  const cupo = crearControladorCupo({
    host: 'ensemble-api',
    peso: PESO_ENSEMBLE,
    apiKeyPresente: Boolean(apiKey),
    db,
    ahora: () => ahora,
  })
  const reserva = await cupo.reservar()
  if (!reserva.ok) throw new Error(reserva.motivo)

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), 30_000)
  let respuesta: Response
  try {
    respuesta = await fetchImpl(agregarApiKey(url.toString(), apiKey), {
      signal: controlador.signal,
    })
  } finally {
    clearTimeout(temporizador)
  }

  if (respuesta.status === 429) {
    const retryAfter = respuesta.headers.get('retry-after')
    const demoraMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : null
    await cupo.registrar429(demoraMs)
    throw new Error('HTTP 429')
  }
  if ([401, 402, 403].includes(respuesta.status)) {
    throw new Error(`plan/permission HTTP ${respuesta.status}`)
  }
  if (!respuesta.ok) throw new Error(`Open-Meteo HTTP ${respuesta.status}`)
  return respuesta.json() as Promise<unknown>
}

async function guardarEstadoRun(
  clave: string,
  inicio: Date,
  ahora: Date,
  estado: string,
  payload: unknown,
  existenteId?: string,
  forecast?: { inicio: string; fin: string },
): Promise<string> {
  const db = getDb()
  const id = existenteId ?? randomUUID()
  const valores = {
    model: MODELO_ENSEMBLE,
    runAt: inicio.toISOString(),
    fetchedAt: ahora.toISOString(),
    timezone: zonaHorariaRegion(),
    departmentGeoVersion: obtenerVersionGeografia(),
    forecastStart: forecast?.inicio ?? '',
    forecastEnd: forecast?.fin ?? '',
    status: estado,
    idempotencyKey: clave,
    payload,
  }

  const existente = await buscarRunIdempotente(clave)
  if (existente) {
    await db.update(radarMeteoEnsembleRun).set(valores).where(eq(radarMeteoEnsembleRun.id, id))
  } else {
    await db.insert(radarMeteoEnsembleRun).values({ id, ...valores })
  }
  return id
}

async function guardarOmitidoPorTope(
  clave: string,
  inicio: Date,
  ahora: Date,
  existenteId: string | undefined,
  uso: { peso: number; solicitudes: number },
  lease: { jobRunId: string; leaseOwner: string },
) {
  const id = await guardarEstadoRun(
    clave,
    inicio,
    ahora,
    'omitido_por_tope',
    { peso: PESO_ENSEMBLE, pesoGastado: uso.peso, calls: uso.solicitudes },
    existenteId,
  )
  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: 'completado',
    contadores: { peso: PESO_ENSEMBLE, calls: uso.solicitudes },
    ahora,
  })
  return { ejecutado: false, estado: 'omitido_por_tope' as const, runId: id }
}

export async function ejecutarSyncRadarEnsemble(
  opciones: { ahora?: Date; fetchImpl?: typeof fetch } = {},
) {
  await cargarReferencias()
  const ahora = opciones.ahora ?? new Date()
  const fetchImpl = opciones.fetchImpl ?? fetch
  const { inicio, clave: claveSlot } = slotSeisHoras(ahora)
  const clave = crearClaveIdempotente(claveSlot)
  const existente = await buscarRunIdempotente(clave)

  if (existente?.status === 'completo' || existente?.status === 'omitido_por_tope') {
    return { ejecutado: false, estado: existente.status, runId: existente.id }
  }
  if (!radarEnsembleEnabled()) return { ejecutado: false, estado: 'deshabilitado' }

  const lease = await adquirirLease({
    tipo: 'sync-radar-ensemble',
    claveIdempotente: claveSlot,
    version: MODELO_ENSEMBLE,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, estado: 'omitido' }

  const uso = await contarUsoDiario(ahora)
  const referenciaLease = { jobRunId: lease.jobRunId, leaseOwner: lease.leaseOwner }
  if (uso.pausado) {
    await publicarResultado({
      ...referenciaLease,
      estado: 'completado',
      contadores: { pausado: 1 },
      ahora,
    })
    return { ejecutado: false, estado: 'pausado_hasta_manana' }
  }
  if (
    uso.solicitudes >= MAXIMO_CORRIDAS_DIARIAS ||
    uso.peso + PESO_ENSEMBLE > TOPE_DIARIO
  ) {
    return guardarOmitidoPorTope(
      clave,
      inicio,
      ahora,
      existente?.id,
      uso,
      referenciaLease,
    )
  }

  try {
    // This local pilot budget is checked before reserving shared provider quota or sending HTTP.
    if (uso.peso + PESO_ENSEMBLE > TOPE_DIARIO) throw new Error('omitido_por_tope')

    const departamentos = listarDepartamentos()
    const apiKey = apiKeyDesdeEntorno()
    const datos = await solicitarEnsemble(construirUrl(apiKey), apiKey, fetchImpl, ahora)
    const filas = parsearFilasProveedor(datos, departamentos.length)
    const tiempos = validarTiempos(filas[0])
    const series = filas.map((fila, indice): SerieEnsemble => ({
      departamentoId: departamentos[indice].id,
      times: tiempos,
      miembros: validarMiembros(fila, tiempos.length),
    }))
    const cantidadMiembros = series[0].miembros.length
    const payload = {
      diarios: agregarEnsembleDiario(series),
      peso: PESO_ENSEMBLE,
      miembros: cantidadMiembros,
    }
    const id = await guardarEstadoRun(
      clave,
      inicio,
      ahora,
      'completo',
      payload,
      existente?.id,
      { inicio: tiempos[0], fin: tiempos.at(-1)! },
    )

    await purgarEnsembleAntiguo(getDb(), ahora, id)
    await publicarResultado({
      ...referenciaLease,
      estado: 'completado',
      contadores: { departamentos: filas.length, peso: PESO_ENSEMBLE },
      ahora,
    })
    return { ejecutado: true, estado: 'completo', runId: id }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    const estado = /429|plan\/permission/.test(mensaje) ? 'pausado' : 'fallido'
    await guardarEstadoRun(
      clave,
      inicio,
      ahora,
      estado,
      {
        error: mensaje.slice(0, 250),
        peso: PESO_ENSEMBLE,
        pausaHasta: estado === 'pausado' ? ahora.toISOString().slice(0, 10) : null,
      },
      existente?.id,
    )
    await publicarResultado({
      ...referenciaLease,
      estado: 'fallido',
      errorSaneado: mensaje.slice(0, 200),
      ahora,
    })
    throw error
  }
}

export async function alertasAndEnsemble() {
  await cargarReferencias()
  const run = await obtenerUltimoRunEnsemble()
  if (!run) return null
  return {
    runId: run.id,
    runAt: run.runAt,
    modelo: run.model,
    diarios: (run.payload as PayloadEnsemble).diarios,
  }
}
