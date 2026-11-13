// Lista declarada de jobs batch OPS1 y su estado esperado. La usa salud.ts para
// detectar un job que debía correr y nunca corrió (`sin_corridas`), que quedó
// atrasado (`atrasado`), cuya última corrida falló (`fallando`) o que no está
// programado por decisión (`no_programado`).
//
// `nombre` es el nombre de despacho de scripts/jobs.mjs (NOMBRES_VALIDOS).
// `tipo` es la clave con la que el job escribe `infra_job_run`; no coincide con
// `nombre` para la mayoría de los jobs (ver TIPO_JOB en cada job). `tipo: null`
// marca un job que no escribe `infra_job_run` (no es verificable por esa vía).

import type { RegionConfig } from '../region/esquema'
import { regionActiva } from '../region/activa'
import { JOBS_OPEN_METEO, rolEntorno, type RolEntorno } from './providers/rol-entorno'

export const TOLERANCIA_ATRASO_JOB = 2

export type JobEsperado = {
  nombre: string
  tipo: string | null
  intervaloMinutos: number
  // false = no programado en producción todavía (pendiente P-5): se reporta
  // como `no_programado`, no como alarma.
  habilitado: boolean
  // Clave de `contadores` (de la última corrida completada) con las filas
  // RECIBIDAS por el job, antes de deduplicar o insertar. Sin clave, el job no
  // tiene mínimo.
  contadorFilas?: string
  // Mínimo de filas recibidas para que una corrida completada no sea
  // `sin_datos` (I2). Sin mínimo (IMERG, alarmas, conteos de celdas) cero es
  // un estado legítimo. Un job sin contadores registrados (corridas anteriores)
  // se trata como ok: ver clasificarJob.
  minimoFilas?: number
}

// Filas recibidas de una corrida según el contador declarado del job. Devuelve
// null si el job no declara contador o la corrida no lo registró.
export function filasRecibidas(
  job: JobEsperado,
  contadores: Record<string, number> | null | undefined,
): number | null {
  if (job.contadorFilas === undefined || contadores == null) return null
  const valor = contadores[job.contadorFilas]
  return typeof valor === 'number' ? valor : null
}

