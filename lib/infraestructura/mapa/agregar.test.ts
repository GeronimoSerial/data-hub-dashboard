import { describe, expect, it } from 'vitest'
import type { EscuelaMapaEnriquecida } from './tipos'
import { ordenarReportes, resumir, ultimaActualizacion } from './agregar'

function escuela(parcial: Partial<EscuelaMapaEnriquecida> = {}): EscuelaMapaEnriquecida {
  return {
    cueAnexo: '1800001-00',
    nombre: 'Escuela',
    departamento: 'Goya',
    localidad: 'Goya',
    lat: null,
    lon: null,
    niveles: ['Primario'],
    alumnos: 0,
    gravedad: 0,
    categoriaPrincipal: null,
    clases: 'normal',
    apoyo: null,
    sinActualizar: false,
    ultimaNovedad: null,
    alumnosSinClases: 0,
    situacionesHistoricas: 0,
    ...parcial,
  }
}

describe('resumir', () => {
  it('calcula los números sobre el padrón recibido', () => {
    const escuelas = [
      escuela({ gravedad: 2, clases: 'sin', apoyo: 'virtual', sinActualizar: true, alumnosSinClases: 12 }),
      escuela({ cueAnexo: '1800002-00', gravedad: 1, clases: 'parcial', apoyo: 'cuadernillo', alumnosSinClases: 5 }),
      escuela({ cueAnexo: '1800003-00', gravedad: 0, clases: 'evacuado', apoyo: 'ambos', sinActualizar: true, alumnosSinClases: 8 }),
      escuela({ cueAnexo: '1800004-00', gravedad: 3, clases: 'normal', apoyo: 'virtual', sinActualizar: true, alumnosSinClases: 0 }),
      escuela({ cueAnexo: '1800005-00', gravedad: 0, clases: 'normal', sinActualizar: false, alumnosSinClases: 0 }),
    ]

    expect(resumir(escuelas)).toEqual({
      conReporte: 3,
      sinClases: 3,
      alumnosSinClases: 25,
      sinActualizar: 3,
      sinClasesConApoyo: 3,
    })
  })

  it('devuelve ceros para un padrón vacío', () => {
    expect(resumir([])).toEqual({
      conReporte: 0,
      sinClases: 0,
      alumnosSinClases: 0,
      sinActualizar: 0,
      sinClasesConApoyo: 0,
    })
  })
})

describe('ordenarReportes', () => {
  it('ordena por gravedad, clases no normales y novedad reciente sin mutar el padrón', () => {
    const escuelas = [
      escuela({ cueAnexo: 'normal-reciente', gravedad: 4, clases: 'normal', ultimaNovedad: '2026-10-05T12:00:00.000Z' }),
      escuela({ cueAnexo: 'parcial', gravedad: 4, clases: 'parcial', ultimaNovedad: '2026-10-01T12:00:00.000Z' }),
      escuela({ cueAnexo: 'sin-reciente', gravedad: 4, clases: 'sin', ultimaNovedad: '2026-10-04T12:00:00.000Z' }),
      escuela({ cueAnexo: 'sin-mas-reciente', gravedad: 4, clases: 'sin', ultimaNovedad: '2026-10-05T12:00:00.000Z' }),
      escuela({ cueAnexo: 'gravedad-menor', gravedad: 3, clases: 'evacuado', ultimaNovedad: '2026-10-05T12:00:00.000Z' }),
      escuela({ cueAnexo: 'sin-fecha', gravedad: 4, clases: 'centro', ultimaNovedad: null }),
    ]
    const original = [...escuelas]

    expect(ordenarReportes(escuelas).map(({ cueAnexo }) => cueAnexo)).toEqual([
      'sin-mas-reciente',
      'sin-reciente',
      'parcial',
      'sin-fecha',
      'normal-reciente',
      'gravedad-menor',
    ])
    expect(escuelas).toEqual(original)
  })
})

describe('ultimaActualizacion', () => {
  it('devuelve la novedad más reciente del padrón', () => {
    const escuelas = [
      escuela({ ultimaNovedad: '2026-10-01T12:00:00.000Z' }),
      escuela({ cueAnexo: '1800002-00', ultimaNovedad: null }),
      escuela({ cueAnexo: '1800003-00', ultimaNovedad: '2026-10-05T12:00:00.000Z' }),
      escuela({ cueAnexo: '1800004-00', ultimaNovedad: '2026-10-03T12:00:00.000Z' }),
    ]

    expect(ultimaActualizacion(escuelas)).toBe('2026-10-05T12:00:00.000Z')
  })

  it('devuelve null para un padrón vacío', () => {
    expect(ultimaActualizacion([])).toBeNull()
  })

  it('devuelve null cuando todas las escuelas carecen de novedad', () => {
    expect(ultimaActualizacion([escuela(), escuela({ cueAnexo: '1800002-00' })])).toBeNull()
  })
})
