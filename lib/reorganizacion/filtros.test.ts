import { describe, expect, it } from 'vitest'
import {
  calcularIndicadores,
  coincideClasificacion,
  ETIQUETAS_TENDENCIA,
  etiquetaOpcion,
  FILTROS_INICIALES,
  filtrarEscuelas,
  hayFiltroActivo,
  opcionesFiltro,
  resaltarPorClasificacion,
  SIN_DATO_CLASIFICACION,
  type ContextoFiltros,
  type FiltrosReorganizacion,
} from './filtros'
import type { EscuelaV29 } from './tipos'
import { tendenciaPorZona } from './zonas'

function escuela(datos: Partial<EscuelaV29> & Pick<EscuelaV29, 'cue'>): EscuelaV29 {
  return {
    nombre: `Escuela ${datos.cue}`,
    departamento: 'Capital',
    localidad: 'Corrientes',
    ambito: 'Urbano',
    cui: '',
    jurisdiccion: 'Provincial',
    modalidad: 'Común',
    matricula: 1,
    historia: {},
    lat: -27.5,
    lon: -58.8,
    pof: {},
    agentes: 0,
    zona: 'Zona 1',
    sueldosTotal: null,
    personasSueldos: null,
    clasificacionZonaSueldos: null,
    ...datos,
  }
}

// Ocho establecimientos que cubren cada regla: zona, aislado, sin ubicación,
// POF, clasificación presente y faltante, y tendencias distintas.
const universo: EscuelaV29[] = [
  escuela({ cue: '1800001-00', nombre: 'Escuela San Martín', matricula: 8, zona: 'Zona 1', clasificacionZonaSueldos: 'Zona Urbana A' }),
  escuela({ cue: '1800002-00', nombre: 'Escuela Rural', departamento: 'Goya', localidad: 'Lavalle', matricula: 5, zona: 'Zona 2', agentes: 2, pof: { Titular: 2 }, clasificacionZonaSueldos: 'Zona Rural B' }),
  escuela({ cue: '1800003-00', nombre: 'Escuela Tres', departamento: 'Goya', localidad: 'Goya', matricula: 3, zona: 'Zona 2' }),
  escuela({ cue: '1800004-00', nombre: 'Escuela Aislada', matricula: 4, zona: 'Aislado', clasificacionZonaSueldos: 'Zona Rural B' }),
  escuela({ cue: '1800005-00', nombre: 'Escuela Sin Mapa', departamento: 'Santo Tomé', localidad: 'Santo Tomé', matricula: 6, zona: '', lat: Number.NaN, lon: Number.NaN, agentes: 1, pof: { Suplente: 1 } }),
  escuela({ cue: '1800006-00', nombre: 'Escuela Diez', departamento: 'Santo Tomé', localidad: 'Garruchos', matricula: 7, zona: 'Zona 10', clasificacionZonaSueldos: 'Zona Urbana A' }),
  escuela({ cue: '1800007-00', nombre: 'Escuela Con POF', matricula: 2, zona: 'Zona 1', agentes: 3, pof: { Titular: 3 }, clasificacionZonaSueldos: 'Zona Urbana A' }),
  escuela({ cue: '1800008-00', nombre: 'Escuela Mercedes', departamento: 'Goya', localidad: 'Mercedes', matricula: 1, zona: 'Zona 10' }),
]

const contexto: ContextoFiltros = {
  tendenciaPorZona: { 'Zona 1': 'baja', 'Zona 2': 'sube', 'Zona 10': 'sin' },
}

function cues(escuelas: EscuelaV29[]): string[] {
  return escuelas.map((e) => e.cue.slice(0, 7)).sort()
}

function filtrar(parcial: Partial<FiltrosReorganizacion>) {
  return filtrarEscuelas(universo, { ...FILTROS_INICIALES, ...parcial }, contexto)
}

describe('búsqueda', () => {
  it('busca por CUE-Anexo', () => {
    expect(cues(filtrar({ busqueda: '1800003' }).escuelas)).toEqual(['1800003'])
  })

  it('busca por nombre sin distinguir mayúsculas y recorta espacios', () => {
    expect(cues(filtrar({ busqueda: '  RURAL ' }).escuelas)).toEqual(['1800002'])
  })

  it('busca por localidad', () => {
    expect(cues(filtrar({ busqueda: 'garruchos' }).escuelas)).toEqual(['1800006'])
  })
})

