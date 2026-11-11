import { describe, expect, it } from 'vitest'
import {
  FILTROS_MAPA_VACIOS,
  type EscuelaMapaEnriquecida,
} from '@/lib/infraestructura/mapa/tipos'
import {
  contarOpciones,
  filtrarEscuelas,
  opcionesDireccion,
  opcionesDisponibles,
} from '@/lib/infraestructura/mapa/filtrar'

function esc(parcial: Partial<EscuelaMapaEnriquecida> = {}): EscuelaMapaEnriquecida {
  return {
    cueAnexo: '1800001-00',
    nombre: 'Escuela',
    departamento: 'Goya',
    localidad: 'Goya',
    lat: null,
    lon: null,
    niveles: ['Primario'],
    nivelJurisdiccionalId: null,
    nivelJurisdiccionalNombre: null,
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

describe('filtrarEscuelas — conComedor', () => {
  it('deja sólo las escuelas con desayuno y/o almuerzo; sin servicio registrado o sin dato queda afuera', () => {
    const lista = [
      esc({ cueAnexo: 'A', comedor: 'desayuno_almuerzo' }), esc({ cueAnexo: 'B', comedor: 'solo_desayuno' }),
      esc({ cueAnexo: 'C', comedor: 'solo_almuerzo' }), esc({ cueAnexo: 'D', comedor: 'sin_servicio' }), esc({ cueAnexo: 'E' }),
    ]
    expect(filtrarEscuelas(lista, { ...FILTROS_MAPA_VACIOS, conComedor: true }).map((e) => e.cueAnexo)).toEqual(['A', 'B', 'C'])
    expect(filtrarEscuelas(lista, FILTROS_MAPA_VACIOS)).toHaveLength(5)
  })

  it('se combina con Y con otros filtros', () => {
    const lista = [esc({ cueAnexo: 'A', comedor: 'solo_desayuno', gravedad: 3 }), esc({ cueAnexo: 'B', comedor: 'solo_desayuno', gravedad: 1 })]
    expect(filtrarEscuelas(lista, { ...FILTROS_MAPA_VACIOS, conComedor: true, gravedades: [3] }).map((e) => e.cueAnexo)).toEqual(['A'])
  })
})

describe('filtrarEscuelas', () => {
  it('las opciones de un mismo chip se combinan con O y los chips entre sí con Y', () => {
    const lista = [esc({ departamento: 'Goya', gravedad: 3 }), esc({ departamento: 'Esquina', gravedad: 1 }), esc({ departamento: 'Goya', gravedad: 1 })]
    const r = filtrarEscuelas(lista, { ...FILTROS_MAPA_VACIOS, departamentos: ['Goya', 'Esquina'], gravedades: [1] })
    expect(r.map((e) => e.departamento)).toEqual(['Esquina', 'Goya'])
  })

  it('"brinda" incluye todas las modalidades y el estado brinda; "no" y "sin_dato" son distintos', () => {
    const lista = [
      esc({ apoyo: 'virtual' }), esc({ apoyo: 'ambos' }), esc({ apoyo: 'cuadernillo' }),
      esc({ apoyo: 'brinda' }), esc({ apoyo: 'no' }), esc({ apoyo: 'sin_dato' }), esc({ apoyo: null }),
    ]
    expect(filtrarEscuelas(lista, { ...FILTROS_MAPA_VACIOS, apoyo: ['brinda'] })).toEqual(lista.slice(0, 4))
    expect(filtrarEscuelas(lista, { ...FILTROS_MAPA_VACIOS, apoyo: ['no'] })).toEqual([lista[4]])
    expect(filtrarEscuelas(lista, { ...FILTROS_MAPA_VACIOS, apoyo: ['sin_dato'] })).toEqual([lista[5]])
  })

  it('la búsqueda matchea nombre sin tildes ni mayúsculas, y CUE parcial', () => {
    const r = filtrarEscuelas([esc({ nombre: 'Escuela N° 87 Colonia Tatacuá', cueAnexo: '1800087-00' })], { ...FILTROS_MAPA_VACIOS, q: 'tatacua' })
    expect(r).toHaveLength(1)
    expect(filtrarEscuelas([esc({ cueAnexo: '1800087-00' })], { ...FILTROS_MAPA_VACIOS, q: '180008' })).toHaveLength(1)
  })

  it('sinActualizar=true deja sólo las sin actualizar', () => {
    const lista = [esc({ sinActualizar: false }), esc({ sinActualizar: true }), esc({ sinActualizar: true })]
    expect(filtrarEscuelas(lista, { ...FILTROS_MAPA_VACIOS, sinActualizar: true })).toEqual([lista[1], lista[2]])
  })

  it('solucionadasRecientes=true deja sólo escuelas con situaciones solucionadas recientes', () => {
    const lista = [esc(), esc({ cueAnexo: '1800002-00', solucionadasRecientes: 2 })]
    expect(filtrarEscuelas(lista, { ...FILTROS_MAPA_VACIOS, solucionadasRecientes: true })).toEqual([lista[1]])
  })

  it('los filtros vacíos devuelven todas las escuelas en el mismo orden', () => {
    const lista = [esc({ nombre: 'Primera' }), esc({ nombre: 'Segunda' })]
    expect(filtrarEscuelas(lista, FILTROS_MAPA_VACIOS)).toEqual(lista)
  })
})

describe('contarOpciones', () => {
  it('cuenta direcciones por id de nivel jurisdiccional y omite las escuelas sin dirección', () => {
    const conteos = contarOpciones([
      esc({ nivelJurisdiccionalId: 2, nivelJurisdiccionalNombre: 'Secundario' }),
      esc({ nivelJurisdiccionalId: 2, nivelJurisdiccionalNombre: 'Secundario' }),
      esc({ nivelJurisdiccionalId: null }),
    ], 'direcciones')
    expect(conteos.get('2')).toBe(2)
    expect(conteos.size).toBe(1)
  })

  it('cuenta las tres opciones con la misma semántica que el filtro', () => {
    const conteos = contarOpciones([
      esc({ apoyo: 'virtual' }),
      esc({ apoyo: 'cuadernillo' }),
      esc({ apoyo: 'ambos' }),
      esc({ apoyo: 'brinda' }),
      esc({ apoyo: 'no' }),
      esc({ apoyo: 'sin_dato' }),
      esc({ apoyo: null }),
    ], 'apoyo')
    expect(conteos).toEqual(new Map([['brinda', 4], ['no', 1], ['sin_dato', 1]]))
  })

  it('cuenta clases por escuela', () => {
    const conteos = contarOpciones([esc({ clases: 'normal' }), esc({ clases: 'sin' }), esc({ clases: 'sin' })], 'clases')
    expect(conteos).toEqual(new Map([['normal', 1], ['sin', 2]]))
  })
})

describe('opcionesDisponibles', () => {
  it('devuelve departamentos distintos ordenados en español', () => {
    expect(opcionesDisponibles([
      esc({ departamento: 'Goya' }),
      esc({ departamento: 'Ángel de la Guarda' }),
      esc({ departamento: 'Goya' }),
    ])).toEqual({
      departamentos: ['Ángel de la Guarda', 'Goya'],
    })
  })
})

describe('filtro Dirección (nivel jurisdiccional)', () => {
  const lista = [
    esc({ nombre: 'A', nivelJurisdiccionalId: 1, nivelJurisdiccionalNombre: 'Capital' }),
    esc({ nombre: 'B', nivelJurisdiccionalId: 2, nivelJurisdiccionalNombre: 'Esquina' }),
    esc({ nombre: 'C', nivelJurisdiccionalId: null }),
  ]

  it('sin dirección seleccionada no filtra', () => {
    expect(filtrarEscuelas(lista, FILTROS_MAPA_VACIOS)).toHaveLength(3)
  })

  it('con dirección seleccionada deja sólo esas escuelas (sin nivel no matchea)', () => {
    const r = filtrarEscuelas(lista, { ...FILTROS_MAPA_VACIOS, direcciones: [2] })
    expect(r.map((e) => e.nombre)).toEqual(['B'])
  })

  it('opcionesDireccion lista sólo los niveles presentes, sin duplicados y ordenados', () => {
    expect(opcionesDireccion([...lista, esc({ nivelJurisdiccionalId: 1, nivelJurisdiccionalNombre: 'Capital' })])).toEqual([
      { id: 1, nombre: 'Capital' },
      { id: 2, nombre: 'Esquina' },
    ])
  })
})
