// Job de sync de probabilidades por ENSEMBLE (E3a): junta las celdas únicas
// con perfil geográfico válido, cruza cada celda con sus umbrales de
// climatología (p95/p99 sobre `todos_los_dias`) y persiste la probabilidad de
// que el acumulado de 24 h supere esos umbrales en `hazard_ensemble_prob`,
// actualizando además la salud del proveedor en `hazard_source_health`.
//
// Idempotencia en dos capas:
// 1. `infra_job_run` (ver job-run.ts): la claveIdempotente es el bloque de 6h
//    UTC, así dos invocaciones dentro de la misma ventana compiten por el
//    MISMO job run y sólo una lo ejecuta.
// 2. `hazard_ensemble_prob_uidx`
//    (geometryRef+variable+corridaEn+validoEn): si por alguna razón se
//    vuelven a calcular los mismos puntos de la misma corrida, el upsert
//    actualiza probabilidades/dispersión/ingeridoEn en vez de duplicar.
//
// `corridaEn` se ancla al INICIO del bloque de 6h (no al wall-clock), mismo
// criterio que sync-pronostico-caudal.ts: dos invocaciones dentro de la misma
// ventana deben producir el mismo `corridaEn` para que el índice único
// dedupe.
//
// Una celda sin climatología o una tanda que falla NO tumba el job: las
// celdas afectadas van a `erroresPorCelda` (el provider las marca
// `'sin_climatologia'`) y el sync completa igual; el estado queda reflejado
// en `hazard_source_health` como `degradado`.
import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  hazardClimatology,
  hazardEnsembleProb,
  hazardSourceHealth,
  infraGeoProfile,
} from '@/lib/db/schema'
import {
  obtenerProbabilidadesEnsemble as obtenerProbabilidadesEnsembleReal,
  TAMANO_LOTE_COORDENADAS_ENSEMBLE,
} from '../providers/ensemble'
import type { HazardEnsembleProbPunto } from '../providers/ensemble'
import { adquirirLease, publicarResultado, renovarLease as renovarLeaseReal } from '../job-run'

export type ResultadoSyncEnsemble = {
  celdasConsultadas: number
  filasInsertadas: number
  llamadasRealizadas: number
}

// Mismo estilo de retorno que sync-pronostico-caudal.ts: se agrega el caso en
// que el job perdió el lease durante la ejecución (otro proceso lo recuperó),
// conservando `ok:false` y adjuntando el parcial procesado hasta el corte.
export type ResultadoEjecucionSyncEnsemble =
  | { ok: true; resultado: ResultadoSyncEnsemble }
  | { ok: false; motivo: 'lease_no_disponible' }
  | {
      ok: false
      motivo: 'lease_perdido_durante_ejecucion'
      resultado: ResultadoSyncEnsemble
    }

const TIPO_JOB = 'sync-hazard-ensemble'
const VERSION_JOB = 'v1'
const DURACION_LEASE_MS = 5 * 60 * 1000
// TTL de frescura de la fuente igual al del job de pronóstico: el ensemble se
// corre en el mismo ciclo de 6h, así que 360 min (6 h) es el intervalo
// esperado entre corridas exitosas.
const TTL_MINUTOS = 360
// Atribución obligatoria de la familia de proveedor Open-Meteo: mismo texto
// que sync-pronostico-caudal.ts (misma familia de proveedor).
const LICENCIA = 'CC-BY 4.0 no comercial — Open-Meteo + ECMWF, nivel gratuito'
const LARGO_MAX_ERROR = 300

const PROVIDER = 'open-meteo-ensemble'
const VARIABLE_ENSEMBLE = 'precipitacion_24h'
const VERSION_ENSEMBLE = 'ensemble-v0.1'
// La Capa 1 usa siempre el acumulado de 24 h; los horizontes de 24 h y 72 h
// se derivan de qué ventana de 24 h cae dentro de cada horizonte desde
// `corridaEn`, y eso lo resuelve el provider.
const ACUMULADO_HORAS = 24 as const

