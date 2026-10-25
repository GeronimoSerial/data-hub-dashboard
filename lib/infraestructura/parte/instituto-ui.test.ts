import { describe, expect, it } from 'vitest'
import {
  etiquetasDeCarreras,
  alcanceInstituto,
  conAlumnoAlternado,
  conCarrerasElegidas,
  esListaAlumnosElegidos,
  textoAlcanceInstituto,
  type AlumnoElegido,
  type CarreraElegible,
  type SeleccionInstituto,
} from './instituto-ui'

const catalogo: CarreraElegible[] = [
  { id: 1, nombre: 'Enfermería', tipo: 'Tecnicatura', totalAlumnos: 10 },
  { id: 2, nombre: 'Medicina', tipo: 'Carrera', totalAlumnos: 20 },
]

const ana: AlumnoElegido = { id: 100, apellido: 'Lopez', nombre: 'Ana', carreraId: 1 }
const luis: AlumnoElegido = { id: 101, apellido: 'Perez', nombre: 'Luis', carreraId: 2 }

const vacia: SeleccionInstituto = { carreras: [], alumnos: [], alumnosElegidos: [] }

describe('alcanceInstituto', () => {
  it('cuenta una carrera sin alumnos elegidos como carrera completa', () => {
    expect(alcanceInstituto([1, 2], [], catalogo)).toEqual({ carreras: 2, alumnos: 30 })
  })

  it('cuenta sólo los alumnos elegidos en las carreras que los tienen', () => {
    expect(alcanceInstituto([1, 2], [ana], catalogo)).toEqual({ carreras: 2, alumnos: 1 + 20 })
  })

  it('no suma alumnos de carreras que no están elegidas', () => {
    expect(alcanceInstituto([2], [ana], catalogo)).toEqual({ carreras: 1, alumnos: 20 })
  })
})

describe('textoAlcanceInstituto', () => {
  it('usa el texto de la especificación con plural y singular', () => {
    expect(textoAlcanceInstituto(2, 15)).toBe('Alcanza a 2 carreras (15 alumnos)')
    expect(textoAlcanceInstituto(1, 1)).toBe('Alcanza a 1 carrera (1 alumno)')
  })

  it('omite el paréntesis cuando no hay alumnos calculados', () => {
    expect(textoAlcanceInstituto(3, 0)).toBe('Alcanza a 3 carreras')
  })
})

describe('conCarrerasElegidas', () => {
  it('descarta los alumnos de carreras que se quitaron', () => {
    const conAlumnos = { carreras: [1, 2], alumnos: [100, 101], alumnosElegidos: [ana, luis] }
    const siguiente = conCarrerasElegidas(conAlumnos, [2])
    expect(siguiente.carreras).toEqual([2])
    expect(siguiente.alumnosElegidos).toEqual([luis])
    expect(siguiente.alumnos).toEqual([101])
  })
})

describe('conAlumnoAlternado', () => {
  it('agrega el alumno y lo quita si vuelve a elegirlo', () => {
    const agregado = conAlumnoAlternado({ ...vacia, carreras: [1] }, ana)
    expect(agregado.alumnos).toEqual([100])
    expect(agregado.alumnosElegidos).toEqual([ana])
    const quitado = conAlumnoAlternado(agregado, ana)
    expect(quitado.alumnos).toEqual([])
    expect(quitado.alumnosElegidos).toEqual([])
  })
})

describe('esListaAlumnosElegidos', () => {
  it('acepta sólo alumnos con la forma completa', () => {
    expect(esListaAlumnosElegidos([ana])).toBe(true)
    expect(esListaAlumnosElegidos([{ id: 1 }])).toBe(false)
    expect(esListaAlumnosElegidos('x')).toBe(false)
  })
})

describe('etiquetasDeCarreras', () => {
  it('deja el nombre tal cual cuando no se repite dentro del CUE', () => {
    const catalogo = [
      { id: 1, nombre: 'Enfermería', tipo: 'Tecnicatura', totalAlumnos: 40, rm: 'RM 1' },
      { id: 2, nombre: 'Medicina', tipo: 'Carrera', totalAlumnos: 120, rm: 'RM 2' },
    ]
    expect([...etiquetasDeCarreras(catalogo).values()]).toEqual(['Enfermería', 'Medicina'])
  })

  it('distingue las homónimas con tipo y RM', () => {
    const catalogo = [
      { id: 1, nombre: 'Matemática', tipo: 'Profesorado', totalAlumnos: 10, rm: '1464/14' },
      { id: 2, nombre: 'Matemática', tipo: 'Tecnicatura', totalAlumnos: 12, rm: '0770/21' },
      { id: 3, nombre: 'Enfermería', tipo: 'Tecnicatura', totalAlumnos: 40, rm: '9/10' },
    ]
    const etiquetas = etiquetasDeCarreras(catalogo)
    expect(etiquetas.get(1)).toBe('Matemática — Profesorado (RM 1464/14)')
    expect(etiquetas.get(2)).toBe('Matemática — Tecnicatura (RM 0770/21)')
    expect(etiquetas.get(3)).toBe('Enfermería')
  })

  it('sin RM distingue sólo con el tipo', () => {
    const catalogo = [
      { id: 1, nombre: 'Matemática', tipo: 'Profesorado', totalAlumnos: 10 },
      { id: 2, nombre: 'Matemática', tipo: 'Tecnicatura', totalAlumnos: 12 },
    ]
    expect(etiquetasDeCarreras(catalogo).get(2)).toBe('Matemática — Tecnicatura')
  })
})
