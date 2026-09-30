// Job de cálculo de climatología de precipitación (E2): recorre las celdas con
// perfil geográfico válido, pide a Open-Meteo/ERA5 la serie histórica diaria de
// cada una y persiste los percentiles p90/p95/p99 calculados en
// `hazard_climatology`. No es un sync periódico de 6h: es un cálculo offline y
// bajo demanda sobre una ventana histórica fija.
//
// Idempotencia en dos capas:
// 1. `infra_job_run` (ver job-run.ts): la claveIdempotente combina
//    período+versión, así recalcular el MISMO período y versión es una sola
//    corrida, mientras que cambiar la versión permite recalcular sin pisar la
//    anterior.
// 2. `hazard_climatology_uidx`
//    (geometryRef+variable+percentil+muestra+periodoDesde+periodoHasta+version):
//    si se vuelven a calcular las mismas filas, el upsert actualiza
//    valor/unidad/calculadoEn en vez de duplicar.
//
// Una celda caída NO tumba el job: se agrega a `celdasConError` y se sigue con
// la próxima; el estado general queda completado.
//
// CURSOR RESUMABLE (OM-cupo, ver docs/ejecucion-enos/OM-cupo/registro.md,
// sección "Climatología de precipitación"): este job es MUY costoso en cupo
// (30 años de historia × ~387 celdas), suficiente para agotar el cupo
// MENSUAL en una sola corrida. En vez de mantener un cursor separado, se
// reusa `hazard_climatology` como fuente de verdad de "qué celdas ya están
// calculadas" para este período+version exacto (misma clave que el upsert de
// abajo): antes de gastar cupo, se excluyen las celdas que YA tienen al
// menos una fila persistida. Si la corrida se corta por `cupo_agotado`
// (ventana larga: hora/día/mes) o `host_en_cooldown`, las celdas que no
// llegaron a procesarse simplemente no quedan en `hazard_climatology`, así
// que la PRÓXIMA corrida (mismo período+version) las detecta como
// pendientes y retoma sin recomputar ni volver a gastar cupo en lo ya hecho.
import { randomUUID } from 'node:crypto'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { hazardClimatology, infraGeoProfile } from '@/lib/db/schema'
import { adquirirLease, publicarResultado } from '../job-run'
import {
  calcularPercentilesPrecipitacion,
  obtenerSeriesHistoricas,
  type PuntoClimatologia,
} from '../providers/climatologia'
import { apiKeyDesdeEntorno, crearControladorCupo, MOTIVOS_CUPO_SIN_RED } from '../providers/cupo-om'

export type ResultadoCalcularClimatologia = {
  celdasProcesadas: number
  filasInsertadas: number
  celdasConError: string[]
  /**
   * `true` si la corrida se detuvo porque el cupo OM-cupo se agotó en una
   * ventana larga (o el bucket entró en cooldown) antes de terminar todas
   * las celdas pendientes — no una falla real de datos. El `infra_job_run`
   * de esta corrida queda marcado 'fallido' (no 'completado') a propósito
   * para que `adquirirLease` permita re-invocar el MISMO período+version en
   * la próxima corrida (ver "CURSOR RESUMABLE" en la cabecera del archivo);
   * si quedara 'completado', el lease bloquearía el reintento para siempre.
   */
  cortadoPorCupo: boolean
}

const TIPO_JOB = 'calculo-climatologia'
const DURACION_LEASE_MS = 10 * 60 * 1000
const PERIODO_DESDE_DEFAULT = '1991-01-01'
const PERIODO_HASTA_DEFAULT = '2020-12-31'
const VERSION_DEFAULT = 'climatologia-v1'

export async function ejecutarCalculoClimatologia(params?: {
  ahora?: Date
  periodoDesde?: string
  periodoHasta?: string
  version?: string
  obtenerSeries?: typeof obtenerSeriesHistoricas
}): Promise<
  | { ok: true; resultado: ResultadoCalcularClimatologia }
  | { ok: false; motivo: 'lease_no_disponible' }
> {
  const db = getDb()
  const ahora = params?.ahora ?? new Date()
  const ahoraIso = ahora.toISOString()
  const periodoDesde = params?.periodoDesde ?? PERIODO_DESDE_DEFAULT
  const periodoHasta = params?.periodoHasta ?? PERIODO_HASTA_DEFAULT
  const version = params?.version ?? VERSION_DEFAULT
  const obtenerSeries = params?.obtenerSeries ?? obtenerSeriesHistoricas

  const claveIdempotente = `${periodoDesde}_${periodoHasta}_${version}`
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente,
    version,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) {
    return { ok: false, motivo: 'lease_no_disponible' }
  }

  // Corrección de bug real (mismo hallazgo que sync-pronostico-caudal.ts): sin
  // este try/catch, cualquier excepción posterior a adquirir el lease escapa
  // sin publicar resultado y `infra_job_run` queda 'en_progreso' hasta que el
  // lease venza solo. Se envuelve todo el cuerpo para que un fallo siempre
  // marque 'fallido' antes de relanzar la excepción original.
  try {
    return await ejecutarCuerpoDelJobClimatologia({
      db,
      ahora,
      ahoraIso,
      periodoDesde,
      periodoHasta,
      version,
      obtenerSeries,
      lease,
    })
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al ejecutar calculo-climatologia',
      ahora,
    })
    throw error
  }
}

async function ejecutarCuerpoDelJobClimatologia(ctx: {
  db: ReturnType<typeof getDb>
  ahora: Date
  ahoraIso: string
  periodoDesde: string
  periodoHasta: string
  version: string
  obtenerSeries: typeof obtenerSeriesHistoricas
  lease: { adquirido: true; jobRunId: string; leaseOwner: string }
}): Promise<
  | { ok: true; resultado: ResultadoCalcularClimatologia }
  | { ok: false; motivo: 'lease_no_disponible' }
