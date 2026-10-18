import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
// Avance de los dos jobs de climatología bajo cursor resumable de cupo
// (OM-cupo, ver docs/ejecucion-enos/OM-cupo/registro.md): mientras el cupo
// diario no alcance para terminar todas las celdas pendientes, el job vuelve
// a correr por el timer diario y avanza un poco más — "completado" en
// infra_job_run sólo se ve el día que no queda ninguna celda pendiente. Este
// módulo cuenta el avance real independiente de ese estado, para
// /admin/operacion: cuántas celdas/puntos ya tienen fila persistida contra el
// total esperado.
import { and, eq, isNotNull } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hazardClimatology, infraGeoProfile } from '@/lib/db/schema'
import { obtenerPuntosRio } from './puntos-rio'

// Mismas constantes por defecto que los jobs (calcular-climatologia.ts /
// calcular-climatologia-caudal.ts): el avance se mide contra el
// período+version que corre el timer diario, no contra cualquier fila
// histórica de una version vieja.
const VERSION_PRECIPITACION = 'climatologia-v1'
const PERIODO_DESDE_PRECIPITACION = '1991-01-01'
const PERIODO_HASTA_PRECIPITACION = '2020-12-31'
const VERSION_CAUDAL = 'caudal-climatologia-v0.1'
const PERIODO_DESDE_CAUDAL = '2015-01-01'
const PERIODO_HASTA_CAUDAL = '2024-12-31'

export type AvanceClimatologia = { completas: number; total: number }

export type AvanceClimatologiaGeneral = {
  precipitacion: AvanceClimatologia
  caudal: AvanceClimatologia
}

export async function obtenerAvanceClimatologia(): Promise<AvanceClimatologiaGeneral> {
  await cargarReferencias()
  const db = getDb()

  // Total de celdas candidatas: mismo selectDistinct que usa
  // calcular-climatologia.ts para armar la lista de celdas del job.
  const filasGeo = await db
    .selectDistinct({ geometryRef: infraGeoProfile.geometryRef })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))
  const totalPrecipitacion = filasGeo.length

  const filasPrecipitacion = await db
    .selectDistinct({ geometryRef: hazardClimatology.geometryRef })
    .from(hazardClimatology)
    .where(
      and(
        eq(hazardClimatology.version, VERSION_PRECIPITACION),
        eq(hazardClimatology.periodoDesde, PERIODO_DESDE_PRECIPITACION),
        eq(hazardClimatology.periodoHasta, PERIODO_HASTA_PRECIPITACION),
      ),
    )

  const filasCaudal = await db
    .selectDistinct({ geometryRef: hazardClimatology.geometryRef })
    .from(hazardClimatology)
    .where(
      and(
        eq(hazardClimatology.version, VERSION_CAUDAL),
        eq(hazardClimatology.periodoDesde, PERIODO_DESDE_CAUDAL),
        eq(hazardClimatology.periodoHasta, PERIODO_HASTA_CAUDAL),
      ),
    )

  return {
    precipitacion: { completas: filasPrecipitacion.length, total: totalPrecipitacion },
    caudal: { completas: filasCaudal.length, total: obtenerPuntosRio().length },
  }
}