const VARIABLE_CLIMATOLOGIA = 'precipitacion_diaria'
// Denominador fijado por N1 para el acumulado de 24 h: TODOS los días, no
// sólo los húmedos.
const MUESTRA_CLIMATOLOGIA = 'todos_los_dias'
const PERCENTILES = ['p95', 'p99'] as const

// Tamaño de tanda del job. Alineado con el lote interno de coordenadas del
// provider (`TAMANO_LOTE_COORDENADAS_ENSEMBLE`): cada invocación al provider
// corresponde a una request HTTP, y entre tanda y tanda se renueva el lease
// (mismo concepto que sync-pronostico-caudal.ts, que renueva cada 25 celdas
// procesadas). No es un límite de red propio del job: el provider ya agrupa
// las coordenadas por request; acá la tanda marca cuándo renovar.
const TAMANO_TANDA_CELDAS = TAMANO_LOTE_COORDENADAS_ENSEMBLE

type Db = ReturnType<typeof getDb>

// Bloque de 6h UTC: 00, 06, 12, 18. Copiado de sync-pronostico-caudal.ts (no
// estaba exportado): dos corridas dentro del mismo bloque comparten
// claveIdempotente y por lo tanto son la MISMA corrida.
function claveIdempotenteDeBloque(ahora: Date): string {
  const bloqueHoras = Math.floor(ahora.getUTCHours() / 6) * 6
  const anio = ahora.getUTCFullYear()
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getUTCDate()).padStart(2, '0')
  const hora = String(bloqueHoras).padStart(2, '0')
  return `${anio}-${mes}-${dia}T${hora}`
}

// Ancla `corridaEn` al INICIO del bloque de 6h. Copiado de
// sync-pronostico-caudal.ts (no estaba exportado): con `ahora` (wall-clock)
// dos invocaciones dentro de la misma ventana generarían `corridaEn`
// distintos por milisegundos y el índice único no deduplicaría.
function inicioDeBloqueUtc(ahora: Date): Date {
  const bloqueHoras = Math.floor(ahora.getUTCHours() / 6) * 6
  return new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), bloqueHoras, 0, 0, 0),
  )
}

// Reconstruye la coordenada del centro de la celda desde `geometryRef`. El
// formato es `"${lat}_${lon}"` con un decimal cada uno (ver `celdaDeCoordenada`
// en ../celda.ts), así que esto recupera la lat/lon exacta que el provider
// necesita sin volver a leer la coordenada cruda de cada escuela.
function coordenadaDeCelda(geometryRef: string): { lat: number; lon: number } {
  const [lat, lon] = geometryRef.split('_').map(Number)
  return { lat, lon }
}

// Umbrales de climatología por celda. Se queda con la fila más reciente por
// (geometryRef, percentil) ordenando por periodoHasta/version descendente.
async function cargarUmbralesPorCelda(
  db: Db,
): Promise<{ p95: Map<string, number>; p99: Map<string, number> }> {
  const filas = await db
    .select({
      geometryRef: hazardClimatology.geometryRef,
      percentil: hazardClimatology.percentil,
      valor: hazardClimatology.valor,
    })
    .from(hazardClimatology)
    .where(
      and(
        eq(hazardClimatology.variable, VARIABLE_CLIMATOLOGIA),
        eq(hazardClimatology.muestra, MUESTRA_CLIMATOLOGIA),
        inArray(hazardClimatology.percentil, [...PERCENTILES]),
      ),
    )
    .orderBy(desc(hazardClimatology.periodoHasta), desc(hazardClimatology.version))

  const p95 = new Map<string, number>()
  const p99 = new Map<string, number>()
  for (const fila of filas) {
    const mapa = fila.percentil === 'p95' ? p95 : p99
    // La primera aparición es la más reciente por el orden desc de arriba.
    if (!mapa.has(fila.geometryRef)) {
      mapa.set(fila.geometryRef, fila.valor)
    }
  }
  return { p95, p99 }
}