> {
  const { db, ahora, ahoraIso, periodoDesde, periodoHasta, version, obtenerSeries, lease } = ctx

  // selectDistinct ya entrega las celdas deduplicadas; el filtro de nulos
  // reafirma el tipo para el resto del bucle.
  const filasGeo = await db
    .selectDistinct({ geometryRef: infraGeoProfile.geometryRef })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))
  const celdas = filasGeo
    .map((fila) => fila.geometryRef)
    .filter((ref): ref is string => ref !== null)

  // Cursor resumable (ver comentario de cabecera): celdas que YA tienen al
  // menos una fila persistida para este período+version exacto no vuelven a
  // gastar cupo. Cubre tanto una corrida previa completa como una cortada a
  // mitad de camino por `cupo_agotado`/`host_en_cooldown`.
  const filasYaCalculadas = await db
    .selectDistinct({ geometryRef: hazardClimatology.geometryRef })
    .from(hazardClimatology)
    .where(
      and(
        eq(hazardClimatology.version, version),
        eq(hazardClimatology.periodoDesde, periodoDesde),
        eq(hazardClimatology.periodoHasta, periodoHasta),
      ),
    )
  const celdasYaCalculadas = new Set(filasYaCalculadas.map((fila) => fila.geometryRef))
  const celdasPendientes = celdas.filter((celda) => !celdasYaCalculadas.has(celda))

  const celdasConError: string[] = []
  let celdasProcesadas = celdasYaCalculadas.size
  let filasInsertadas = 0
  let cortadoPorCupo = false
  const apiKey = apiKeyDesdeEntorno()

  // lat/lon por celda pendiente (una query por celda, sin costo de cupo: es
  // lectura local de infra_geo_profile, no una llamada a Open-Meteo). Todos
  // los perfiles de una misma celda comparten la coordenada redondeada;
  // alcanza con el primero.
  const puntos: PuntoClimatologia[] = []
  for (const celda of celdasPendientes) {
    const [perfil] = await db
      .select()
      .from(infraGeoProfile)
      .where(eq(infraGeoProfile.geometryRef, celda))
      .limit(1)

    if (!perfil || perfil.lat === null || perfil.lon === null) {
      celdasConError.push(celda)
      continue
    }
    puntos.push({ geometryRef: celda, lat: perfil.lat, lon: perfil.lon })
  }

  // Una sola pasada de red para TODAS las celdas pendientes: la
  // deduplicación por celda ERA5 y el batching de 50 coordenadas viven
  // adentro de `obtenerSeriesHistoricas` (ver providers/climatologia.ts). Si
  // el cupo se agota en una ventana larga a mitad de las celdas pendientes,
  // el provider ya marca las restantes con el mismo motivo en
  // `erroresPorCelda` y corta su propio loop de lotes: no quedan escritas en
  // `hazard_climatology`, así que el cursor resumable las retoma la próxima
  // corrida.
  if (puntos.length > 0) {
    const resultado = await obtenerSeries({
      puntos,
      periodoDesde,
      periodoHasta,
      apiKey,
      controladorCupoFactory: (peso) =>
        crearControladorCupo({ host: 'archive-api', peso, apiKeyPresente: Boolean(apiKey), db }),
    })

    for (const punto of puntos) {
      const serieDiaria = resultado.seriesPorCelda[punto.geometryRef]
      const fallo = resultado.erroresPorCelda[punto.geometryRef]
      if (fallo || serieDiaria === undefined) {
        celdasConError.push(punto.geometryRef)
        if (fallo && MOTIVOS_CUPO_SIN_RED.has(fallo.motivo)) cortadoPorCupo = true
        continue
      }

      const filas = calcularPercentilesPrecipitacion({
        geometryRef: punto.geometryRef,
        valoresDiarios: serieDiaria,
        periodoDesde,
        periodoHasta,
      })

      for (const fila of filas) {
        // Upsert único por fila: seguro de reintentar ante SQLITE_BUSY (job, no
        // request path). El id generado en cada intento puede variar, pero no
        // es la clave del conflicto (lo es geometryRef+variable+percentil+
        // muestra+periodo+version), así que no afecta el resultado del upsert.
        await conReintentoPorBloqueo(() =>
          db
            .insert(hazardClimatology)
            .values({
              id: randomUUID(),
              geometryRef: fila.geometryRef,
              variable: fila.variable,
              percentil: fila.percentil,
              muestra: fila.muestra,
              valor: fila.valor,
              unidad: fila.unidad,
              periodoDesde: fila.periodoDesde,
              periodoHasta: fila.periodoHasta,
              version,
              calculadoEn: ahoraIso,
            })
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
              },
            }),
        )
      }

      celdasProcesadas += 1
      filasInsertadas += filas.length
    }
  }

  // Ver `cortadoPorCupo` en el tipo de retorno: si el cupo cortó el batch
  // antes de terminar, el job-run queda 'fallido' A PROPÓSITO (no
  // 'completado') para que `adquirirLease` permita retomar el MISMO
  // período+version en la próxima corrida en vez de bloquearlo para
  // siempre.
  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: cortadoPorCupo ? 'fallido' : 'completado',
    contadores: { celdas: celdasProcesadas, filas: filasInsertadas },
    errorSaneado: cortadoPorCupo
      ? `cupo OM-cupo agotado: ${celdasConError.length} celda(s) pendientes, se retoman en la próxima corrida`
      : undefined,
    ahora,
  })

  return {
    ok: true,
    resultado: { celdasProcesadas, filasInsertadas, celdasConError, cortadoPorCupo },
  }
}
