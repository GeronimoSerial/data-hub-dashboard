import { describe, expect, it } from 'vitest'
import {
  colorNivelPlan,
  coloresPlanificacion,
  ETIQUETA_NIVEL_PLAN,
  nivelPlanificacion,
  prioridadPlanificacion,
  textoPrioridad,
} from './planificacion'
import type { EscuelaMapaEnriquecida } from './tipos'
import type { NivelPlanificacion } from './planificacion'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'

const escuelas: EscuelaMapaEnriquecida[] = [
  { cueAnexo: 'a', nombre: 'Escuela Zeta', departamento: 'Goya', localidad: 'Centro', lat: null, lon: null, niveles: ['Primario'], alumnos: 10, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 2 },
  { cueAnexo: 'b', nombre: 'Escuela Beta', departamento: 'Bella Vista', localidad: 'Centro', lat: null, lon: null, niveles: ['Inicial'], alumnos: 30, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 5 },
  { cueAnexo: 'c', nombre: 'Escuela Alfa', departamento: 'Ituzaingó', localidad: 'Centro', lat: null, lon: null, niveles: ['Secundario'], alumnos: 30, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 0 },
]

function territorio(overrides: Partial<NonNullable<TerritorioMapa['aislamiento']>> & Partial<NonNullable<TerritorioMapa['susceptibilidad']>> = {}): TerritorioMapa {
  return {
    aislamiento: {
      fuente: 'OpenStreetMap', atribucion: '© OpenStreetMap contributors', licencia: 'ODbL', fechaExtractoOsm: '2026-01-01', versionJob: '1',
      escuelas: {
        a: { nivel: 3, cruces: 1, conPuente: 0, sinPuente: 1, alternativaSinCruce: false },
        b: { nivel: 'sin_datos_red', cruces: null, conPuente: null, sinPuente: null, alternativaSinCruce: null },
        c: { nivel: 1, cruces: 0, conPuente: 0, sinPuente: 0, alternativaSinCruce: true },
      },
      ...('escuelas' in overrides && overrides.escuelas ? { escuelas: overrides.escuelas as NonNullable<TerritorioMapa['aislamiento']>['escuelas'] } : {}),
    },
    susceptibilidad: {
      fuente: 'physrisk', indicador: 'inundacion_fluvial', escenario: 'historico', unidad: 'm', periodoRetornoAnios: 100, fechaCorrida: '2026-01-01', licencia: 'licencia',
      escuelas: {
        a: { inundacionFluvialM: 1 }, b: { inundacionFluvialM: 0.5 }, c: { inundacionFluvialM: 0 },
      },
    },
  }
}

describe('planificacion', () => {
  it('clasifica las tres vistas, los umbrales históricos y la profundidad de inundación', () => {
    const t = territorio()
    const historial = [0, 1, 2, 3, 4, 5, 9]
    expect(historial.map((cantidad) => nivelPlanificacion({ cueAnexo: 'x', situacionesHistoricas: cantidad }, 'historial', { territorio: null }))).toEqual([0, 1, 1, 2, 2, 3, 3])
    expect([0, 0.49, 0.5, 0.99, 1, null].map((valor, i) => nivelPlanificacion(
      { cueAnexo: `i${i}`, situacionesHistoricas: 0 }, 'inundacion', {
        territorio: { ...t, susceptibilidad: { ...t.susceptibilidad!, escuelas: { [`i${i}`]: { inundacionFluvialM: valor } } } },
      },
    ))).toEqual([0, 1, 2, 2, 3, 0])
    expect(nivelPlanificacion({ cueAnexo: 'a', situacionesHistoricas: 0 }, 'aisladas', { territorio: t })).toBe(3)
    expect(nivelPlanificacion({ cueAnexo: 'b', situacionesHistoricas: 0 }, 'aisladas', { territorio: t })).toBe(0)
    expect(nivelPlanificacion({ cueAnexo: 'a', situacionesHistoricas: 0 }, 'aisladas', { territorio: null })).toBe(0)
  })

  it('ordena por nivel, luego por la métrica de la vista y finalmente por nombre', () => {
    const t = territorio()
    expect(prioridadPlanificacion(escuelas, 'historial', { territorio: t }).map(({ escuela }) => escuela.cueAnexo)).toEqual(['b', 'a'])
    expect(prioridadPlanificacion(escuelas, 'aisladas', { territorio: t }).map(({ escuela }) => escuela.cueAnexo)).toEqual(['a', 'c'])
    expect(prioridadPlanificacion(escuelas, 'inundacion', { territorio: t }).map(({ escuela }) => escuela.cueAnexo)).toEqual(['a', 'b'])
    expect(ETIQUETA_NIVEL_PLAN[2]).toBe('Medio')

    const empatadas = [
      { ...escuelas[0], cueAnexo: 'z', nombre: 'Zulu', situacionesHistoricas: 3, alumnos: 20 },
      { ...escuelas[0], cueAnexo: 'b', nombre: 'Beta', situacionesHistoricas: 4, alumnos: 20 },
      { ...escuelas[0], cueAnexo: 'a', nombre: 'Alfa', situacionesHistoricas: 4, alumnos: 20 },
    ]
    expect(prioridadPlanificacion(empatadas, 'historial', { territorio: null }).map(({ escuela }) => escuela.cueAnexo)).toEqual(['a', 'b', 'z'])
    expect(prioridadPlanificacion(empatadas, 'aisladas', {
      territorio: { ...t, aislamiento: { ...t.aislamiento!, escuelas: Object.fromEntries(empatadas.map(({ cueAnexo }) => [cueAnexo, { nivel: 1, cruces: 0, conPuente: 0, sinPuente: 0, alternativaSinCruce: true }])) } },
    }).map(({ escuela }) => escuela.cueAnexo)).toEqual(['a', 'b', 'z'])
  })

  it('redacta la cantidad histórica en singular o plural y el nivel para las otras vistas', () => {
    const uno = { escuela: { ...escuelas[0], situacionesHistoricas: 1 }, nivel: 1 as const }
    const varios = { escuela: { ...escuelas[1], situacionesHistoricas: 5 }, nivel: 3 as const }
    expect(textoPrioridad(uno, 'historial')).toBe('1 situación')
    expect(textoPrioridad(varios, 'historial')).toBe('5 situaciones')
    expect(textoPrioridad(varios, 'aisladas')).toBe('Alto')
  })

  it('asigna colores por nivel y devuelve un color para todas las escuelas', () => {
    const colores = coloresPlanificacion(escuelas, 'historial', { territorio: null })
    const niveles: NivelPlanificacion[] = [0, 1, 2, 3]
    expect([...colores.keys()]).toEqual(['a', 'b', 'c'])
    expect(new Set(niveles.map(colorNivelPlan)).size).toBe(4)
    expect(colores.get('c')).toBe(colorNivelPlan(0))
  })
})
