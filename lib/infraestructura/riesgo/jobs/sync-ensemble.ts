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
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import {
  hazardClimatology,
  hazardEnsembleProb,
  infraGeoProfile,
} from '@/lib/db/schema'
import { TAMANO_LOTE_COORDENADAS_ENSEMBLE } from '../providers/ensemble'
import type { obtenerProbabilidadesEnsemble as obtenerProbabilidadesEnsembleReal } from '../providers/ensemble'
import { apiKeyDesdeEntorno, crearControladorCupo } from '../providers/cupo-om'
import {
  adquirirLease,
  claveIdempotenteDeBloque6h,
  inicioDeBloqueUtc,
  publicarResultado,
  renovarLease as renovarLeaseReal,
} from '../job-run'
import { crearAdaptadorEnsemble } from '../adaptadores-ingesta/ensemble'
import { elegirUmbralesClimatologia } from '../peligro/fuente-climatologia'
import { actualizarSaludFuente, resumirErrores } from './salud-fuente'
import { insertarPorChunks } from './chunks'
import type { PuertoPronosticoEnsemble, PuntoEnsembleProbabilistico } from '../adaptadores-ingesta/puertos'

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

// Mismo bug de clase que sync-pronostico-caudal.ts (ver su comentario junto a
// `TAMANO_CHUNK_INSERCION`): un único `insert(...).values(hugeArray)` hace que
// drizzle-orm arme el INSERT recorriendo recursivamente cada fila y puede
// reventar el stack con "RangeError: Maximum call stack size exceeded" antes
// de que SQLite valide el bind count. hazardEnsembleProb tiene 12 columnas;
// 500 filas = 6.000 binds, muy por debajo del límite de SQLite y de la
// profundidad de recursión que dispara el RangeError.
const TAMANO_CHUNK_INSERCION = 500

const PROVIDER = 'open-meteo-ensemble'
const VARIABLE_ENSEMBLE = 'precipitacion_24h'
const VERSION_ENSEMBLE = 'ensemble-v0.1'
// La Capa 1 usa siempre el acumulado de 24 h; los horizontes de 24 h y 72 h
// se derivan de qué ventana de 24 h cae dentro de cada horizonte desde
// `corridaEn`. Antes el job pasaba `acumuladoHoras: 24` directo al provider;
// ahora ese fijo vive en el adaptador (`ACUMULADO_HORAS` en
// adaptadores-ingesta/ensemble.ts), el puerto normalizado no lo recibe como
// parámetro.

const VARIABLE_CLIMATOLOGIA = 'precipitacion_diaria'
// Denominador fijado por N1 para el acumulado de 24 h: TODOS los días, no
// sólo los húmedos.
const MUESTRA_CLIMATOLOGIA = 'todos_los_dias'
// Percentiles que se leen de climatología: p90 sólo define la completitud IMERG.
const PERCENTILES_UMBRAL = ['p90', 'p95', 'p99'] as const

// Tamaño de tanda del job. Alineado con el lote interno de coordenadas del
// provider (`TAMANO_LOTE_COORDENADAS_ENSEMBLE`): cada invocación al provider
// corresponde a una request HTTP, y entre tanda y tanda se renueva el lease
// (mismo concepto que sync-pronostico-caudal.ts, que renueva cada 25 celdas
// procesadas). No es un límite de red propio del job: el provider ya agrupa
// las coordenadas por request; acá la tanda marca cuándo renovar.
const TAMANO_TANDA_CELDAS = TAMANO_LOTE_COORDENADAS_ENSEMBLE

type Db = ReturnType<typeof getDb>

// Reconstruye la coordenada del centro de la celda desde `geometryRef`. El
// formato es `"${lat}_${lon}"` con un decimal cada uno (ver `celdaDeCoordenada`
// en ../celda.ts), así que esto recupera la lat/lon exacta que el provider
// necesita sin volver a leer la coordenada cruda de cada escuela.
function coordenadaDeCelda(geometryRef: string): { lat: number; lon: number } {
  const [lat, lon] = geometryRef.split('_').map(Number)
  return { lat, lon }
}