export const JOBS_ESPERADOS_PRODUCTOR: readonly JobEsperado[] = [
  // Coolify `27 3,9,15,21 * * *`: alineado a la actualización de los modelos globales (6 h).
  { nombre: 'sync-radar-meteo', tipo: 'sync-radar-meteo', intervaloMinutos: 360, habilitado: true },
  { nombre: 'sync-radar-ensemble', tipo: 'sync-radar-ensemble', intervaloMinutos: 360, habilitado: true },
  { nombre: 'sync-smn-alertas', tipo: 'sync-smn-alertas', intervaloMinutos: 15, habilitado: true },
  // verificar-radar-meteo no llama a adquirirLease: no escribe infra_job_run.
  { nombre: 'verificar-radar-meteo', tipo: null, intervaloMinutos: 1440, habilitado: true },
  // Coolify `*/30 * * * *`.
  { nombre: 'sync-imerg', tipo: 'sync-hazard-imerg', intervaloMinutos: 30, habilitado: true },
  // Sin programar desde 2026-10-18 (docs/datos/cuota-open-meteo.md): la climatología de
  // caudal ya está cargada y ERA5 se reemplaza por IMERG; ambos jobs quedan para reejecución
  // manual.
  {
    nombre: 'climatologia-caudal',
    tipo: 'calcular-hazard-climatologia-caudal',
    intervaloMinutos: 1440,
    habilitado: false,
  },
  {
    nombre: 'climatologia-precipitacion',
    tipo: 'calculo-climatologia',
    intervaloMinutos: 1440,
    habilitado: false,
  },
  // Coolify Scheduled Task `20 4 * * *` (ver runbook-scheduler.md).
  {
    nombre: 'climatologia-imerg',
    tipo: 'calculo-climatologia-imerg',
    intervaloMinutos: 1440,
    habilitado: true,
  },
  // Running in production every 6 h (calcular-riesgo, sync-pronostico-caudal, sync-ensemble)
  // and hourly (situacion-corte), the cadences of their deploy/systemd/ops1 timers.
  { nombre: 'calcular-riesgo', tipo: 'calcular-riesgo-v0', intervaloMinutos: 360, habilitado: true },
  // Desde T11 (docs/motor-v0.4/promocion.md) calcular-riesgo corre Motor v0.4;
  // el job calcular-riesgo-v04-candidato queda sólo para corridas manuales de
  // evaluación y no se espera ni se programa.
  {
    nombre: 'sync-pronostico-caudal',
    tipo: 'sync-hazard-pronostico-caudal',
    intervaloMinutos: 360,
    habilitado: true,
    contadorFilas: 'filas',
    minimoFilas: 1,
  },
  { nombre: 'sync-ensemble', tipo: 'sync-hazard-ensemble', intervaloMinutos: 360, habilitado: true, contadorFilas: 'filas', minimoFilas: 1 },
  { nombre: 'situacion-corte', tipo: 'situacion-corte-v1', intervaloMinutos: 60, habilitado: true },
  // Coolify Scheduled Task `41 * * * *` (ver runbook-scheduler.md): corre en producción y en consumidor.
  { nombre: 'sonda-cadena-datos', tipo: 'sonda-cadena-datos', intervaloMinutos: 60, habilitado: true },
  { nombre: 'episodios-derivados', tipo: 'episodios-derivados-v0', intervaloMinutos: 60, habilitado: false },
  { nombre: 'sync-seasonal', tipo: 'sync-hazard-seasonal', intervaloMinutos: 1440, habilitado: false },
  // Coolify Scheduled Task `17 * * * *` in production since 2026-10-13.
  {
    nombre: 'sync-prefectura-alturas',
    tipo: 'sync-prefectura-alturas',
    intervaloMinutos: 60,
    habilitado: true,
    contadorFilas: 'filasPublicadas',
    minimoFilas: 1,
  },
  // Scheduled at this deploy (docs/DEPLOY.md, runbook-scheduler.md):
  // veredicto `45 0,6,12,18 * * *` and `30 3 * * *`; synop `23 * * * *`;
  // Prefectura histórico `35 7 * * *`; exposición DEM `50 7 * * *` (daily, no-op per version).
  { nombre: 'veredicto-diario', tipo: 'veredicto-diario-v0', intervaloMinutos: 360, habilitado: true },
  { nombre: 'veredicto-cierre', tipo: 'veredicto-cierre-v0', intervaloMinutos: 1440, habilitado: true },
  { nombre: 'sync-synop-lluvia', tipo: 'sync-synop-lluvia', intervaloMinutos: 60, habilitado: true },
  {
    nombre: 'sync-prefectura-historico',
    tipo: 'sync-prefectura-historico',
    intervaloMinutos: 1440,
    habilitado: true,
  },
  {
    nombre: 'importar-exposicion-rio-dem',
    tipo: 'importar-exposicion-rio-dem',
    intervaloMinutos: 1440,
    habilitado: true,
    contadorFilas: 'filas',
    minimoFilas: 1,
  },
  // Motor v0.4 (T2): importación manual del CSV de altimetría; no programada.
  {
    nombre: 'importar-altimetria-v04',
    tipo: 'importar-altimetria-v04',
    intervaloMinutos: 1440,
    habilitado: false,
  },
  // Insumos de Motor v0.4 operativo (T11). Coolify `10 6 * * *` (serie diaria
  // INA A5) y `50 1,7,13,19 * * *` (pronóstico INA 499/289, antes de
  // calcular-riesgo). No escriben infra_job_run: su frescura se vigila por la
  // salud de fuente (actualizarSaludFuente). INA no comparte cupo por IP, así
  // que staging/dev (rol consumidor) también los corren en lugar de replicar
  // hidro_serie_diaria / hidro_ina_*: no están en JOBS_OPEN_METEO.
  { nombre: 'sync-ina-serie-diaria', tipo: null, intervaloMinutos: 1440, habilitado: true },
  { nombre: 'sync-ina-pronostico', tipo: null, intervaloMinutos: 360, habilitado: true },
  // Niveles del río de Manaos (B12). ANA: Coolify `12 * * * *`; SGB/SACE: Coolify `27 * * * *`
  // (pendiente de crear en Coolify). Sólo aplican con 'ana' / 'sgb' en fuentesRio.
  {
    nombre: 'sync-ana-niveis',
    tipo: 'sync-ana-niveis',
    intervaloMinutos: 60,
    habilitado: true,
    contadorFilas: 'filasRecibidas',
    minimoFilas: 1,
  },
  {
    nombre: 'sync-sgb-niveis',
    tipo: 'sync-sgb-niveis',
    intervaloMinutos: 60,
    habilitado: true,
    contadorFilas: 'filasRecibidas',
    minimoFilas: 1,
  },
]

