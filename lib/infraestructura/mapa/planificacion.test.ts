import { describe, expect, it } from 'vitest'
import {
  colorNivelPlan,
  colorPrioridad,
  coloresPlanificacion,
  ETIQUETA_NIVEL_PLAN,
  ETIQUETA_VISTA,
  nivelesLeyendaPlanificacion,
  nivelPlanificacion,
  parsearVistaPlanificacion,
  prioridadPlanificacion,
  textoPrioridad,
  VISTAS_ESTRUCTURALES,
  VISTAS_PLANIFICACION,
} from './planificacion'
import type { EscuelaMapaEnriquecida } from './tipos'
import type { NivelPlanificacion } from './planificacion'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'

const escuelas: EscuelaMapaEnriquecida[] = [
  { cueAnexo: 'a', nombre: 'Escuela Zeta', departamento: 'Goya', localidad: 'Centro', lat: null, lon: null, niveles: ['Primario'], alumnos: 10, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 2, solucionadasRecientes: 0 },
  { cueAnexo: 'b', nombre: 'Escuela Beta', departamento: 'Bella Vista', localidad: 'Centro', lat: null, lon: null, niveles: ['Inicial'], alumnos: 30, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 5, solucionadasRecientes: 0 },
  { cueAnexo: 'c', nombre: 'Escuela Alfa', departamento: 'Ituzaingó', localidad: 'Centro', lat: null, lon: null, niveles: ['Secundario'], alumnos: 30, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 0, solucionadasRecientes: 0 },
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
        a: { inundacionFluvialM: 1, claseRio: 'alto', juntoLaguna: null },
        b: { inundacionFluvialM: 0.5, claseRio: 'medio', juntoLaguna: null },
        c: { inundacionFluvialM: 0, claseRio: 'sin_riesgo', juntoLaguna: null },
      },
    },
  }
}

describe('planificacion', () => {
  it('ofrece Riesgo hoy primero, luego Aislamiento e Historial, sin Inundación', () => {
    expect(VISTAS_PLANIFICACION).toEqual(['riesgo', 'aisladas', 'historial'])
    expect(VISTAS_ESTRUCTURALES).toEqual(['aisladas', 'historial'])
    expect(VISTAS_PLANIFICACION.map((vista) => ETIQUETA_VISTA[vista])).toEqual(['Riesgo hoy', 'Aislamiento', 'Historial'])
  })

  it('lee la vista guardada y lleva la vieja Inundación a Riesgo hoy', () => {
    expect(parsearVistaPlanificacion('aisladas')).toBe('aisladas')
    expect(parsearVistaPlanificacion('riesgo')).toBe('riesgo')
    expect(parsearVistaPlanificacion('inundacion')).toBe('riesgo')
    expect(parsearVistaPlanificacion('otra')).toBeNull()
    expect(parsearVistaPlanificacion(null)).toBeNull()
    expect(parsearVistaPlanificacion(undefined)).toBeNull()
  })

  it('clasifica las vistas estructurales y los umbrales históricos', () => {
    const t = territorio()
    const historial = [0, 1, 2, 3, 4, 5, 9]
    expect(historial.map((cantidad) => nivelPlanificacion({ cueAnexo: 'x', situacionesHistoricas: cantidad }, 'historial', { territorio: null }))).toEqual([0, 1, 1, 2, 2, 3, 3])
    expect(nivelPlanificacion({ cueAnexo: 'a', situacionesHistoricas: 0 }, 'aisladas', { territorio: t })).toBe(3)
    expect(nivelPlanificacion({ cueAnexo: 'b', situacionesHistoricas: 0 }, 'aisladas', { territorio: t })).toBe(0)
    expect(nivelPlanificacion({ cueAnexo: 'a', situacionesHistoricas: 0 }, 'aisladas', { territorio: null })).toBe(0)
  })

  it('ordena por nivel, luego por la métrica de la vista y finalmente por nombre', () => {
    const t = territorio()
    expect(prioridadPlanificacion(escuelas, 'historial', { territorio: t }).map(({ escuela }) => escuela.cueAnexo)).toEqual(['b', 'a'])
    expect(prioridadPlanificacion(escuelas, 'aisladas', { territorio: t }).map(({ escuela }) => escuela.cueAnexo)).toEqual(['a']) // c es Bajo: oculta
    expect(ETIQUETA_NIVEL_PLAN[2]).toBe('Medio')

    const empatadas = [
      { ...escuelas[0], cueAnexo: 'z', nombre: 'Zulu', situacionesHistoricas: 3, alumnos: 20 },
      { ...escuelas[0], cueAnexo: 'b', nombre: 'Beta', situacionesHistoricas: 4, alumnos: 20 },
      { ...escuelas[0], cueAnexo: 'a', nombre: 'Alfa', situacionesHistoricas: 4, alumnos: 20 },
    ]
    expect(prioridadPlanificacion(empatadas, 'historial', { territorio: null }).map(({ escuela }) => escuela.cueAnexo)).toEqual(['a', 'b', 'z'])
    expect(prioridadPlanificacion(empatadas, 'aisladas', {
      territorio: { ...t, aislamiento: { ...t.aislamiento!, escuelas: Object.fromEntries(empatadas.map(({ cueAnexo }) => [cueAnexo, { nivel: 2, cruces: 0, conPuente: 0, sinPuente: 0, alternativaSinCruce: true }])) } },
    }).map(({ escuela }) => escuela.cueAnexo)).toEqual(['a', 'b', 'z'])
  })

  it('redacta la cantidad histórica en singular o plural y el nivel para las otras vistas', () => {
    const uno = { escuela: { ...escuelas[0], situacionesHistoricas: 1 }, nivel: 1 as const }
    const varios = { escuela: { ...escuelas[1], situacionesHistoricas: 5 }, nivel: 3 as const }
    expect(textoPrioridad(uno, 'historial')).toBe('1 situación')
    expect(textoPrioridad(varios, 'historial')).toBe('5 situaciones')
    expect(textoPrioridad(varios, 'aisladas')).toBe('Alto')
  })

  it('colorea cada fila con el color de su nivel', () => {
    expect(colorPrioridad({ nivel: 3 })).toBe(colorNivelPlan(3))
    expect(colorPrioridad({ nivel: 2 })).toBe(colorNivelPlan(2))
  })

  it('asigna colores sólo a niveles con dato', () => {
    const colores = coloresPlanificacion(escuelas, 'historial', { territorio: null })
    const niveles: NivelPlanificacion[] = [0, 1, 2, 3]
    expect([...colores.keys()]).toEqual(['a', 'b'])
    expect(new Set(niveles.map(colorNivelPlan)).size).toBe(4)
    expect(colores.has('c')).toBe(false)
  })

  it('la leyenda de Aisladas sólo lista Alto y Medio; Historial lista todos', () => {
    expect(nivelesLeyendaPlanificacion('aisladas')).toEqual([3, 2])
    expect(nivelesLeyendaPlanificacion('historial')).toEqual([3, 2, 1, 0])
  })
})
