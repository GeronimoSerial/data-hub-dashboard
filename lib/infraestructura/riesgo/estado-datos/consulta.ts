// Read model del panel "Estado de los datos": reusa obtenerEstadoOperativo()
// (jobs + cobertura de climatología, ver salud.ts) y suma una consulta
// agregada por tabla, sin consultas por fila. Sólo lectura.
import { and, asc, eq, gte, lte, max, min, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  hazardObservation,
  hazardSourceHealth,
  hidroLectura,
  infraDataset,
  infraDatasetPublicacion,
  infraRiskRun,
} from '@/lib/db/schema'
import { obtenerEstacionesPrefectura } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { obtenerReferencias, type FilaReferencia } from '@/lib/infraestructura/hidrometria/referencia-repo'
import { JOBS_ESPERADOS } from '../jobs-esperados'
import { PROVIDER_OBSERVADO, VARIABLE_OBSERVADA } from '../peligro/observado'
import { obtenerEstadoOperativo } from '../salud'
import {
  armarEstadoDatos,
  inicioDiaImerg,
  clasificarClimatologia,
  clasificarDatasets,
  clasificarFuente,
  clasificarHuecosImerg,
  clasificarImerg,
  clasificarJob,
  clasificarPlausibilidad,
  clasificarPrefectura,
  clasificarRunVigente,
  clasificarSondaCadena,
  LECTURAS_IDENTICAS_SENSOR_TRABADO,
  type EstadoDatos,
} from './clasificar'

// Ventana de la referencia estadística de Prefectura (sync-prefectura-historico, 365 días).
const VENTANA_REFERENCIA_DIAS = 365

export async function obtenerEstadoDatos(): Promise<EstadoDatos> {
  const db = getDb()
  const [operativo, fuentes, imerg, lecturas, runVigente, publicaciones, recientes, referencias] = await Promise.all([
    obtenerEstadoOperativo(),
    db.select().from(hazardSourceHealth),
    db
      .select({ desde: min(hazardObservation.observadoEn), hasta: max(hazardObservation.observadoEn) })
      .from(hazardObservation)
      .where(and(eq(hazardObservation.provider, PROVIDER_OBSERVADO), eq(hazardObservation.variable, VARIABLE_OBSERVADA))),
    db
      .select({ estacionId: hidroLectura.estacionId, medidaEn: max(hidroLectura.medidaEn) })
      .from(hidroLectura)
      .groupBy(hidroLectura.estacionId),
    db.select({ publicadoEn: infraRiskRun.publicadoEn }).from(infraRiskRun).where(eq(infraRiskRun.estado, 'vigente')),
    db
      .select({
        datasetId: infraDatasetPublicacion.datasetId,
        nombre: infraDataset.nombre,
        publicadaEn: infraDatasetPublicacion.publicadaEn,
      })
      .from(infraDatasetPublicacion)
      .innerJoin(infraDataset, eq(infraDataset.id, infraDatasetPublicacion.datasetId)),
    consultarUltimasLecturas(db),
    obtenerReferencias(db, VENTANA_REFERENCIA_DIAS),
  ])
  const ahora = new Date(operativo.generadoEn)
  const ultimaPorTipo = new Map(operativo.jobs.map((job) => [job.tipo, job]))

  const ultimaPorEstacion = new Map<string, string>()
  for (const fila of lecturas) if (fila.medidaEn !== null) ultimaPorEstacion.set(fila.estacionId, fila.medidaEn)
  const datoMasRecienteImerg = imerg[0]?.hasta ?? null
  const granulosDeHoy = await consultarGranulosImergDelDia(db, ahora)
  const huecosImerg = clasificarHuecosImerg({ observadosEn: granulosDeHoy, ahora })

  const sonda = clasificarSondaCadena({ ultima: ultimaPorTipo.get('sonda-cadena-datos'), ahora })
  const items = [
    // Los jobs sin `tipo` no escriben infra_job_run: no hay forma de verificarlos acá.
    ...JOBS_ESPERADOS.filter((job) => job.tipo !== null).map((job) =>
      clasificarJob({
        job,
        ultima: ultimaPorTipo.get(job.tipo as string),
        enosJobsEnabled: operativo.flags.enosJobsEnabled,
        ahora,
      }),
    ),
    clasificarRunVigente({ publicadoEn: runVigente[0]?.publicadoEn ?? null, ahora }),
    clasificarPrefectura({
      estaciones: obtenerEstacionesPrefectura().map((e) => ({ estacionId: e.estacionId, nombre: e.nombrePna })),
      ultimaPorEstacion,
      ahora,
    }),
    clasificarPlausibilidad({
      estaciones: obtenerEstacionesPrefectura().map((e) => ({ estacionId: e.estacionId, nombre: e.nombrePna })),
      lecturasRecientes: lecturasRecientesPorEstacion(recientes),
      referencias: rangosDeReferencia(referencias),
    }),
    // Sólo verificada o fallida: nunca corrió, atrasada o pausada ya las informa el item
    // `job:sonda-cadena-datos`; repetirlas acá contaría el mismo problema dos veces.
    ...(['ok', 'fallido'].includes(sonda.estado) ? [sonda] : []),
    clasificarImerg({ desde: imerg[0]?.desde ?? null, hasta: datoMasRecienteImerg, ahora }),
    ...(huecosImerg ? [huecosImerg] : []),
    clasificarClimatologia(operativo.climatologiaPrecipitacion),
    ...fuentes.map((fuente) => clasificarFuente({ ...fuente, datoMasRecienteImerg, ahora })),
    ...clasificarDatasets(
      publicaciones.map((p) => ({ datasetId: p.datasetId, nombre: p.nombre, publicadaEn: new Date(p.publicadaEn).toISOString() })),
      ahora,
    ),
  ]
  return armarEstadoDatos({ items, ahora })
}

