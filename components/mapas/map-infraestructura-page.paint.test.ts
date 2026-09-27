import { describe, expect, it } from 'vitest'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { UMBRAL_SIN_REPORTAR_HORAS } from '@/lib/infraestructura/umbrales'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { RADIO_DOT_BASE, rangoSeveridad } from '@/lib/mapas/severidad-visual'
import { COLOR_SIN_AFECTACION } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'
import { paintPuntosRiesgoAcceso } from '@/lib/mapas/peligro-capas'
import {
  circlePaintPartes,
  circlePaintSinReportar,
  colorPorSeveridadRango,
  construirFeatureCollection,
  esSinReportar,
  expresionRadioCluster,
  filtroClusterPartes,
  filtroPuntosPartes,
  RADIO_CLUSTER_MAYOR,
  RADIO_CLUSTER_MEDIO,
  RADIO_CLUSTER_MENOR,
  SIN_REPORTAR_RADIO_EXTRA,
} from './map-infraestructura-page'

const CUE = '1801605-04'

// Fixture base de un ParteMapa válido (ver lib/infraestructura/parte-mapa.ts
// para el contrato de campos). Cada test varía sólo lo que necesita con un
// spread `{ ...baseFixture, campo: valor }`.
const baseFixture: ParteMapa = {
  parteId: 'p1',
  cueAnexo: CUE,
  nombre: 'Escuela 1',
  departamento: 'Capital',
  localidad: 'Corrientes',
  lat: -27.47,
  lon: -58.83,
  servicio: 'normal',
  estadoEstablecimiento: 'habitual',
  peorSeveridad: 'Alta',
  categorias: ['establecimiento'],
  afectaciones: [],
  seccionesAlcanzadas: 0,
  alumnosAlcanzados: 0,
  rigeDesde: '2026-08-01T00:00:00Z',
  actualizadaEn: '2026-08-01T00:00:00Z',
}

describe('colorPorSeveridadRango', () => {
  it('es una expresión `case` con la guarda de sin afectación, los pares condición/color y el color de Baja como default', () => {
    const expresion = colorPorSeveridadRango() as unknown[]
    expect(expresion[0]).toBe('case')
    // 'case' + 1 par [condición, color] para "sin afectación" + (n-1) pares
    // [condición, color] de severidad + 1 default. Para n severidades la
    // longitud es 2 + 2n (par, no impar).
    expect(expresion.length).toBe(2 + 2 * SEVERIDADES.length)
    expect(expresion[1]).toEqual(['==', ['get', 'escuelasAfectadas'], 0])
    expect(expresion[2]).toBe(COLOR_SIN_AFECTACION)
    expect(expresion[expresion.length - 1]).toBe(colorSeveridad('Baja'))
  })

  it('la severidad más alta presente gana: pares condición/color en el orden real de SEVERIDADES', () => {
    const expresion = colorPorSeveridadRango() as unknown[]
    for (let i = 1; i < SEVERIDADES.length; i++) {
      // Los pares de severidad arrancan en el índice 3 (después de la guarda
      // de "sin afectación", que ocupa los índices 1 y 2).
      const indiceCondicion = 3 + (i - 1) * 2
      expect(expresion[indiceCondicion]).toEqual([
        '>=',
        ['get', 'severidadRango'],
        SEVERIDADES.length - i,
      ])
      expect(expresion[indiceCondicion + 1]).toBe(
        colorSeveridad(SEVERIDADES[SEVERIDADES.length - i]),
      )
    }
  })

  function evaluarColorCluster(
    expresion: unknown[],
    props: { escuelasAfectadas: number; severidadRango: number },
  ): string {
    // ['case', cond1, out1, cond2, out2, ..., default]
    for (let i = 1; i < expresion.length - 1; i += 2) {
      const [op, ...args] = expresion[i] as [string, ...unknown[]]
      let cumple = false
      if (op === '==') {
        const valor = props[(args[0] as unknown[])[1] as keyof typeof props]
        cumple = valor === args[1]
      } else if (op === '>=') {
        const valor = props[(args[0] as unknown[])[1] as keyof typeof props]
        cumple = (valor as number) >= (args[1] as number)
      }
      if (cumple) return expresion[i + 1] as string
    }
    return expresion[expresion.length - 1] as string
  }

  it('con 0 escuelas afectadas en el cluster el color es el gris neutro, sin importar severidadRango', () => {
    const expresion = colorPorSeveridadRango() as unknown[]
    expect(evaluarColorCluster(expresion, { escuelasAfectadas: 0, severidadRango: 0 })).toBe(
      COLOR_SIN_AFECTACION,
    )
  })

  it('con al menos una escuela afectada el color es el de su severidad', () => {
    const expresion = colorPorSeveridadRango() as unknown[]
    expect(
      evaluarColorCluster(expresion, {
        escuelasAfectadas: 1,
        severidadRango: rangoSeveridad('Alta'),
      }),
    ).toBe(colorSeveridad('Alta'))
    expect(
      evaluarColorCluster(expresion, {
        escuelasAfectadas: 1,
        severidadRango: rangoSeveridad('Baja'),
      }),
    ).toBe(colorSeveridad('Baja'))
  })
})

