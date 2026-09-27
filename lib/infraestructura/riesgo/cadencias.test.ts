import { describe, expect, it } from 'vitest'
import {
  CADENCIAS,
  estadoAtrasoJob,
  estaAtrasado,
  proximaCorridaEsperada,
  TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB,
} from './cadencias'

const MINUTO_MS = 60_000
const AHORA = new Date('2026-01-01T00:00:00.000Z')

describe('estaAtrasado', () => {
  it('nunca marca atrasado un job bajo demanda sin corrida previa', () => {
    const atrasado = estaAtrasado({
      nombre: 'climatologia-precipitacion',
      ultimaCorridaExitosaEn: null,
      ahora: AHORA,
    })
    expect(atrasado).toBe(false)
  })

  it('marca atrasado sync-imerg si nunca corrió', () => {
    const atrasado = estaAtrasado({
      nombre: 'sync-imerg',
      ultimaCorridaExitosaEn: null,
      ahora: AHORA,
    })
    expect(atrasado).toBe(true)
  })

  it('no marca atrasado sync-imerg con corrida hace 90 minutos', () => {
    const atrasado = estaAtrasado({
      nombre: 'sync-imerg',
      ultimaCorridaExitosaEn: new Date(AHORA.getTime() - 90 * MINUTO_MS),
      ahora: AHORA,
    })
    expect(atrasado).toBe(false)
  })

  it('marca atrasado sync-imerg con corrida hace 150 minutos', () => {
    const atrasado = estaAtrasado({
      nombre: 'sync-imerg',
      ultimaCorridaExitosaEn: new Date(AHORA.getTime() - 150 * MINUTO_MS),
      ahora: AHORA,
    })
    expect(atrasado).toBe(true)
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

  it('devuelve null para un job bajo demanda', () => {
    const proxima = proximaCorridaEsperada({
      nombre: 'climatologia-caudal',
      ultimaCorridaExitosaEn: null,
      ahora: AHORA,
    })
    expect(proxima).toBeNull()
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

describe('TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB', () => {
  it('cubre exactamente los 8 nombres de job de CADENCIAS, sin huecos ni duplicados', () => {
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
    expect(TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB['geo-perfiles']).toBe('geo-perfiles')
  })
})