// Umbrales de climatología por celda, con la misma regla que nivel.ts: la
// climatología IMERG se usa cuando está completa para la celda (p90, p95 y p99);
// si no, se usan las filas de ERA5 u otras versiones. Nunca se mezclan fuentes.
// Las filas llegan ordenadas por periodoHasta, version y calculadoEn descendente
// para que `elegirUmbralesClimatologia` tome la más reciente por percentil.
async function cargarUmbralesPorCelda(
  db: Db,
): Promise<{ p95: Map<string, number>; p99: Map<string, number> }> {
  const filas = await db
    .select({
      geometryRef: hazardClimatology.geometryRef,
      percentil: hazardClimatology.percentil,
      valor: hazardClimatology.valor,
      version: hazardClimatology.version,
    })
    .from(hazardClimatology)
    .where(
      and(
        eq(hazardClimatology.variable, VARIABLE_CLIMATOLOGIA),
        eq(hazardClimatology.muestra, MUESTRA_CLIMATOLOGIA),
        inArray(hazardClimatology.percentil, [...PERCENTILES_UMBRAL]),
      ),
    )
    .orderBy(
      desc(hazardClimatology.periodoHasta),
      desc(hazardClimatology.version),
      desc(hazardClimatology.calculadoEn),
    )

  const filasPorCelda = new Map<string, { percentil: string; valor: number; version: string }[]>()
  for (const fila of filas) {
    const grupo = filasPorCelda.get(fila.geometryRef) ?? []
    grupo.push({ percentil: fila.percentil, valor: fila.valor, version: fila.version })
    filasPorCelda.set(fila.geometryRef, grupo)
  }

  const p95 = new Map<string, number>()
  const p99 = new Map<string, number>()
  for (const [geometryRef, filasCelda] of filasPorCelda) {
    const umbrales = elegirUmbralesClimatologia(filasCelda)
    if (umbrales === null) continue
    p95.set(geometryRef, umbrales.p95)
    p99.set(geometryRef, umbrales.p99)
  }
  return { p95, p99 }
}

// `hazard_ensemble_prob.probabilidad_p95/p99/dispersion` son NOT NULL (ver
// schema.ts): coincide con que el adaptador PRESERVA hoy el `0` literal del
// provider cuando `miembrosValidos === 0` (documentado como PENDIENTE en
// adaptadores-ingesta/ensemble.ts; el `null` que tipa el puerto es aspiracional
// para cuando se resuelva esa discrepancia semántica, algo fuera de alcance de
// este cableado — ver registro.md). Este guard hace explícita esa tensión de
// tipos en vez de esconder un futuro `null` real detrás de un `?? 0` silencioso.
function valorPresente(valor: number | null, campo: string): number {
  if (valor === null) {
    throw new Error(
      `persistirPuntos: ${campo} llegó null; hazard_ensemble_prob.${campo} es NOT NULL y el adaptador de ensemble hoy no debería emitir null (ver PENDIENTE en adaptadores-ingesta/ensemble.ts)`,
    )
  }
  return valor
}

async function persistirPuntos(
  db: Db,
  puntos: PuntoEnsembleProbabilistico[],
  ingeridoEn: string,
): Promise<number> {
  if (puntos.length === 0) return 0

  // Traducción de FORMA únicamente (nombres del puerto -> columnas de
  // `hazard_ensemble_prob`): `validoHasta` es el mismo instante que antes
  // exponía `validoEn` (ver adaptadores-ingesta/ensemble.ts), y
  // `probabilidadSuperaP95/P99`/`dispersionMm` preservan el valor crudo del
  // provider (incluido el `0` literal cuando `miembrosValidos === 0`; ver
  // PENDIENTE documentado en el adaptador). Ningún valor cambia acá.
  const filas = puntos.map((punto) => ({
    id: randomUUID(),
    geometryRef: punto.geometryRef,
    variable: VARIABLE_ENSEMBLE,
    corridaEn: punto.corridaEn,
    validoEn: punto.validoHasta,
    horizonteHoras: punto.horizonteHoras,
    miembrosTotal: punto.miembrosTotal,
    miembrosValidos: punto.miembrosValidos,
    probabilidadP95: valorPresente(punto.probabilidadSuperaP95, 'probabilidadP95'),
    probabilidadP99: valorPresente(punto.probabilidadSuperaP99, 'probabilidadP99'),
    dispersion: valorPresente(punto.dispersionMm, 'dispersion'),
    version: VERSION_ENSEMBLE,
    ingeridoEn,
  }))

  // Ver comentario de `TAMANO_CHUNK_INSERCION`: nunca un solo `.values()` con
  // todas las filas, siempre en chunks dentro de una transacción.
  // Toda la transacción se reintenta ante SQLITE_BUSY: si falla, se revierte
  // completa y es seguro volver a correrla.
  await conReintentoPorBloqueo(() =>
    db.transaction(async (tx) => {
      await insertarPorChunks(filas, TAMANO_CHUNK_INSERCION, (chunk) =>
        tx
          .insert(hazardEnsembleProb)
          .values(chunk)
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
          }),
      )
    }),
  )

  return filas.length
}

async function actualizarSalud(
  db: Db,
  erroresPorCelda: Record<string, string>,
  ahoraIso: string,
): Promise<void> {
  // Upsert único: mismo motivo de reintento que persistirPuntos.
  await actualizarSaludFuente(db, {
    provider: PROVIDER,
    ttlMinutos: TTL_MINUTOS,
    licencia: LICENCIA,
    ...resumirErrores(erroresPorCelda, LARGO_MAX_ERROR),
    ahoraIso,
  })
}

