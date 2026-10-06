import { describe, expect, it } from 'vitest'
import type { EscuelaMapaEnriquecida } from './tipos'
import { agrupar, ordenarReportes, resumir, ultimaActualizacion } from './agregar'
import { filtrarEscuelas } from './filtrar'
import type { FiltrosMapa } from './tipos'

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
    solucionadasRecientes: 0,
    ...parcial,
  }
}

describe('resumir', () => {
  it('calcula los números sobre el padrón recibido', () => {
    const escuelas = [
      escuela({ gravedad: 2, clases: 'sin', apoyo: 'virtual', sinActualizar: true, alumnosSinClases: 12, solucionadasRecientes: 2 }),
      escuela({ cueAnexo: '1800002-00', gravedad: 1, clases: 'parcial', apoyo: 'cuadernillo', alumnosSinClases: 5 }),
      escuela({ cueAnexo: '1800003-00', gravedad: 0, clases: 'evacuado', apoyo: 'ambos', sinActualizar: true, alumnosSinClases: 8, solucionadasRecientes: 1 }),
      escuela({ cueAnexo: '1800004-00', gravedad: 3, clases: 'normal', apoyo: 'virtual', sinActualizar: true, alumnosSinClases: 0 }),
      escuela({ cueAnexo: '1800005-00', gravedad: 0, clases: 'normal', sinActualizar: false, alumnosSinClases: 0 }),
      escuela({ cueAnexo: '1800006-00', gravedad: 0, clases: 'sin', apoyo: 'brinda', alumnosSinClases: 4 }),
      escuela({ cueAnexo: '1800007-00', gravedad: 0, clases: 'parcial', apoyo: 'sin_dato', alumnosSinClases: 3 }),
    ]

    expect(resumir(escuelas)).toEqual({
      conReporte: 3,
      sinClases: 5,
      alumnosSinClases: 32,
      sinActualizar: 3,
      sinClasesConApoyo: 4,
      sinClasesSinDato: 1,
      solucionadasRecientes: 2,
    })
  })

  it('devuelve ceros para un padrón vacío', () => {
    expect(resumir([])).toEqual({
      conReporte: 0,
      sinClases: 0,
      alumnosSinClases: 0,
      sinActualizar: 0,
      sinClasesConApoyo: 0,
      sinClasesSinDato: 0,
      solucionadasRecientes: 0,
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

describe('agrupar', () => {
  it('coincide con el resumen del panel después de aplicar filtros', () => {
    const padron = [
      escuela({ cueAnexo: 'goya-1', departamento: 'Goya', gravedad: 2, clases: 'sin', alumnosSinClases: 12 }),
      escuela({ cueAnexo: 'goya-2', departamento: 'Goya', gravedad: 1, clases: 'parcial', alumnosSinClases: 5 }),
      escuela({ cueAnexo: 'capital-1', departamento: 'Capital', gravedad: 0, clases: 'evacuado', alumnosSinClases: 8 }),
      escuela({ cueAnexo: 'esquina-1', departamento: 'Esquina', gravedad: 3, clases: 'normal' }),
    ]
    const filtros: FiltrosMapa = {
      q: '', departamentos: ['Goya', 'Capital'], niveles: ['Primario'], gravedades: [],
      clases: ['sin', 'parcial', 'evacuado'], apoyo: [], sinActualizar: false, solucionadasRecientes: false,
    }
    const filtradas = filtrarEscuelas(padron, filtros)
    const filas = agrupar(filtradas, 'departamento')
    const resumen = resumir(filtrarEscuelas(padron, filtros))

    expect(resumen).toEqual({
      conReporte: 2,
      sinClases: 3,
      alumnosSinClases: 25,
      sinActualizar: 0,
      sinClasesConApoyo: 0,
      sinClasesSinDato: 0,
      solucionadasRecientes: 0,
    })
    expect(filas.reduce((total, fila) => total + fila.afectadas, 0)).toBe(resumen.conReporte)
    expect(filas.reduce((total, fila) => total + fila.alumnosSinClases, 0)).toBe(resumen.alumnosSinClases)
  })

  it('cuenta una escuela en cada uno de sus niveles distintos', () => {
    const padron = [escuela({ niveles: ['Primario', 'Inicial', 'Primario'] })]
    const filas = agrupar(padron, 'nivel')

    expect(filas.map(({ clave, escuelas }) => ({ clave, escuelas }))).toEqual([
      { clave: 'Inicial', escuelas: 1 },
      { clave: 'Primario', escuelas: 1 },
    ])
    // Una escuela con varios niveles aparece en varias filas, así que la suma puede superar el padrón.
    expect(filas.reduce((total, fila) => total + fila.escuelas, 0)).toBeGreaterThan(padron.length)
    expect(agrupar([escuela({ niveles: [] })], 'nivel')).toEqual([])
  })

  it('ordena por afectadas y escuelas, redondea porcentajes y no muta el padrón', () => {
    const escuelas = [
      escuela({ cueAnexo: 'z1', departamento: 'Zeta', gravedad: 1 }),
      escuela({ cueAnexo: 'z2', departamento: 'Zeta', gravedad: 1 }),
      escuela({ cueAnexo: 'z3', departamento: 'Zeta', gravedad: 0 }),
      escuela({ cueAnexo: 'b1', departamento: 'Beta', gravedad: 1 }),
      escuela({ cueAnexo: 'b2', departamento: 'Beta', gravedad: 1 }),
      escuela({ cueAnexo: 'g1', departamento: 'Gamma', gravedad: 1 }),
      escuela({ cueAnexo: 'g2', departamento: 'Gamma', gravedad: 0 }),
      escuela({ cueAnexo: 'g3', departamento: 'Gamma', gravedad: 0 }),
    ]
    const original = [...escuelas]
    const filas = agrupar(escuelas, 'departamento')

    expect(filas.map(({ clave }) => clave)).toEqual(['Zeta', 'Beta', 'Gamma'])
    expect(filas.map(({ porcentaje }) => porcentaje)).toEqual([67, 100, 33])
    expect(escuelas).toEqual(original)
  })

  it('usa etiquetas de gravedad y la categoría predeterminada, y devuelve vacío para padrón vacío', () => {
    expect(agrupar([
      escuela({ gravedad: 4, categoriaPrincipal: 'establecimiento' }),
      escuela({ cueAnexo: 'sin-reporte', gravedad: 0, categoriaPrincipal: null }),
    ], 'gravedad').map(({ clave }) => clave)).toEqual(['Crítica', 'Sin situaciones'])
    expect(agrupar([escuela({ categoriaPrincipal: null })], 'categoria').map(({ clave }) => clave)).toEqual(['Sin categoría'])
    expect(agrupar([
      escuela({ categoriaPrincipal: 'establecimiento' }),
      escuela({ cueAnexo: 'alumnos', categoriaPrincipal: 'alumnos' }),
      escuela({ cueAnexo: 'establecimiento-2', categoriaPrincipal: 'establecimiento' }),
    ], 'categoria').map(({ clave, escuelas }) => ({ clave, escuelas }))).toEqual([
      { clave: 'establecimiento', escuelas: 2 },
      { clave: 'alumnos', escuelas: 1 },
    ])
    expect(agrupar([], 'departamento')).toEqual([])
  })
})
