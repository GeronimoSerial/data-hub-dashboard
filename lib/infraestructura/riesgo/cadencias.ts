// Fuente única de cadencias de los jobs batch OPS1 (ENOS 2026/2027): la usan
// tanto el runbook/systemd como la UI de salud (/admin/operacion) para saber
// cada cuánto debería correr cada job y cuándo se considera atrasado.

export type NombreJob =
  | 'geo-perfiles'
  | 'sync-pronostico-caudal'
  | 'sync-ensemble'
  | 'sync-imerg'
  | 'climatologia-precipitacion'
  | 'climatologia-caudal'
  | 'calcular-riesgo'
  | 'episodios-derivados'
  | 'situacion-corte'

export const CADENCIAS: Record<NombreJob, { minutos: number; descripcion: string }> = {
  // Cada 6h para alinearse con las corridas ECMWF 00/06/12/18 UTC.
  'sync-pronostico-caudal': { minutos: 360, descripcion: 'Sincroniza pronóstico de caudal (cada 6h)' },
  // Ídem anterior: misma ventana de corridas, fuente Open-Meteo Ensemble.
  'sync-ensemble': { minutos: 360, descripcion: 'Sincroniza ensemble Open-Meteo (cada 6h)' },
  // Early Run IMERG trae ~4h de latencia propia de la fuente; el job hace un
  // backfill acotado, por eso se corre cada hora.
  'sync-imerg': { minutos: 60, descripcion: 'Sincroniza precipitación IMERG Early Run (cada hora)' },
  // Encadenado después de cada sync de 6h; también se dispara tras sync-imerg,
  // pero la cadencia base declarada es 6h.
  'calcular-riesgo': { minutos: 360, descripcion: 'Calcula el riesgo encadenado a los sync de 6h' },
  // Derivaciones ligeras que acompañan al ciclo horario de IMERG.
  'episodios-derivados': { minutos: 60, descripcion: 'Deriva episodios a partir de los datos recientes' },
  // Corte del Centro de Situación: cadencia horaria, también encadenado tras
  // calcular-riesgo (la cadencia base declarada es 1h).
  'situacion-corte': { minutos: 60, descripcion: 'Genera el corte del Centro de Situación (cada hora, y encadenado tras calcular-riesgo)' },
  // Proceso pesado de agregación: alcanza con una corrida diaria.
  'geo-perfiles': { minutos: 1440, descripcion: 'Reconstruye los perfiles geográficos (diario)' },
  // 0 = sin cadencia automática: se ejecuta bajo demanda / manual.
  'climatologia-precipitacion': { minutos: 0, descripcion: 'Climatología de precipitación (bajo demanda)' },
  // 0 = sin cadencia automática: se ejecuta bajo demanda / manual.
  'climatologia-caudal': { minutos: 0, descripcion: 'Climatología de caudal (bajo demanda)' },
}

// El `tipo` que cada job persiste en infra_job_run (TIPO_JOB interno) no es el
// mismo string que su nombre CLI en scripts/jobs.mjs — cada job define el suyo
// de forma independiente (ver lib/infraestructura/riesgo/jobs/*.ts y
// lib/infraestructura/episodios-derivados/job.ts). Este mapeo es la única
// fuente de verdad para traducir uno a otro; sin él, la UI de salud no puede
// encontrar la cadencia de un job por su fila de infra_job_run.
export const TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB: Record<string, NombreJob> = {
  'geo-perfiles': 'geo-perfiles',
  'sync-hazard-pronostico-caudal': 'sync-pronostico-caudal',
  'sync-hazard-ensemble': 'sync-ensemble',
  'sync-hazard-imerg': 'sync-imerg',
  'calculo-climatologia': 'climatologia-precipitacion',
  'calcular-hazard-climatologia-caudal': 'climatologia-caudal',
  'calcular-riesgo-v0': 'calcular-riesgo',
  'episodios-derivados-v0': 'episodios-derivados',
  'situacion-corte-v1': 'situacion-corte',
}

// Un job está atrasado cuando pasaron más de dos cadencias completas desde su
// última corrida exitosa. Los jobs bajo demanda (minutos === 0) nunca se marcan.
export function estaAtrasado(params: {
  nombre: NombreJob
  ultimaCorridaExitosaEn: Date | null
  ahora?: Date
}): boolean {
  const { nombre, ultimaCorridaExitosaEn, ahora = new Date() } = params
  const cadencia = CADENCIAS[nombre].minutos
  if (cadencia === 0) return false
  if (ultimaCorridaExitosaEn === null) return true
  return ahora.getTime() - ultimaCorridaExitosaEn.getTime() > cadencia * 60_000 * 2
}

// Próxima corrida esperada: la última exitosa más una cadencia. Sin corrida
// previa se espera "ya" (ahora); bajo demanda no aplica (null).
export function proximaCorridaEsperada(params: {
  nombre: NombreJob
  ultimaCorridaExitosaEn: Date | null
  ahora?: Date
}): Date | null {
  const { nombre, ultimaCorridaExitosaEn, ahora = new Date() } = params
  const cadencia = CADENCIAS[nombre].minutos
  if (cadencia === 0) return null
  if (ultimaCorridaExitosaEn === null) return ahora
  return new Date(ultimaCorridaExitosaEn.getTime() + cadencia * 60_000)
}

export type EstadoAtrasoJob = {
  texto: 'Desactivado por configuración' | 'atrasado' | 'al día' | '—'
  atrasado: boolean
  desactivadoPorConfig: boolean
}

// Texto/estado a mostrar en /admin/operacion para la columna "atrasado".
// Centraliza la regla que evita el falso positivo del hallazgo bloqueante
// del review de N1: con ENOS_JOBS_ENABLED=false (pausa operativa deliberada)
// ningún job corre, y eso NO es lo mismo que un job atrasado por un problema
// real — mostrar "atrasado" ahí habría hecho perder tiempo a un operador
// investigando un incidente inexistente.
export function estadoAtrasoJob(params: {
  nombre: NombreJob | undefined
  ultimaCorridaExitosaEn: Date | null
  enosJobsEnabled: boolean
  ahora?: Date
}): EstadoAtrasoJob {
  const { nombre, ultimaCorridaExitosaEn, enosJobsEnabled, ahora } = params

  if (!nombre) return { texto: '—', atrasado: false, desactivadoPorConfig: false }
  if (!enosJobsEnabled) {
    return { texto: 'Desactivado por configuración', atrasado: false, desactivadoPorConfig: true }
  }

  const atrasado = estaAtrasado({ nombre, ultimaCorridaExitosaEn, ahora })
  return { texto: atrasado ? 'atrasado' : 'al día', atrasado, desactivadoPorConfig: false }
}