export async function ejecutarSyncEnsemble(params?: {
  ahora?: Date
  // Seam de test: permite inyectar el provider sin red, mismo patrón que
  // `ecmwfProvider`/`floodProvider` en sync-pronostico-caudal.ts. Se reenvía
  // tal cual a `crearAdaptadorEnsemble` cuando no se inyecta `puerto`
  // directamente.
  obtenerProbabilidades?: typeof obtenerProbabilidadesEnsembleReal
  // Seam de test: inyecta el PUERTO completo (sin red), saltea la
  // construcción del adaptador real. Demuestra la inyección por puerto (ver
  // sync-ensemble.test.ts).
  puerto?: PuertoPronosticoEnsemble
  // Seam de test: permite inyectar un `renovarLease` fake sin mockear todo el
  // módulo job-run (que además aporta adquirirLease/publicarResultado).
  renovarLease?: typeof renovarLeaseReal
}): Promise<ResultadoEjecucionSyncEnsemble> {
  const db = getDb()
  const ahora = params?.ahora ?? new Date()
  const ahoraIso = ahora.toISOString()

  const claveIdempotente = claveIdempotenteDeBloque6h(ahora)
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

  // Corrección de bug real (mismo hallazgo que sync-pronostico-caudal.ts): sin
  // este try/catch, cualquier excepción posterior a adquirir el lease (el
  // RangeError de `persistirPuntos` con volumen real, o cualquier otra)
  // escapa sin publicar resultado y `infra_job_run` queda 'en_progreso' hasta
  // que el lease venza solo. Se envuelve todo el cuerpo para que un fallo
  // siempre marque 'fallido' antes de relanzar la excepción original.
  try {
    return await ejecutarCuerpoDelJobEnsemble({ db, ahora, ahoraIso, lease, params })
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al ejecutar sync-hazard-ensemble',
      ahora,
    })
    throw error
  }
}

async function ejecutarCuerpoDelJobEnsemble(ctx: {
  db: Db
  ahora: Date
  ahoraIso: string
  lease: { adquirido: true; jobRunId: string; leaseOwner: string }
  params?: {
    ahora?: Date
    obtenerProbabilidades?: typeof obtenerProbabilidadesEnsembleReal
    puerto?: PuertoPronosticoEnsemble
    renovarLease?: typeof renovarLeaseReal
  }
}): Promise<ResultadoEjecucionSyncEnsemble> {
  const { db, ahora, ahoraIso, lease, params } = ctx

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

  const renovar = params?.renovarLease ?? renovarLeaseReal
  const apiKey = apiKeyDesdeEntorno()
  // Puerto normalizado (ABS1, segunda parte): por defecto el adaptador real,
  // que envuelve `obtenerProbabilidadesEnsemble` sin cambiar ningún valor. El
  // guard de cupo OM (`crearControladorCupo`) se mantiene igual que antes,
  // sólo que ahora vive detrás del puerto en vez de pasarse directo por
  // llamada; se construye una sola vez porque `apiKey`/`db` no cambian entre
  // tandas.
  const puerto: PuertoPronosticoEnsemble =
    params?.puerto ??
    crearAdaptadorEnsemble({
      apiKey,
      controladorCupoFactory: (peso) =>
        crearControladorCupo({ host: 'ensemble-api', peso, apiKeyPresente: Boolean(apiKey), db }),
      obtenerProbabilidades: params?.obtenerProbabilidades,
    })

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

    let diagnostico: {
      puntos: PuntoEnsembleProbabilistico[]
      erroresPorCelda: Record<string, string>
      llamadasRealizadas: number
    }
    try {
      const resultadoPuerto = await puerto.obtenerProbabilidades({
        geometryRefs: tanda.map((celda) => celda.geometryRef),
        asOf: corridaEn,
        umbralesP95Mm: umbralP95PorCelda,
        umbralesP99Mm: umbralP99PorCelda,
      })
      diagnostico = {
        puntos: resultadoPuerto.puntos,
        erroresPorCelda: resultadoPuerto.sinDato,
        llamadasRealizadas: resultadoPuerto.llamadasRealizadas,
      }
    } catch (error) {
      // Un provider que lanza (no sólo que reporta errores por celda) no debe
      // tumbar el job: se traduce a error en todas sus celdas y se sigue.
      const mensaje = error instanceof Error ? error.message : String(error)
      const errores: Record<string, string> = {}
      for (const celda of tanda) {
        errores[celda.geometryRef] = `proveedor_throw: ${mensaje}`
      }
      diagnostico = { puntos: [], erroresPorCelda: errores, llamadasRealizadas: 0 }
    }

    Object.assign(erroresPorCelda, diagnostico.erroresPorCelda)
    filasInsertadas += await persistirPuntos(db, diagnostico.puntos, ahoraIso)
    celdasConsultadas += tanda.length
    // El puerto siempre expone el conteo real de llamadas (ver
    // adaptadores-ingesta/ensemble.ts); ya no hace falta el fallback a 1 por
    // tanda que usaba el import directo del provider.
    llamadasRealizadas += diagnostico.llamadasRealizadas

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