describe('expresionRadioCluster', () => {
  it('es una expresión `step` anclada en point_count con los radios reales del archivo', () => {
    const expresion = expresionRadioCluster() as unknown[]
    expect(expresion[0]).toBe('step')
    expect(expresion).toEqual([
      'step',
      ['get', 'point_count'],
      RADIO_CLUSTER_MENOR,
      10,
      RADIO_CLUSTER_MEDIO,
      50,
      RADIO_CLUSTER_MAYOR,
    ])
  })
})

describe('circlePaintPartes', () => {
  it('radio fijo RADIO_DOT_BASE y todas las claves del paint del punto', () => {
    const paint = circlePaintPartes()!
    expect(paint['circle-radius']).toBe(RADIO_DOT_BASE)
    expect(Object.keys(paint).sort()).toEqual([
      'circle-color',
      'circle-opacity',
      'circle-radius',
      'circle-stroke-color',
      'circle-stroke-opacity',
      'circle-stroke-width',
    ])
  })

  it('el anillo de servicio distingue suspendido/parcial del resto por grosor y opacidad', () => {
    const paint = circlePaintPartes()!
    expect(paint['circle-stroke-width']).toEqual([
      'match',
      ['get', 'servicio'],
      'suspendido',
      4,
      'parcial',
      2,
      1,
    ])
    expect(paint['circle-stroke-opacity']).toEqual([
      'match',
      ['get', 'servicio'],
      'suspendido',
      1,
      'parcial',
      0.55,
      0.9,
    ])
  })
})

describe('circlePaintSinReportar', () => {
  it('es un anillo más grande que el punto (RADIO_DOT_BASE + extra), sin relleno', () => {
    const paint = circlePaintSinReportar()!
    expect(paint['circle-radius']).toBe(RADIO_DOT_BASE + SIN_REPORTAR_RADIO_EXTRA)
    expect(paint['circle-color']).toBe('transparent')
  })
})

describe('esSinReportar', () => {
  const ahoraMs = Date.parse('2026-09-01T12:00:00Z')
  const umbralMs = UMBRAL_SIN_REPORTAR_HORAS * 60 * 60 * 1000

  it('devuelve true cuando actualizadaEn supera el umbral real de UMBRAL_SIN_REPORTAR_HORAS', () => {
    const parte = {
      ...baseFixture,
      actualizadaEn: new Date(ahoraMs - umbralMs - 60_000).toISOString(),
    }
    expect(esSinReportar(parte, ahoraMs)).toBe(true)
  })

  it('devuelve false cuando la actualización es reciente (dentro del umbral)', () => {
    const parte = { ...baseFixture, actualizadaEn: new Date(ahoraMs).toISOString() }
    expect(esSinReportar(parte, ahoraMs)).toBe(false)
  })

  it('el umbral es excluyente: exactamente en el límite todavía cuenta como reportado', () => {
    const parte = {
      ...baseFixture,
      actualizadaEn: new Date(ahoraMs - umbralMs).toISOString(),
    }
    expect(esSinReportar(parte, ahoraMs)).toBe(false)
  })
})

