import { describe, expect, it } from 'vitest'
import { calcularTotalesEscuelasFiltradas } from './totales-filtrados'

describe('calcularTotalesEscuelasFiltradas', () => {
  it('calcula el resumen sobre las escuelas recibidas, ya filtradas', () => {
    const totales = calcularTotalesEscuelasFiltradas([
      { estado: 'afectada' },
      { estado: 'sin_afectacion_reportada' },
      { estado: 'sin_afectacion_reportada' },
    ])

    expect(totales).toEqual({
      totalEscuelas: 3,
      escuelasAfectadas: 1,
      porcentajeAfectadas: 33.3,
    })
  })

  it('devuelve porcentajes en cero cuando no quedan escuelas', () => {
    expect(calcularTotalesEscuelasFiltradas([])).toEqual({
      totalEscuelas: 0,
      escuelasAfectadas: 0,
      porcentajeAfectadas: 0,
    })
  })
})
