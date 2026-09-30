import { describe, expect, it } from 'vitest'
import {
  calcularMetricasVerificacion,
  calidadImergAceptable,
  claveUnicaVerificacion,
  centroGeometryRefImerg,
  fechaD1,
  runValidoParaFecha,
} from './verificacion'

describe('verificación radar con IMERG', () => {
  it('calcula sesgo, POD y FAR con pares hand-computados', () => {
    const filas = Array.from({ length: 14 }, (_, i) => ({
      fecha: `2026-09-${String(17 + i).padStart(2, '0')}`,
      pronosticoMm: i < 5 ? 12 : 4,
      observadoMm: i < 5 ? 10 : 2,
      coberturaObs: 1,
    }))
    const metricas = calcularMetricasVerificacion(filas, '2026-09-30')
    expect(metricas.estado).toBe('ok')
    expect(metricas.sesgoMm).toBe(2)
    expect(metricas.pod).toBe(1)
    expect(metricas.far).toBe(0)
    expect(metricas.nPares).toBe(14)
    expect(metricas.nEventos).toBe(5)
    expect(metricas.desde).toBe('2026-09-17')
  })

  it('aplica la puerta de 14 pares y 5 eventos y comunica conteos actuales', () => {
    const filas = Array.from({ length: 13 }, (_, i) => ({ fecha: `2026-09-${String(18 + i).padStart(2, '0')}`, pronosticoMm: 12, observadoMm: i < 4 ? 11 : 2, coberturaObs: 1 }))
    const resultado = calcularMetricasVerificacion(filas, '2026-09-30')
    expect(resultado).toMatchObject({ estado: 'muestra_insuficiente', nPares: 13, nEventos: 4, sesgoMm: null, pod: null, far: null })
  })

  it('excluye los pares con cobertura observada menor al 80%', () => {
    const filas = Array.from({ length: 14 }, (_, i) => ({ fecha: `2026-09-${String(17 + i).padStart(2, '0')}`, pronosticoMm: 12, observadoMm: 11, coberturaObs: i === 0 ? 0.79 : 1 }))
    expect(calcularMetricasVerificacion(filas, '2026-09-30')).toMatchObject({ estado: 'muestra_insuficiente', nPares: 13, nEventos: 13 })
  })

  it('filtra celdas IMERG con QIh bajo o ausente', () => {
    expect(calidadImergAceptable(0.49)).toBe(false)
    expect(calidadImergAceptable(0.5)).toBe(true)
    expect(calidadImergAceptable(null)).toBe(false)
  })

  it('usa fecha y departamento como clave idempotente', () => {
    expect(claveUnicaVerificacion().map((columna) => columna.name)).toEqual(['fecha', 'departamento'])
  })

  it('reconstruye el centro IMERG desde geometry_ref redondeado', () => {
    expect(centroGeometryRefImerg('-30.7_-58.2')).toEqual({ lat: -30.75, lon: -58.25 })
  })

  it('fechaD1 respeta el cambio de día de Buenos Aires', () => {
    expect(fechaD1(new Date('2026-09-30T02:00:00Z'))).toBe('2026-09-28')
    expect(fechaD1(new Date('2026-09-30T12:00:00Z'))).toBe('2026-09-29')
  })

  it('selecciona sólo corridas completas recibidas antes de comenzar D-1 y con cobertura diaria', () => {
    const base = { status: 'completo', forecastStart: '2026-09-29T03:00:00.000Z', forecastEnd: '2026-09-30T02:00:00.000Z' }
    expect(runValidoParaFecha({ ...base, fetchedAt: '2026-09-29T02:59:59.999Z' }, '2026-09-29')).toBe(true)
    expect(runValidoParaFecha({ ...base, fetchedAt: '2026-09-29T03:00:00.000Z' }, '2026-09-29')).toBe(false)
    expect(runValidoParaFecha({ ...base, forecastStart: '2026-09-29T04:00:00.000Z', fetchedAt: '2026-09-29T02:00:00.000Z' }, '2026-09-29')).toBe(false)
    expect(runValidoParaFecha({ ...base, status: 'fallido', fetchedAt: '2026-09-29T02:00:00.000Z' }, '2026-09-29')).toBe(false)
  })
})
