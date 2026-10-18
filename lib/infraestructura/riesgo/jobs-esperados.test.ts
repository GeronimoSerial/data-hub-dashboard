import { describe, expect, it } from 'vitest'
import { JOBS_ESPERADOS, JOBS_ESPERADOS_PRODUCTOR, jobsEsperadosParaRol } from './jobs-esperados'
import { JOBS_OPEN_METEO } from './providers/rol-entorno'

const porNombre = new Map(JOBS_ESPERADOS.map((job) => [job.nombre, job]))

describe('JOBS_ESPERADOS', () => {
  it.each([
    ['sync-imerg', 30],
    ['sync-radar-meteo', 360],
    ['climatologia-imerg', 1440],
    ['calcular-riesgo', 360],
    ['sync-pronostico-caudal', 360],
    ['sync-ensemble', 360],
    ['situacion-corte', 60],
    ['veredicto-diario', 360],
    ['veredicto-cierre', 1440],
    ['sync-synop-lluvia', 60],
    ['sync-prefectura-historico', 1440],
    ['importar-exposicion-rio-dem', 1440],
  ])('vigila %s cada %i min en producción', (nombre, intervalo) => {
    expect(porNombre.get(nombre)).toMatchObject({ habilitado: true, intervaloMinutos: intervalo })
  })

  it('sólo deja sin programar los jobs que producción no corre', () => {
    expect(JOBS_ESPERADOS.filter((job) => !job.habilitado).map((job) => job.nombre).sort()).toEqual(['calcular-riesgo-v04-candidato', 'climatologia-caudal', 'climatologia-precipitacion', 'episodios-derivados', 'importar-altimetria-v04', 'sync-ina-pronostico', 'sync-ina-serie-diaria', 'sync-seasonal'])
  })

  it('declara el candidato v0.4 con su propio tipo de lease, sin programar', () => {
    expect(porNombre.get('calcular-riesgo-v04-candidato')).toEqual({
      nombre: 'calcular-riesgo-v04-candidato',
      tipo: 'calcular-riesgo-v04-candidato',
      intervaloMinutos: 360,
      habilitado: false,
    })
  })
})

describe('jobsEsperadosParaRol', () => {
  it('en rol consumidor no espera corridas de los productores Open-Meteo', () => {
    const consumidor = jobsEsperadosParaRol('consumidor')
    for (const nombre of JOBS_OPEN_METEO) {
      expect(consumidor.find((job) => job.nombre === nombre)?.habilitado ?? false).toBe(false)
    }
    expect(consumidor.find((job) => job.nombre === 'sync-imerg')).toMatchObject({ habilitado: true })
    expect(consumidor.map((job) => job.nombre)).toEqual(JOBS_ESPERADOS.map((job) => job.nombre))
  })

  it('en rol productor conserva la lista declarada', () => {
    expect(jobsEsperadosParaRol('productor')).toEqual(JOBS_ESPERADOS_PRODUCTOR)
  })
})