describe('filtros individuales', () => {
  it('filtra por departamento', () => {
    expect(cues(filtrar({ departamento: 'Goya' }).escuelas)).toEqual(['1800002', '1800003', '1800008'])
  })

  it('filtra por zona histórica', () => {
    expect(cues(filtrar({ zona: 'Zona 2' }).escuelas)).toEqual(['1800002', '1800003'])
  })

  it('filtra por aislados', () => {
    expect(cues(filtrar({ zona: 'Aislado' }).escuelas)).toEqual(['1800004'])
  })

  it('filtra por establecimientos sin ubicación', () => {
    expect(cues(filtrar({ zona: 'SIN_COORD' }).escuelas)).toEqual(['1800005'])
  })

  it('filtra por POF: "si" son los que tienen agentes, "no" los que no', () => {
    expect(cues(filtrar({ pof: 'si' }).escuelas)).toEqual(['1800002', '1800005', '1800007'])
    expect(cues(filtrar({ pof: 'no' }).escuelas)).toEqual(['1800001', '1800003', '1800004', '1800006', '1800008'])
  })

  it('filtra por tendencia; zona sin entrada o aislado es "sin comparación"', () => {
    expect(cues(filtrar({ tendencia: 'baja' }).escuelas)).toEqual(['1800001', '1800007'])
    expect(cues(filtrar({ tendencia: 'sube' }).escuelas)).toEqual(['1800002', '1800003'])
    expect(cues(filtrar({ tendencia: 'igual' }).escuelas)).toEqual([])
    expect(cues(filtrar({ tendencia: 'sin' }).escuelas)).toEqual(['1800004', '1800005', '1800006', '1800008'])
  })

  it('no filtra por clasificación salarial', () => {
    expect(cues(filtrar({ clasificacion: 'Zona Rural B' }).escuelas)).toEqual(cues(universo))
  })
})

describe('combinaciones y sin resultados', () => {
  it('combina departamento y POF', () => {
    expect(cues(filtrar({ departamento: 'Capital', pof: 'si' }).escuelas)).toEqual(['1800007'])
  })

  it('combina búsqueda con tendencia', () => {
    expect(cues(filtrar({ busqueda: 'escuela', tendencia: 'sube' }).escuelas)).toEqual(['1800002', '1800003'])
  })

  it('sin coincidencias devuelve listado y indicadores vacíos', () => {
    const resultado = filtrar({ busqueda: 'inexistente' })
    expect(resultado.escuelas).toEqual([])
    expect(resultado.idsCoincidentes.size).toBe(0)
    expect(resultado.seleccionActiva).toBe(true)
    expect(calcularIndicadores(resultado.escuelas)).toEqual({ establecimientos: 0, alumnos: 0, ubicados: 0, conPof: 0 })
  })

  it('sin filtros conserva el universo y no hay selección activa', () => {
    const resultado = filtrar({})
    expect(resultado.escuelas).toHaveLength(universo.length)
    expect(resultado.seleccionActiva).toBe(false)
  })
})

describe('conjunto filtrado frente al contexto del mapa', () => {
  it('idsCoincidentes son los CUE del listado filtrado', () => {
    const resultado = filtrar({ departamento: 'Goya' })
    expect([...resultado.idsCoincidentes].sort()).toEqual(['1800002-00', '1800003-00', '1800008-00'])
  })

  it('no modifica el universo de entrada', () => {
    const copia = [...universo]
    filtrar({ departamento: 'Goya', pof: 'si' })
    expect(universo).toEqual(copia)
    expect(universo).toHaveLength(8)
  })

  it('un filtro activo cuenta como selección activa aunque el listado sea completo', () => {
    expect(filtrar({ clasificacion: 'Zona Rural B' }).seleccionActiva).toBe(true)
  })

  it('una búsqueda de solo espacios no es selección activa', () => {
    expect(hayFiltroActivo({ ...FILTROS_INICIALES, busqueda: '   ' })).toBe(false)
  })
})

