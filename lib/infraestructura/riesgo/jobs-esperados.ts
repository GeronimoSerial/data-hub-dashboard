// Lista declarada de jobs batch OPS1 y su estado esperado. La usa salud.ts para
// detectar un job que debía correr y nunca corrió (`sin_corridas`), que quedó
// atrasado (`atrasado`), cuya última corrida falló (`fallando`) o que no está
// programado por decisión (`no_programado`).
//
// `nombre` es el nombre de despacho de scripts/jobs.mjs (NOMBRES_VALIDOS).
// `tipo` es la clave con la que el job escribe `infra_job_run`; no coincide con
// `nombre` para la mayoría de los jobs (ver TIPO_JOB en cada job). `tipo: null`
// marca un job que no escribe `infra_job_run` (no es verificable por esa vía).

export const TOLERANCIA_ATRASO_JOB = 2

export type JobEsperado = {
  nombre: string
  tipo: string | null
  intervaloMinutos: number
  // false = no programado en producción todavía (pendiente P-5): se reporta
  // como `no_programado`, no como alarma.
  habilitado: boolean
}

export const JOBS_ESPERADOS: readonly JobEsperado[] = [
  { nombre: 'sync-radar-meteo', tipo: 'sync-radar-meteo', intervaloMinutos: 180, habilitado: true },
  { nombre: 'sync-radar-ensemble', tipo: 'sync-radar-ensemble', intervaloMinutos: 360, habilitado: true },
  { nombre: 'sync-smn-alertas', tipo: 'sync-smn-alertas', intervaloMinutos: 15, habilitado: true },
  // verificar-radar-meteo no llama a adquirirLease: no escribe infra_job_run.
  { nombre: 'verificar-radar-meteo', tipo: null, intervaloMinutos: 1440, habilitado: true },
  // Coolify `*/30 * * * *`.
  { nombre: 'sync-imerg', tipo: 'sync-hazard-imerg', intervaloMinutos: 30, habilitado: true },
  // Coolify `41 21-23 * * *` and `43 21-23 * * *`: three resumable attempts every day.
  {
    nombre: 'climatologia-caudal',
    tipo: 'calcular-hazard-climatologia-caudal',
    intervaloMinutos: 1440,
    habilitado: true,
  },
  {
    nombre: 'climatologia-precipitacion',
    tipo: 'calculo-climatologia',
    intervaloMinutos: 1440,
    habilitado: true,
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
  {
    nombre: 'sync-pronostico-caudal',
    tipo: 'sync-hazard-pronostico-caudal',
    intervaloMinutos: 360,
    habilitado: true,
  },
  { nombre: 'sync-ensemble', tipo: 'sync-hazard-ensemble', intervaloMinutos: 360, habilitado: true },
  { nombre: 'situacion-corte', tipo: 'situacion-corte-v1', intervaloMinutos: 60, habilitado: true },
  { nombre: 'episodios-derivados', tipo: 'episodios-derivados-v0', intervaloMinutos: 60, habilitado: false },
  { nombre: 'sync-seasonal', tipo: 'sync-hazard-seasonal', intervaloMinutos: 1440, habilitado: false },
  // Coolify Scheduled Task `17 * * * *` in production since 2026-10-13.
  {
    nombre: 'sync-prefectura-alturas',
    tipo: 'sync-prefectura-alturas',
    intervaloMinutos: 60,
    habilitado: true,
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
  },
]
