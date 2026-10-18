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
    expect(JOBS_ESPERADOS.filter((job) => !job.habilitado).map((job) => job.nombre).sort()).toEqual(['climatologia-caudal', 'climatologia-precipitacion', 'episodios-derivados', 'importar-altimetria-v04', 'sync-seasonal'])
  })

  it('ya no espera el candidato v0.4: el operativo calcular-riesgo corre Motor v0.4', () => {
    expect(porNombre.has('calcular-riesgo-v04-candidato')).toBe(false)
  })

  it('espera los insumos INA de Motor v0.4 sin traza de infra_job_run (salud de fuente)', () => {
    expect(porNombre.get('sync-ina-serie-diaria')).toEqual({ nombre: 'sync-ina-serie-diaria', tipo: null, intervaloMinutos: 1440, habilitado: true })
    expect(porNombre.get('sync-ina-pronostico')).toEqual({ nombre: 'sync-ina-pronostico', tipo: null, intervaloMinutos: 360, habilitado: true })
  })

  it('la altimetría v0.4 sigue siendo una importación manual', () => {
    expect(porNombre.get('importar-altimetria-v04')).toMatchObject({ habilitado: false })
  })
})

describe('jobsEsperadosParaRol', () => {
  it('en rol consumidor no espera corridas de los productores Open-Meteo', () => {
    const consumidor = jobsEsperadosParaRol('consumidor')
    for (const nombre of JOBS_OPEN_METEO) {
      expect(consumidor.find((job) => job.nombre === nombre)?.habilitado ?? false).toBe(false)
    }
    expect(consumidor.find((job) => job.nombre === 'sync-imerg')).toMatchObject({ habilitado: true })
    // INA no comparte cupo: el consumidor corre sus propios jobs INA.
    expect(consumidor.find((job) => job.nombre === 'sync-ina-serie-diaria')).toMatchObject({ habilitado: true })
    expect(consumidor.find((job) => job.nombre === 'sync-ina-pronostico')).toMatchObject({ habilitado: true })
    expect(consumidor.map((job) => job.nombre)).toEqual(JOBS_ESPERADOS.map((job) => job.nombre))
  })

  it('en rol productor conserva la lista declarada', () => {
    expect(jobsEsperadosParaRol('productor')).toEqual(JOBS_ESPERADOS_PRODUCTOR)
  })
})
