import { describe, expect, it } from 'vitest'
import {
  CADENCIAS,
  estadoAtrasoJob,
  estaAtrasado,
  proximaCorridaEsperada,
  TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB,
} from './cadencias'
import type { NombreJob } from './cadencias'

const MINUTO_MS = 60_000
const AHORA = new Date('2026-01-01T00:00:00.000Z')

const CASOS_ATRASO: ReadonlyArray<[string, NombreJob, number | null, boolean]> = [
  ['marca atrasado climatologia-precipitacion (timer diario) sin corrida previa', 'climatologia-precipitacion', null, true],
  ['no marca atrasado climatologia-caudal (timer diario) con corrida exitosa hace 10 minutos', 'climatologia-caudal', 10, false],
  ['marca atrasado sync-imerg si nunca corrió', 'sync-imerg', null, true],
  ['no marca atrasado sync-imerg con corrida hace 90 minutos', 'sync-imerg', 90, false],
  ['marca atrasado sync-imerg con corrida hace 150 minutos', 'sync-imerg', 150, true],
  ['no marca atrasado situacion-corte con corrida hace 90 minutos (cadencia horaria)', 'situacion-corte', 90, false],
  ['marca atrasado situacion-corte con corrida hace 150 minutos', 'situacion-corte', 150, true],
  ['no marca atrasado sync-prefectura-alturas con corrida hace 90 minutos (cadencia horaria)', 'sync-prefectura-alturas', 90, false],
  ['marca atrasado sync-prefectura-alturas con corrida hace 150 minutos', 'sync-prefectura-alturas', 150, true],
  ['marca atrasado sync-synop-lluvia con corrida hace 150 minutos', 'sync-synop-lluvia', 150, true],
  ['no marca atrasado sync-prefectura-historico con corrida hace 20 horas', 'sync-prefectura-historico', 1200, false],
  ['marca atrasado sync-prefectura-historico con corrida hace 50 horas', 'sync-prefectura-historico', 3000, true],
]

describe('estaAtrasado', () => {
  it.each(CASOS_ATRASO)('%s', (_titulo, nombre, minutos, esperado) => {
    const ultimaCorridaExitosaEn =
      minutos === null ? null : new Date(AHORA.getTime() - minutos * MINUTO_MS)
    const atrasado = estaAtrasado({ nombre, ultimaCorridaExitosaEn, ahora: AHORA })
    expect(atrasado).toBe(esperado)
  })
})

describe('proximaCorridaEsperada', () => {
  it('devuelve la última corrida más la cadencia para geo-perfiles', () => {
    const ultimaCorridaExitosaEn = new Date(AHORA.getTime() - 10 * MINUTO_MS)
    const proxima = proximaCorridaEsperada({
      nombre: 'geo-perfiles',
      ultimaCorridaExitosaEn,
      ahora: AHORA,
    })
    expect(proxima?.getTime()).toBe(ultimaCorridaExitosaEn.getTime() + 1440 * MINUTO_MS)
  })

  it('devuelve la última corrida más la cadencia diaria para climatologia-caudal', () => {
    const ultimaCorridaExitosaEn = new Date(AHORA.getTime() - 10 * MINUTO_MS)
    const proxima = proximaCorridaEsperada({
      nombre: 'climatologia-caudal',
      ultimaCorridaExitosaEn,
      ahora: AHORA,
    })
    expect(proxima?.getTime()).toBe(ultimaCorridaExitosaEn.getTime() + 1440 * MINUTO_MS)
  })
})

describe('estadoAtrasoJob', () => {
  it('muestra "Desactivado por configuración" con enosJobsEnabled=false, aunque el job esté atrasado', () => {
    const estado = estadoAtrasoJob({
      nombre: 'sync-imerg',
      ultimaCorridaExitosaEn: null,
      enosJobsEnabled: false,
      ahora: AHORA,
    })
    expect(estado).toEqual({
      texto: 'Desactivado por configuración',
      atrasado: false,
      desactivadoPorConfig: true,
    })
  })

  it('devuelve "—" sin nombre de job mapeado, incluso con enosJobsEnabled=false', () => {
    const estado = estadoAtrasoJob({
      nombre: undefined,
      ultimaCorridaExitosaEn: null,
      enosJobsEnabled: false,
      ahora: AHORA,
    })
    expect(estado).toEqual({ texto: '—', atrasado: false, desactivadoPorConfig: false })
  })

  it('con enosJobsEnabled=true delega en estaAtrasado y muestra "atrasado"/"al día"', () => {
    const atrasado = estadoAtrasoJob({
      nombre: 'sync-imerg',
      ultimaCorridaExitosaEn: new Date(AHORA.getTime() - 150 * MINUTO_MS),
      enosJobsEnabled: true,
      ahora: AHORA,
    })
    expect(atrasado).toEqual({ texto: 'atrasado', atrasado: true, desactivadoPorConfig: false })

    const alDia = estadoAtrasoJob({
      nombre: 'sync-imerg',
      ultimaCorridaExitosaEn: new Date(AHORA.getTime() - 30 * MINUTO_MS),
      enosJobsEnabled: true,
      ahora: AHORA,
    })
    expect(alDia).toEqual({ texto: 'al día', atrasado: false, desactivadoPorConfig: false })
  })
})

describe('sonda-cadena-datos en CADENCIAS', () => {
  it('se corre cada hora y se mapea desde su tipo de infra_job_run', () => {
    expect(CADENCIAS['sonda-cadena-datos'].minutos).toBe(60)
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['sonda-cadena-datos']).toBe('sonda-cadena-datos')
  })
})

describe('TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB', () => {
  it('cubre exactamente todos los nombres de job de CADENCIAS, sin huecos ni duplicados', () => {
    const valores = Object.values(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB)
    expect(new Set(valores)).toEqual(new Set(Object.keys(CADENCIAS)))
    expect(valores).toHaveLength(Object.keys(CADENCIAS).length)
  })

  it('traduce cada TIPO_JOB interno real al nombre CLI correcto', () => {
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['sync-hazard-imerg']).toBe('sync-imerg')
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['sync-hazard-pronostico-caudal']).toBe(
      'sync-pronostico-caudal',
    )
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['sync-hazard-ensemble']).toBe('sync-ensemble')
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['calculo-climatologia']).toBe(
      'climatologia-precipitacion',
    )
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['calcular-hazard-climatologia-caudal']).toBe(
      'climatologia-caudal',
    )
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['calcular-riesgo-v0']).toBe('calcular-riesgo')
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['episodios-derivados-v0']).toBe('episodios-derivados')
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['situacion-corte-v1']).toBe('situacion-corte')
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['geo-perfiles']).toBe('geo-perfiles')
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['sync-prefectura-alturas']).toBe('sync-prefectura-alturas')
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['sync-synop-lluvia']).toBe('sync-synop-lluvia')
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['sync-prefectura-historico']).toBe('sync-prefectura-historico')
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['importar-exposicion-rio-dem']).toBe('importar-exposicion-rio-dem')
  })
})