describe('resaltado por clasificación salarial', () => {
  const todas = filtrar({}).escuelas

  it('resalta las escuelas de la clasificación elegida', () => {
    const resaltado = resaltarPorClasificacion(todas, 'Zona Rural B')
    expect([...resaltado.cues].sort()).toEqual(['1800002-00', '1800004-00'])
    expect(resaltado.cantidad).toBe(2)
  })

  it('resalta la clasificación faltante con la opción sin dato', () => {
    const resaltado = resaltarPorClasificacion(todas, SIN_DATO_CLASIFICACION)
    expect([...resaltado.cues].sort()).toEqual(['1800003-00', '1800005-00', '1800008-00'])
    expect(resaltado.cantidad).toBe(3)
  })

  it('sin clasificación resalta todas las escuelas filtradas', () => {
    expect(resaltarPorClasificacion(todas, '').cantidad).toBe(universo.length)
  })

  it('solo resalta dentro del listado filtrado', () => {
    const goya = filtrar({ departamento: 'Goya' }).escuelas
    expect(resaltarPorClasificacion(goya, 'Zona Urbana A').cantidad).toBe(0)
  })

  it('la clasificación no cambia el conjunto filtrado', () => {
    const sinClasificacion = filtrar({ departamento: 'Goya' })
    const conClasificacion = filtrar({ departamento: 'Goya', clasificacion: SIN_DATO_CLASIFICACION })
    expect(conClasificacion.escuelas).toEqual(sinClasificacion.escuelas)
    expect([...conClasificacion.idsCoincidentes]).toEqual([...sinClasificacion.idsCoincidentes])
  })

  it('una escuela sin clasificación coincide solo con la opción sin dato', () => {
    const sinDato = escuela({ cue: '1800099-00', clasificacionZonaSueldos: null })
    expect(coincideClasificacion(sinDato, SIN_DATO_CLASIFICACION)).toBe(true)
    expect(coincideClasificacion(sinDato, 'Zona Urbana A')).toBe(false)
  })
})

describe('indicadores', () => {
  it('suma establecimientos, alumnos, ubicados y con POF', () => {
    expect(calcularIndicadores(universo)).toEqual({
      establecimientos: 8,
      alumnos: 36,
      ubicados: 7,
      conPof: 3,
    })
  })

  it('sin POF registrada cuenta cero y no rompe el cálculo', () => {
    const sinPof = [escuela({ cue: '1800010-00', agentes: 0, pof: {}, matricula: 4 })]
    expect(calcularIndicadores(sinPof)).toEqual({ establecimientos: 1, alumnos: 4, ubicados: 1, conPof: 0 })
  })
})

describe('opciones de filtro', () => {
  const opciones = opcionesFiltro(universo)

  it('lista departamentos presentes en orden alfabético', () => {
    expect(opciones.departamentos).toEqual(['Capital', 'Goya', 'Santo Tomé'])
  })

  it('lista zonas por número y agrega aislados y sin ubicación', () => {
    expect(opciones.zonas).toEqual(['Zona 1', 'Zona 2', 'Zona 10', 'Aislado', 'SIN_COORD'])
  })

  it('lista clasificaciones presentes y siempre la opción sin dato al final', () => {
    expect(opciones.clasificaciones).toEqual(['Zona Rural B', 'Zona Urbana A', SIN_DATO_CLASIFICACION])
  })

  it('etiqueta las opciones especiales y deja el resto tal cual', () => {
    expect(etiquetaOpcion('Aislado')).toBe('Aislados')
    expect(etiquetaOpcion('SIN_DATO')).toBe('Sin dato de clasificación')
    expect(etiquetaOpcion('Zona 1')).toBe('Zona 1')
    expect(ETIQUETAS_TENDENCIA.sin).toBe('Sin comparación')
  })
})

describe('filtro de tendencia con zonas.ts', () => {
  it('filtra por la tendencia que calcula tendenciaPorZona', () => {
    const escuelas = [
      escuela({ cue: 'T1', zona: 'Zona 1', historia: { '2023': 10, '2026': 5 } }),
      escuela({ cue: 'T2', zona: 'Zona 2', historia: { '2026': 5 } }),
    ]
    const contextoReal: ContextoFiltros = { tendenciaPorZona: tendenciaPorZona(escuelas) }
    const { escuelas: filtradas } = filtrarEscuelas(escuelas, { ...FILTROS_INICIALES, tendencia: 'baja' }, contextoReal)
    expect(filtradas.map((e) => e.cue)).toEqual(['T1'])
  })
})
