import { describe, expect, it } from 'vitest'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { COLOR_SIN_AFECTACION } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'
import { paintPuntosRiesgoAcceso } from '@/lib/mapas/peligro-capas'
import {
  circlePaintPartes,
  colorPorSeveridadRango,
  expresionRadioCluster,
  RADIO_CLUSTER_MAYOR,
  RADIO_CLUSTER_MEDIO,
  RADIO_CLUSTER_MENOR,
} from './map-infraestructura-page'

describe('colorPorSeveridadRango', () => {
  it('es una expresión `case` con la guarda de sin afectación, los pares condición/color y el color de Baja como default', () => {
    const expresion = colorPorSeveridadRango() as unknown[]
    expect(expresion[0]).toBe('case')
    // Guarda de cluster sin escuelas afectadas, tres rangos de gravedad,
    // gravedad 0 neutra y color de Baja como default.
    expect(expresion.length).toBe(4 + 2 * SEVERIDADES.length)
    expect(expresion[1]).toEqual(['==', ['get', 'escuelasAfectadas'], 0])
    expect(expresion[2]).toBe(COLOR_SIN_AFECTACION)
    expect(expresion[expresion.length - 1]).toBe(colorSeveridad('Baja'))
  })

  it('la gravedad más alta presente gana según la escala del padrón', () => {
    const expresion = colorPorSeveridadRango() as unknown[]
    for (let i = 1; i < SEVERIDADES.length; i++) {
      // Los pares de gravedad arrancan después de la guarda de cluster.
      const indiceCondicion = 3 + (i - 1) * 2
      expect(expresion[indiceCondicion]).toEqual([
        '>=',
        ['get', 'gravedad'],
        SEVERIDADES.length - i + 1,
      ])
      expect(expresion[indiceCondicion + 1]).toBe(
        colorSeveridad(SEVERIDADES[SEVERIDADES.length - i]),
      )
    }
  })

  function evaluarColorCluster(
    expresion: unknown[],
    props: { escuelasAfectadas: number; gravedad: number },
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

  it('con 0 escuelas afectadas en el cluster el color es el gris neutro', () => {
    const expresion = colorPorSeveridadRango() as unknown[]
    expect(evaluarColorCluster(expresion, { escuelasAfectadas: 0, gravedad: 0 })).toBe(
      COLOR_SIN_AFECTACION,
    )
  })

  it('con al menos una escuela afectada el color es el de su severidad', () => {
    const expresion = colorPorSeveridadRango() as unknown[]
    expect(
      evaluarColorCluster(expresion, {
        escuelasAfectadas: 1,
        gravedad: 3,
      }),
    ).toBe(colorSeveridad('Alta'))
    expect(
      evaluarColorCluster(expresion, {
        escuelasAfectadas: 1,
        gravedad: 1,
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
  it('el radio usa la gravedad y declara todas las claves del paint del punto', () => {
    const paint = circlePaintPartes()!
    expect(paint['circle-radius']).toEqual(['case', ['==', ['get', 'gravedad'], 0], 5, 8])
    expect(Object.keys(paint).sort()).toEqual([
      'circle-color',
      'circle-opacity',
      'circle-radius',
      'circle-stroke-color',
      'circle-stroke-width',
    ])
  })

  it('el borde usa gris neutro para gravedad 0 y no codifica el servicio', () => {
    const paint = circlePaintPartes()!
    expect(paint['circle-stroke-width']).toBe(1)
    expect(paint['circle-stroke-color']).toEqual([
      'case', ['==', ['get', 'gravedad'], 0], COLOR_SIN_AFECTACION, '#1c1c1c',
    ])
    // El estado del servicio pasó al badge de íconos (V2): el paint del punto
    // ya no debe tener ninguna expresión data-driven sobre `servicio`.
    expect(paint).not.toHaveProperty('circle-stroke-opacity')
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
    expect(evaluarMatch(expresion, 'bajo')).toBe('#eff6ff')
    expect(evaluarMatch(expresion, 'moderado')).toBe('#93c5fd')
    expect(evaluarMatch(expresion, 'alto')).toBe('#3b82f6')
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