async function persistirPuntos(
  db: Db,
  puntos: HazardEnsembleProbPunto[],
  ingeridoEn: string,
): Promise<number> {
  if (puntos.length === 0) return 0

  const filas = puntos.map((punto) => ({
    id: randomUUID(),
    geometryRef: punto.geometryRef,
    variable: VARIABLE_ENSEMBLE,
    corridaEn: punto.corridaEn,
    validoEn: punto.validoEn,
    horizonteHoras: punto.horizonteHoras,
    miembrosTotal: punto.miembrosTotal,
    miembrosValidos: punto.miembrosValidos,
    probabilidadP95: punto.probabilidadP95,
    probabilidadP99: punto.probabilidadP99,
    dispersion: punto.dispersion,
    version: VERSION_ENSEMBLE,
    ingeridoEn,
  }))

  await db
    .insert(hazardEnsembleProb)
    .values(filas)
    .onConflictDoUpdate({
      target: [
        hazardEnsembleProb.geometryRef,
        hazardEnsembleProb.variable,
        hazardEnsembleProb.corridaEn,
        hazardEnsembleProb.validoEn,
      ],
      set: {
        horizonteHoras: sql`excluded.horizonte_horas`,
        miembrosTotal: sql`excluded.miembros_total`,
        miembrosValidos: sql`excluded.miembros_validos`,
        probabilidadP95: sql`excluded.probabilidad_p95`,
        probabilidadP99: sql`excluded.probabilidad_p99`,
        dispersion: sql`excluded.dispersion`,
        version: sql`excluded.version`,
        ingeridoEn: sql`excluded.ingerido_en`,
      },
    })

  return filas.length
}

async function actualizarSalud(
  db: Db,
  erroresPorCelda: Record<string, string>,
  ahoraIso: string,
): Promise<void> {
  const mensajes = Object.values(erroresPorCelda)
  const hayError = mensajes.length > 0
  const primerError = hayError ? mensajes[0].slice(0, LARGO_MAX_ERROR) : null

  await db
    .insert(hazardSourceHealth)
    .values({
      provider: PROVIDER,
      // Un insert degradado no conoce un éxito previo: null.
      ultimoExitoEn: hayError ? null : ahoraIso,
      ultimoIntentoEn: ahoraIso,
      estado: hayError ? 'degradado' : 'ok',
      ultimoErrorSaneado: primerError,
      ttlMinutos: TTL_MINUTOS,
      licencia: LICENCIA,
      actualizadaEn: ahoraIso,
    })
    .onConflictDoUpdate({
      target: hazardSourceHealth.provider,
      set: {
        estado: hayError ? 'degradado' : 'ok',
        ultimoIntentoEn: ahoraIso,
        ultimoErrorSaneado: primerError,
        ttlMinutos: TTL_MINUTOS,
        licencia: LICENCIA,
        actualizadaEn: ahoraIso,
        // En degradado se preserva el último éxito conocido; en ok se actualiza.
        ...(hayError ? {} : { ultimoExitoEn: ahoraIso }),
      },
    })
}