describe('construirFeatureCollection', () => {
  const ahoraMs = Date.parse('2026-09-01T12:00:00Z')
  const umbralMs = UMBRAL_SIN_REPORTAR_HORAS * 60 * 60 * 1000

  it('arma un Feature/Point con las coordenadas de lon/lat y las propiedades derivadas', () => {
    const parte = baseFixture
    const { features } = construirFeatureCollection([parte], ahoraMs)
    expect(features).toHaveLength(1)
    const feature = features[0]
    expect(feature.type).toBe('Feature')
    expect(feature.geometry.type).toBe('Point')
    expect(feature.geometry.coordinates).toEqual([parte.lon, parte.lat])
    expect(feature.properties.color).toBe(colorSeveridad(parte.peorSeveridad))
    expect(feature.properties.severidadRango).toBe(rangoSeveridad(parte.peorSeveridad))
  })

  it('marca esEvacuado sólo para evacuado/centro_evacuados, no para habitual', () => {
    const partes: ParteMapa[] = [
      { ...baseFixture, cueAnexo: 'a', estadoEstablecimiento: 'habitual' },
      { ...baseFixture, cueAnexo: 'b', estadoEstablecimiento: 'evacuado' },
      { ...baseFixture, cueAnexo: 'c', estadoEstablecimiento: 'centro_evacuados' },
    ]
    const { features } = construirFeatureCollection(partes, ahoraMs)
    expect(features.map((f) => [f.properties.cueAnexo, f.properties.esEvacuado])).toEqual([
      ['a', false],
      ['b', true],
      ['c', true],
    ])
  })

  it('marca sinReportar según el umbral real de actualizadaEn vs ahoraMs', () => {
    const partes: ParteMapa[] = [
      {
        ...baseFixture,
        cueAnexo: 'vieja',
        actualizadaEn: new Date(ahoraMs - umbralMs - 60_000).toISOString(),
      },
      {
        ...baseFixture,
        cueAnexo: 'reciente',
        actualizadaEn: new Date(ahoraMs).toISOString(),
      },
    ]
    const { features } = construirFeatureCollection(partes, ahoraMs)
    expect(features.map((f) => [f.properties.cueAnexo, f.properties.sinReportar])).toEqual([
      ['vieja', true],
      ['reciente', false],
    ])
  })

  it('filtra las partes sin lat o sin lon', () => {
    const partes: ParteMapa[] = [
      baseFixture,
      { ...baseFixture, cueAnexo: 'sin-lat', lat: null },
      { ...baseFixture, cueAnexo: 'sin-lon', lon: null },
    ]
    const { features } = construirFeatureCollection(partes, ahoraMs)
    expect(features.map((f) => f.properties.cueAnexo)).toEqual([baseFixture.cueAnexo])
  })
})

describe('filtroPuntosPartes', () => {
  it('con el padrón apagado sólo muestra escuelas afectadas', () => {
    expect(filtroPuntosPartes(false)).toEqual([
      'all',
      ['!', ['has', 'point_count']],
      ['==', ['get', 'estado'], 'afectada'],
    ])
  })

  it('con el padrón encendido no filtra por estado', () => {
    expect(filtroPuntosPartes(true)).toEqual(['!', ['has', 'point_count']])
  })
})

describe('filtroClusterPartes', () => {
  it('con el padrón apagado sólo muestra clusters con al menos una escuela afectada', () => {
    expect(filtroClusterPartes(false)).toEqual([
      'all',
      ['has', 'point_count'],
      ['>', ['get', 'escuelasAfectadas'], 0],
    ])
  })

  it('con el padrón encendido no filtra por escuelas afectadas', () => {
    expect(filtroClusterPartes(true)).toEqual(['has', 'point_count'])
  })
})

describe('paintPuntosRiesgoAcceso', () => {
  // Evalúa una expresión `match` de MapLibre:
  // ['match', ['get', k], v1, r1, v2, r2, ..., default] — recorre los pares
  // (valor, resultado) desde el índice 2 y devuelve el resultado del primer
  // valor que matchea; si ninguno matchea, devuelve el default (último).
  function evaluarMatch(expresion: unknown[], valor: string): unknown {
    for (let i = 2; i < expresion.length - 1; i += 2) {
      if (expresion[i] === valor) return expresion[i + 1]
    }
    return expresion[expresion.length - 1]
  }

  it('el circle-color es una expresión `match` sobre nivelAcceso', () => {
    const paint = paintPuntosRiesgoAcceso()!
    const expresion = paint['circle-color'] as unknown[]
    expect(expresion[0]).toBe('match')
    expect(expresion[1]).toEqual(['get', 'nivelAcceso'])
  })

  it('usa el color real de cada nivel y cae en el gris de fallback ante cualquier otro valor', () => {
    const paint = paintPuntosRiesgoAcceso()!
    const expresion = paint['circle-color'] as unknown[]
    expect(evaluarMatch(expresion, 'bajo')).toBe('#719c29')
    expect(evaluarMatch(expresion, 'moderado')).toBe('#facd05')
    expect(evaluarMatch(expresion, 'alto')).toBe('#f68e13')
    // 'sin_cobertura' (el `null` crudo nunca llega acá) y valores inesperados.
    expect(evaluarMatch(expresion, 'sin_cobertura')).toBe('#8a8886')
    expect(evaluarMatch(expresion, 'valor-inesperado')).toBe('#8a8886')
  })

  it('el nivel alto lleva un trazo más ancho que el resto (marca que no depende sólo del color)', () => {
    const paint = paintPuntosRiesgoAcceso()!
    const grosor = paint['circle-stroke-width'] as unknown[]
    expect(grosor[0]).toBe('match')
    expect(grosor[1]).toEqual(['get', 'nivelAcceso'])
    const grosorAlto = evaluarMatch(grosor, 'alto') as number
    expect(grosorAlto).toBeGreaterThan(evaluarMatch(grosor, 'bajo') as number)
    expect(grosorAlto).toBeGreaterThan(evaluarMatch(grosor, 'moderado') as number)
    expect(grosorAlto).toBeGreaterThan(evaluarMatch(grosor, 'sin_cobertura') as number)
  })
})