// En staging/dev (rol consumidor) los productores Open-Meteo no corren: sus
// datos llegan por réplica (docs/riesgo-om-replicacion.md). Se reportan como
// `no_programado` en lugar de `sin_corridas`/`atrasado`.
export function jobsEsperadosParaRol(rol: RolEntorno): readonly JobEsperado[] {
  if (rol === 'productor') return JOBS_ESPERADOS_PRODUCTOR
  return JOBS_ESPERADOS_PRODUCTOR.map((job) =>
    JOBS_OPEN_METEO.includes(job.nombre) ? { ...job, habilitado: false } : job,
  )
}

// Aplicabilidad por región (B9.5). Un job sin regla aplica a todas las regiones.
// La regla depende de los datos que declara la región, no de su id: sync-prefectura-*
// requiere 'prefectura' en fuentesRio, sync-ina-* requiere 'ina', sync-smn-alertas
// requiere 'smn' en fuentesAlertas, sync-synop-lluvia requiere 'synop' en fuentesLluvia,
// e importar-exposicion-rio-dem requiere 'exposicion-rio-dem' en capasEstaticas.
// sync-ana-* requiere 'ana' en fuentesRio y sync-sgb-* requiere 'sgb' en fuentesRio.
// Se deriva del nombre del job y no de un campo por job para no alterar la forma de
// los objetos de la lista. scripts/jobs.mjs replica esta misma regla (ver aplicaJobARegionDespacho).
type RegionAplicable = Pick<RegionConfig, 'fuentesRio' | 'fuentesAlertas' | 'fuentesLluvia' | 'capasEstaticas'>

export function aplicaJobARegion(nombre: string, region: RegionAplicable): boolean {
  if (nombre.startsWith('sync-prefectura-')) return region.fuentesRio.includes('prefectura')
  if (nombre.startsWith('sync-ina-')) return region.fuentesRio.includes('ina')
  if (nombre.startsWith('sync-ana-')) return region.fuentesRio.includes('ana')
  if (nombre.startsWith('sync-sgb-')) return region.fuentesRio.includes('sgb')
  if (nombre === 'sync-smn-alertas') return (region.fuentesAlertas ?? []).includes('smn')
  if (nombre === 'sync-synop-lluvia') return (region.fuentesLluvia ?? []).includes('synop')
  if (nombre === 'importar-exposicion-rio-dem') return (region.capasEstaticas ?? []).includes('exposicion-rio-dem')
  return true
}

// Lista esperada para una región y un rol. Sólo filtra: no cambia los objetos.
export function jobsEsperadosParaRegion(
  region: RegionConfig,
  rol: RolEntorno = rolEntorno(),
): readonly JobEsperado[] {
  return jobsEsperadosParaRol(rol).filter((job) => aplicaJobARegion(job.nombre, region))
}

// Rol leído al cargar el módulo: el entorno del proceso no cambia en ejecución.
// Región leída al cargar el módulo: REGION (o corrientes) no cambia en ejecución.
export const JOBS_ESPERADOS: readonly JobEsperado[] = jobsEsperadosParaRegion(regionActiva(), rolEntorno())
