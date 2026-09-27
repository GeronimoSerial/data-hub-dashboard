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
import { randomUUID } from 'node:crypto'
import { eq, isNotNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hazardClimatology, infraGeoProfile } from '@/lib/db/schema'
import { adquirirLease, publicarResultado } from '../job-run'
import {
  calcularPercentilesPrecipitacion,
  obtenerSerieHistorica,
} from '../providers/climatologia'

export type ResultadoCalcularClimatologia = {
  celdasProcesadas: number
  filasInsertadas: number
  celdasConError: string[]
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
  obtenerSerie?: typeof obtenerSerieHistorica
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
  const obtenerSerie = params?.obtenerSerie ?? obtenerSerieHistorica

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
      obtenerSerie,
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
  obtenerSerie: typeof obtenerSerieHistorica
  lease: { adquirido: true; jobRunId: string; leaseOwner: string }
}): Promise<
  | { ok: true; resultado: ResultadoCalcularClimatologia }
  | { ok: false; motivo: 'lease_no_disponible' }
> {
  const { db, ahora, ahoraIso, periodoDesde, periodoHasta, version, obtenerSerie, lease } = ctx

  // selectDistinct ya entrega las celdas deduplicadas; el filtro de nulos
  // reafirma el tipo para el resto del bucle.
  const filasGeo = await db
    .selectDistinct({ geometryRef: infraGeoProfile.geometryRef })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))
  const celdas = filasGeo
    .map((fila) => fila.geometryRef)
    .filter((ref): ref is string => ref !== null)

  const celdasConError: string[] = []
  let celdasProcesadas = 0
  let filasInsertadas = 0

  for (const celda of celdas) {
    // Todos los perfiles de una misma celda comparten la coordenada
    // redondeada; alcanza con el primero para obtener lat/lon.
    const [perfil] = await db
      .select()
      .from(infraGeoProfile)
      .where(eq(infraGeoProfile.geometryRef, celda))
      .limit(1)

    if (!perfil || perfil.lat === null || perfil.lon === null) {
      celdasConError.push(celda)
      continue
    }

    const serie = await obtenerSerie({
      lat: perfil.lat,
      lon: perfil.lon,
      periodoDesde,
      periodoHasta,
    })

    if (!serie.ok) {
      celdasConError.push(celda)
      continue
    }

    const filas = calcularPercentilesPrecipitacion({
      geometryRef: celda,
      valoresDiarios: serie.valoresDiarios,
      periodoDesde,
      periodoHasta,
    })

    for (const fila of filas) {
      await db
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
        })
    }

    celdasProcesadas += 1
    filasInsertadas += filas.length
  }

  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: 'completado',
    contadores: { celdas: celdasProcesadas, filas: filasInsertadas },
    ahora,
  })

  return {
    ok: true,
    resultado: { celdasProcesadas, filasInsertadas, celdasConError },
  }
}