export async function ejecutarSyncEnsemble(params?: {
  ahora?: Date
  // Seam de test: permite inyectar el provider sin red, mismo patrón que
  // `ecmwfProvider`/`floodProvider` en sync-pronostico-caudal.ts.
  obtenerProbabilidades?: typeof obtenerProbabilidadesEnsembleReal
  // Seam de test: permite inyectar un `renovarLease` fake sin mockear todo el
  // módulo job-run (que además aporta adquirirLease/publicarResultado).
  renovarLease?: typeof renovarLeaseReal
}): Promise<ResultadoEjecucionSyncEnsemble> {
  const db = getDb()
  const ahora = params?.ahora ?? new Date()
  const ahoraIso = ahora.toISOString()

  const claveIdempotente = claveIdempotenteDeBloque(ahora)
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente,
    version: VERSION_JOB,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) {
    return { ok: false, motivo: 'lease_no_disponible' }
  }

  const filasGeo = await db
    .selectDistinct({ geometryRef: infraGeoProfile.geometryRef })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))
  const celdas = filasGeo
    .map((fila) => fila.geometryRef)
    .filter((ref): ref is string => ref !== null)

  const celdasConCoordenada = celdas.map((geometryRef) => ({
    geometryRef,
    ...coordenadaDeCelda(geometryRef),
  }))

  const { p95: umbralP95PorCelda, p99: umbralP99PorCelda } = await cargarUmbralesPorCelda(db)

  const obtener = params?.obtenerProbabilidades ?? obtenerProbabilidadesEnsembleReal
  const renovar = params?.renovarLease ?? renovarLeaseReal

  // `corridaEn` se deriva del INICIO del bloque, no del wall-clock `ahora`.
  const corridaEn = inicioDeBloqueUtc(ahora).toISOString()

  const erroresPorCelda: Record<string, string> = {}
  let celdasConsultadas = 0
  let filasInsertadas = 0
  let llamadasRealizadas = 0
  let leasePerdido = false

  const totalCeldas = celdasConCoordenada.length
  for (let indice = 0; indice < totalCeldas; indice += TAMANO_TANDA_CELDAS) {
    const tanda = celdasConCoordenada.slice(indice, indice + TAMANO_TANDA_CELDAS)

    let diagnostico: { puntos: HazardEnsembleProbPunto[]; erroresPorCelda: Record<string, string> }
    try {
      diagnostico = await obtener({
        geometryRefsConCoordenada: tanda,
        corridaEn,
        acumuladoHoras: ACUMULADO_HORAS,
        umbralP95PorCelda,
        umbralP99PorCelda,
      })
    } catch (error) {
      // Un provider que lanza (no sólo que reporta errores por celda) no debe
      // tumbar el job: se traduce a error en todas sus celdas y se sigue.
      const mensaje = error instanceof Error ? error.message : String(error)
      const errores: Record<string, string> = {}
      for (const celda of tanda) {
        errores[celda.geometryRef] = `proveedor_throw: ${mensaje}`
      }
      diagnostico = { puntos: [], erroresPorCelda: errores }
    }

    Object.assign(erroresPorCelda, diagnostico.erroresPorCelda)
    filasInsertadas += await persistirPuntos(db, diagnostico.puntos, ahoraIso)
    celdasConsultadas += tanda.length
    llamadasRealizadas += 1

    // La última tanda ya no tiene trabajo posterior que proteger: no renovamos
    // después de ella.
    if (indice + TAMANO_TANDA_CELDAS >= totalCeldas) continue

    // Fencing: renovamos SÓLO si seguimos siendo el owner. Si devuelve `false`,
    // otro proceso recuperó el lease: cortamos el loop sin consultar ni
    // escribir más. No publicamos resultado porque `publicarResultado` también
    // fallaría el fencing y el nuevo owner es quien manda.
    const renovado = await renovar({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      duracionLeaseMs: DURACION_LEASE_MS,
    })
    if (!renovado) {
      leasePerdido = true
      break
    }
  }

  const resultado: ResultadoSyncEnsemble = {
    celdasConsultadas,
    filasInsertadas,
    llamadasRealizadas,
  }

  if (leasePerdido) {
    return { ok: false, motivo: 'lease_perdido_durante_ejecucion', resultado }
  }

  await actualizarSalud(db, erroresPorCelda, ahoraIso)

  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: 'completado',
    contadores: { llamadas: resultado.llamadasRealizadas, filas: filasInsertadas },
    ahora,
  })

  return { ok: true, resultado }
}
