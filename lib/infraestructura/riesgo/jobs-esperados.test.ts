import { describe, expect, it } from 'vitest'
import { JOBS_ESPERADOS } from './jobs-esperados'

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
    expect(JOBS_ESPERADOS.filter((job) => !job.habilitado).map((job) => job.nombre).sort()).toEqual(['climatologia-caudal', 'climatologia-precipitacion', 'episodios-derivados', 'sync-seasonal'])
  })
})
