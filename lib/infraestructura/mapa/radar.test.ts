import { describe, expect, it } from 'vitest'
import type { EscuelaMapaEnriquecida } from './tipos'
import { colorRiesgo, coloresRadar, escuelasEnRadar, escuelasPorRiesgo, nivelRiesgo, resumirRiesgo } from './radar'
import type { NivelRiesgo } from './radar'

function escuela(parcial: Partial<EscuelaMapaEnriquecida> = {}): EscuelaMapaEnriquecida {
  return {
    cueAnexo: 'cue-1', nombre: 'Escuela', departamento: 'Goya', localidad: 'Goya',
    lat: null, lon: null, niveles: ['Primario'], alumnos: 0, gravedad: 0,
    categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false,
    ultimaNovedad: null, alumnosSinClases: 0,
    situacionesHistoricas: 0, solucionadasRecientes: 0, ...parcial,
  }
}

const padrón = [
  escuela({ cueAnexo: 'muy-alto-muchos', nombre: 'Alfa', alumnos: 100 }),
  escuela({ cueAnexo: 'alto-pocos', nombre: 'Beta', alumnos: 20 }),
  escuela({ cueAnexo: 'alto-muchos', nombre: 'Gamma', alumnos: 60 }),
  escuela({ cueAnexo: 'moderado', nombre: 'Delta', alumnos: 80 }),
  escuela({ cueAnexo: 'bajo', nombre: 'Épsilon', alumnos: 50 }),
]

const puntos = [
  { cueAnexo: 'muy-alto-muchos', horizonteHoras: 24, nivelRiesgo: 'muy_alto' },
  { cueAnexo: 'muy-alto-muchos', horizonteHoras: 72, nivelRiesgo: 'bajo' },
  { cueAnexo: 'alto-pocos', horizonteHoras: 24, nivelRiesgo: 'alto' },
  { cueAnexo: 'alto-muchos', horizonteHoras: 24, nivelRiesgo: 'alto' },
  { cueAnexo: 'moderado', horizonteHoras: 24, nivelRiesgo: 'moderado' },
  { cueAnexo: 'bajo', horizonteHoras: 24, nivelRiesgo: 'bajo' },
  { cueAnexo: 'sin-dato', horizonteHoras: 24, nivelRiesgo: null },
  { cueAnexo: 'sin-dato-texto', horizonteHoras: 24, nivelRiesgo: 'sin_dato' },
  { cueAnexo: 'fuera-padron', horizonteHoras: 24, nivelRiesgo: 'muy_alto' },
]

describe('escuelasPorRiesgo', () => {
  it('filtra por horizonte, descarta sin datos y escuelas fuera del padrón y ordena nivel y alumnos', () => {
    const resultado = escuelasPorRiesgo(puntos, padrón, 24)
    expect(resultado.map(({ escuela: e, nivel }) => [e.cueAnexo, nivel])).toEqual([
      ['muy-alto-muchos', 'muy_alto'],
      ['alto-muchos', 'alto'],
      ['alto-pocos', 'alto'],
      ['moderado', 'moderado'],
      ['bajo', 'bajo'],
    ])
    expect(escuelasPorRiesgo(puntos, padrón, 72).map(({ escuela: e }) => e.cueAnexo)).toEqual(['muy-alto-muchos'])
  })

  it('no incluye una escuela cuando su único punto pertenece a otro horizonte', () => {
    expect(escuelasPorRiesgo([{ cueAnexo: 'cue-1', horizonteHoras: 72, nivelRiesgo: 'alto' }], [escuela()], 24)).toEqual([])
  })

  it('cuenta una escuela con varios niveles una sola vez por su punto', () => {
    const multiNivel = escuela({ cueAnexo: 'multi', niveles: ['Inicial', 'Primario'] })
    expect(escuelasPorRiesgo([
      { cueAnexo: 'multi', horizonteHoras: 24, nivelRiesgo: 'alto' },
    ], [multiNivel], 24)).toHaveLength(1)
  })
})

describe('resumirRiesgo', () => {
  it('cuenta y suma alumnos sólo para riesgos alto y muy alto', () => {
    const resultado = escuelasPorRiesgo(puntos, padrón, 24)
    expect(resumirRiesgo(resultado)).toEqual({ escuelasAltas: 3, alumnosAltos: 180 })
  })
})