// Para el Centro de Situación: si la lectura falla, la página sigue andando y el
// panel muestra que no se pudo leer el estado (null), nunca un falso "todo ok".
export async function obtenerEstadoDatosSeguro(): Promise<EstadoDatos | null> {
  try {
    return await obtenerEstadoDatos()
  } catch (error) {
    console.error('[estado-datos] no se pudo leer el estado de los datos', error)
    return null
  }
}

// I5 (huecos): instantes de los gránulos IMERG del día (Buenos Aires), una sola consulta.
async function consultarGranulosImergDelDia(db: ReturnType<typeof getDb>, ahora: Date): Promise<string[]> {
  const filas = await db
    .selectDistinct({ observadoEn: hazardObservation.observadoEn })
    .from(hazardObservation)
    .where(
      and(
        eq(hazardObservation.provider, PROVIDER_OBSERVADO),
        eq(hazardObservation.variable, VARIABLE_OBSERVADA),
        gte(hazardObservation.observadoEn, inicioDiaImerg(ahora).toISOString()),
      ),
    )
  return filas.map((fila) => fila.observadoEn)
}

// I4 (plausibilidad): las N lecturas más recientes por estación en una sola consulta
// con row_number(), sin consulta por fila. Alcanzan para detectar un sensor trabado.
async function consultarUltimasLecturas(db: ReturnType<typeof getDb>) {
  const ordenadas = db
    .select({
      estacionId: hidroLectura.estacionId,
      lecturaM: hidroLectura.lecturaM,
      posicion: sql<number>`row_number() over (partition by ${hidroLectura.estacionId} order by ${hidroLectura.medidaEn} desc)`.as(
        'posicion',
      ),
    })
    .from(hidroLectura)
    .as('lecturas_ordenadas')
  return db
    .select({ estacionId: ordenadas.estacionId, lecturaM: ordenadas.lecturaM })
    .from(ordenadas)
    .where(lte(ordenadas.posicion, LECTURAS_IDENTICAS_SENSOR_TRABADO))
    .orderBy(asc(ordenadas.estacionId), asc(ordenadas.posicion))
}

// Agrupa por estación; cada lista va con la lectura más reciente primero.
function lecturasRecientesPorEstacion(
  filas: ReadonlyArray<{ estacionId: string; lecturaM: number | null }>,
): Map<string, Array<number | null>> {
  const porEstacion = new Map<string, Array<number | null>>()
  for (const fila of filas) {
    const lista = porEstacion.get(fila.estacionId) ?? []
    lista.push(fila.lecturaM)
    porEstacion.set(fila.estacionId, lista)
  }
  return porEstacion
}

// min_m/max_m NULL (referencia sin rango todavía) se mantienen NULL: no hay aviso atípico.
function rangosDeReferencia(
  referencias: ReadonlyMap<string, FilaReferencia>,
): Map<string, { minM: number | null; maxM: number | null }> {
  return new Map(
    [...referencias].map(([estacionId, fila]) => [
      estacionId,
      { minM: fila.minM ?? null, maxM: fila.maxM ?? null },
    ]),
  )
}
