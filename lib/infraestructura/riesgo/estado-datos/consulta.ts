// Read model del panel "Estado de los datos": reusa obtenerEstadoOperativo()
// (jobs + cobertura de climatología, ver salud.ts) y suma una consulta
// agregada por tabla, sin consultas por fila. Sólo lectura.
import { and, eq, max, min } from 'drizzle-orm'
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
import { JOBS_ESPERADOS } from '../jobs-esperados'
import { PROVIDER_OBSERVADO, VARIABLE_OBSERVADA } from '../peligro/observado'
import { obtenerEstadoOperativo } from '../salud'
import {
  armarEstadoDatos,
  clasificarClimatologia,
  clasificarDatasets,
  clasificarFuente,
  clasificarImerg,
  clasificarJob,
  clasificarPrefectura,
  clasificarRunVigente,
  type EstadoDatos,
} from './clasificar'

export async function obtenerEstadoDatos(): Promise<EstadoDatos> {
  const db = getDb()
  const [operativo, fuentes, imerg, lecturas, runVigente, publicaciones] = await Promise.all([
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
  ])
  const ahora = new Date(operativo.generadoEn)
  const ultimaPorTipo = new Map(operativo.jobs.map((job) => [job.tipo, job]))

  const ultimaPorEstacion = new Map<string, string>()
  for (const fila of lecturas) if (fila.medidaEn !== null) ultimaPorEstacion.set(fila.estacionId, fila.medidaEn)
  const datoMasRecienteImerg = imerg[0]?.hasta ?? null

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
    clasificarImerg({ desde: imerg[0]?.desde ?? null, hasta: datoMasRecienteImerg, ahora }),
    clasificarClimatologia(operativo.climatologiaPrecipitacion),
    ...fuentes.map((fuente) => clasificarFuente({ ...fuente, datoMasRecienteImerg, ahora })),
    ...clasificarDatasets(
      publicaciones.map((p) => ({ datasetId: p.datasetId, nombre: p.nombre, publicadaEn: new Date(p.publicadaEn).toISOString() })),
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