describe('coloresRadar', () => {
  it('omite riesgo bajo para que el mapa dibuje el punto neutro', () => {
    const colores = coloresRadar(puntos, padrón, 24)
    expect([...colores.keys()]).toEqual(['muy-alto-muchos', 'alto-muchos', 'alto-pocos', 'moderado'])
    expect(colores.has('bajo')).toBe(false)
  })

  it('colorea por amenaza las escuelas de prioridad baja con amenaza alta o muy alta en el horizonte', () => {
    const padrónAmenaza = [
      ...padrón,
      escuela({ cueAnexo: 'bajo-amenaza-alta', nombre: 'Zeta' }),
      escuela({ cueAnexo: 'bajo-amenaza-muy-alta', nombre: 'Eta' }),
      escuela({ cueAnexo: 'bajo-amenaza-moderada', nombre: 'Theta' }),
      escuela({ cueAnexo: 'bajo-amenaza-otro-horizonte', nombre: 'Iota' }),
    ]
    const puntosAmenaza = [
      ...puntos.map((punto) => ({ ...punto, nivelAmenaza: punto.cueAnexo === 'moderado' ? 'bajo' : null })),
      { cueAnexo: 'bajo-amenaza-alta', horizonteHoras: 24, nivelRiesgo: 'bajo', nivelAmenaza: 'alto' },
      { cueAnexo: 'bajo-amenaza-muy-alta', horizonteHoras: 24, nivelRiesgo: 'bajo', nivelAmenaza: 'muy_alto' },
      { cueAnexo: 'bajo-amenaza-moderada', horizonteHoras: 24, nivelRiesgo: 'bajo', nivelAmenaza: 'moderado' },
      { cueAnexo: 'bajo-amenaza-otro-horizonte', horizonteHoras: 24, nivelRiesgo: 'bajo', nivelAmenaza: null },
      { cueAnexo: 'bajo-amenaza-otro-horizonte', horizonteHoras: 72, nivelRiesgo: 'bajo', nivelAmenaza: 'muy_alto' },
    ]

    const colores = coloresRadar(puntosAmenaza, padrónAmenaza, 24)

    expect(colores.get('bajo-amenaza-alta')).toBe(colorRiesgo('alto'))
    expect(colores.get('bajo-amenaza-muy-alta')).toBe(colorRiesgo('muy_alto'))
    expect(colores.has('bajo-amenaza-moderada')).toBe(false)
    expect(colores.has('bajo-amenaza-otro-horizonte')).toBe(false)
    expect(colores.has('bajo')).toBe(false)
    // Las escuelas ya visibles conservan el color de su prioridad.
    expect(colores.get('moderado')).toBe(colorRiesgo('moderado'))
    expect(colores.get('muy-alto-muchos')).toBe(colorRiesgo('muy_alto'))
  })
})

describe('escuelasEnRadar', () => {
  it('incluye prioridad moderada o más y prioridad baja sólo con amenaza alta o muy alta', () => {
    const resultado = escuelasEnRadar([
      { cueAnexo: 'a', horizonteHoras: 24, nivelRiesgo: 'moderado', nivelAmenaza: null },
      { cueAnexo: 'b', horizonteHoras: 24, nivelRiesgo: 'bajo', nivelAmenaza: 'alto' },
      { cueAnexo: 'c', horizonteHoras: 24, nivelRiesgo: 'bajo', nivelAmenaza: 'moderado' },
      { cueAnexo: 'd', horizonteHoras: 24, nivelRiesgo: 'bajo' },
    ], [escuela({ cueAnexo: 'a' }), escuela({ cueAnexo: 'b' }), escuela({ cueAnexo: 'c' }), escuela({ cueAnexo: 'd' })], 24)

    expect(resultado.map(({ escuela: e, nivel, amenaza }) => [e.cueAnexo, nivel, amenaza])).toEqual([
      ['a', 'moderado', null],
      ['b', 'bajo', 'alto'],
    ])
  })
})

describe('nivelRiesgo y colorRiesgo', () => {
  it('normaliza sólo los cuatro niveles conocidos', () => {
    expect(nivelRiesgo('sin_dato')).toBeNull()
    expect(nivelRiesgo(null)).toBeNull()
    expect(nivelRiesgo('desconocido')).toBeNull()
    expect(nivelRiesgo('alto')).toBe('alto')
  })

  it('asigna un color distinto a cada nivel', () => {
    const niveles: NivelRiesgo[] = ['muy_alto', 'alto', 'moderado', 'bajo']
    const colores = niveles.map(colorRiesgo)
    expect(new Set(colores).size).toBe(4)
    expect(colores.every((color) => typeof color === 'string' && color.length > 0)).toBe(true)
  })
})
