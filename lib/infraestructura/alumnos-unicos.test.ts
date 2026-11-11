import { describe, expect, it } from 'vitest'
import { contarAlumnosUnicos } from './alumnos-unicos'

const rango = (desde: number, hasta: number) => Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i)

describe('contarAlumnosUnicos', () => {
  it('una sola afectación cuenta sus alumnos distintos', () => {
    expect(contarAlumnosUnicos([
      { secciones: [{ alumnos: [1, 2, 2, 3] }], totales: { alumnos: 3 } },
    ])).toBe(3)
  })

  it('no cuenta dos veces un alumno alcanzado por dos afectaciones', () => {
    expect(contarAlumnosUnicos([
      { secciones: [{ alumnos: rango(1, 10) }], totales: { alumnos: 10 } },
      { secciones: [{ alumnos: rango(5, 15) }], totales: { alumnos: 11 } },
    ])).toBe(15)
  })

  it('una afectación de sección completa y otra que selecciona alumnos de esa sección suman una vez', () => {
    expect(contarAlumnosUnicos([
      { secciones: [{ alumnos: rango(1, 30) }], totales: { alumnos: 30 } },
      { secciones: [{ alumnos: rango(1, 10) }], totales: { alumnos: 10 } },
    ])).toBe(30)
  })

  it('afectaciones disjuntas dan la suma de sus totales', () => {
    expect(contarAlumnosUnicos([
      { secciones: [{ alumnos: rango(1, 4) }], totales: { alumnos: 4 } },
      { secciones: [{ alumnos: rango(5, 7) }], totales: { alumnos: 3 } },
    ])).toBe(7)
  })

  it('las carreras de instituto cuentan con clave mat: y no colisionan con ids ge:', () => {
    expect(contarAlumnosUnicos([
      { secciones: [{ alumnos: [5] }], totales: { alumnos: 1 } },
      { secciones: [], carreras: [{ alumnos: [5] }], totales: { alumnos: 1 } },
    ])).toBe(2)
  })

  it('usa totales.alumnos cuando la afectación no trae ids de alumno', () => {
    expect(contarAlumnosUnicos([
      { secciones: [], totales: { alumnos: 7 } },
    ])).toBe(7)
  })

  it('suma los totales sin ids a los alumnos distintos de las demás afectaciones', () => {
    expect(contarAlumnosUnicos([
      { secciones: [{ alumnos: [1, 2] }], totales: { alumnos: 2 } },
      { secciones: [], totales: { alumnos: 4 } },
    ])).toBe(6)
  })

  it('sin afectaciones devuelve cero', () => {
    expect(contarAlumnosUnicos([])).toBe(0)
  })
})
