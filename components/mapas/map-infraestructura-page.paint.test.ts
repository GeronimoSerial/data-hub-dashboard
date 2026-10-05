import { describe, expect, it } from 'vitest'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { paintPuntosRiesgoAcceso } from '@/lib/mapas/peligro-capas'
import {
  circlePaintPartes,
  circlePaintEscuelasSinReporte,
  circlePaintCluster,
  colorPorSeveridadRango,
  colorTextoCluster,
  expresionConteoCluster,
  expresionRadioClusterSinReporte,
  filtroIconoEscuelaAfectada,
  filtroIconoEscuelaSolucionada,
  expresionRadioCluster,
  RADIO_CLUSTER_MAYOR,
  RADIO_CLUSTER_MEDIO,
  RADIO_CLUSTER_MENOR,
} from './map-infraestructura-page'

describe('colorPorSeveridadRango', () => {
  it('es una expresión `case` con la guarda de sin afectación, los pares condición/color y el color de Baja como default', () => {
    const expresion = colorPorSeveridadRango(false) as unknown[]
    expect(expresion[0]).toBe('case')
    // Guarda de cluster sin escuelas afectadas, tres rangos de gravedad y
    // color de Baja como default.
    expect(expresion.length).toBe(2 + 2 * SEVERIDADES.length)
    expect(expresion[1]).toEqual(['==', ['get', 'escuelasAfectadas'], 0])
    expect(expresion[2]).toBe('#ffffff')
    expect(expresion[expresion.length - 1]).toBe(colorSeveridad('Baja'))
  })

  it('la gravedad más alta presente gana según la escala del padrón', () => {
    const expresion = colorPorSeveridadRango(false) as unknown[]
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

  it('con 0 escuelas afectadas en el cluster el color es el fondo del tema', () => {
    const expresion = colorPorSeveridadRango(false) as unknown[]
    expect(evaluarColorCluster(expresion, { escuelasAfectadas: 0, gravedad: 0 })).toBe('#ffffff')
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
    expect(paint['circle-radius']).toEqual([
      'interpolate', ['linear'], ['zoom'],
      6, ['case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], 3, ['case', ['==', ['get', 'gravedad'], 0], 5, 8]],
      10, ['case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], 5, ['case', ['==', ['get', 'gravedad'], 0], 5, 8]],
      14, ['case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], 6, ['case', ['==', ['get', 'gravedad'], 0], 5, 8]],
    ])
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
    expect(paint['circle-stroke-width']).toEqual(['case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], 1.5, 1])
    expect(paint['circle-stroke-color']).toEqual([
      'case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], '#8a8886', '#1c1c1c',
    ])
    // El estado del servicio pasó al badge de íconos (V2): el paint del punto
    // ya no debe tener ninguna expresión data-driven sobre `servicio`.
    expect(paint).not.toHaveProperty('circle-stroke-opacity')
  })
})

describe('estilo de escuelas sin reporte', () => {
  function evaluarInterpolacionZoom(expresion: unknown[], zoom: number): number {
    expect(expresion[0]).toBe('interpolate')
    expect(expresion[1]).toEqual(['linear'])
    const paradas = expresion.slice(3) as number[]
    for (let i = 0; i < paradas.length - 2; i += 2) {
      const desde = paradas[i]
      const valorDesde = paradas[i + 1]
      const hasta = paradas[i + 2]
      const valorHasta = paradas[i + 3]
      if (zoom <= hasta) {
        const proporcion = (zoom - desde) / (hasta - desde)
        return valorDesde + (valorHasta - valorDesde) * proporcion
      }
    }
    return paradas[paradas.length - 1]
  }

  it('escala suavemente por zoom y siempre queda menor que el radio de las afectadas', () => {
    const paint = circlePaintEscuelasSinReporte(false)!
    const radio = paint['circle-radius'] as unknown[]
    for (const [zoom, esperado] of [[6, 3], [8, 4], [10, 5], [12, 5.5], [14, 6]]) {
      expect(evaluarInterpolacionZoom(radio, zoom)).toBeCloseTo(esperado)
      expect(evaluarInterpolacionZoom(radio, zoom)).toBeLessThan(8)
    }
  })

  it('usa el fondo del tema, borde token neutro de 1.5 px y opacidad plena', () => {
    const claro = circlePaintEscuelasSinReporte(false)!
    const oscuro = circlePaintEscuelasSinReporte(true)!
    expect(claro['circle-color']).toBe('#ffffff')
    expect(claro['circle-stroke-color']).toBe('#8a8886')
    expect(claro['circle-stroke-width']).toBe(1.5)
    expect(claro['circle-opacity']).toBe(1)
    expect(oscuro['circle-color']).toBe('#000000')
    expect(oscuro['circle-stroke-color']).toBe('#9b9895')
  })
})

describe('clusters sin reporte', () => {
  function evaluarPaint(
    expresion: unknown,
    props: Record<string, number>,
    zoom = 10,
  ): unknown {
    if (!Array.isArray(expresion)) return expresion
    const op = expresion[0]
    if (op === 'literal') return expresion[1]
    if (op === 'to-string') return String(evaluarPaint(expresion[1], props, zoom))
    if (op === 'get') return props[expresion[1] as string]
    if (op === '==') return evaluarPaint(expresion[1], props, zoom) === expresion[2]
    if (op === '<=') return (evaluarPaint(expresion[1], props, zoom) as number) <= (expresion[2] as number)
    if (op === 'case') {
      for (let i = 1; i < expresion.length - 1; i += 2) {
        if (evaluarPaint(expresion[i], props, zoom)) return evaluarPaint(expresion[i + 1], props, zoom)
      }
      return evaluarPaint(expresion[expresion.length - 1], props, zoom)
    }
    if (op === 'step') {
      let valor = evaluarPaint(expresion[2], props, zoom)
      const entrada = evaluarPaint(expresion[1], props, zoom) as number
      for (let i = 3; i < expresion.length; i += 2) {
        if (entrada < (expresion[i] as number)) break
        valor = evaluarPaint(expresion[i + 1], props, zoom)
      }
      return valor
    }
    if (op === 'interpolate') {
      const entrada = zoom
      for (let i = 3; i < expresion.length - 2; i += 2) {
        const desde = expresion[i] as number
        const valorDesde = expresion[i + 1] as number
        const hasta = expresion[i + 2] as number
        const valorHasta = expresion[i + 3] as number
        if (entrada <= hasta) return valorDesde + ((entrada - desde) / (hasta - desde)) * (valorHasta - valorDesde)
      }
      return expresion[expresion.length - 1]
    }
    return expresion
  }

  function evaluarStep(expresion: unknown[], pointCount: number): number {
    expect(expresion[0]).toBe('step')
    let valor = expresion[2] as number
    for (let i = 3; i < expresion.length; i += 2) {
      if (pointCount < (expresion[i] as number)) break
      valor = expresion[i + 1] as number
    }
    return valor
  }

  it('usa radios neutros escalonados siempre menores que el cluster afectado menor', () => {
    const radios = expresionRadioClusterSinReporte() as unknown[]
    for (const count of [1, 9, 10, 49, 50, 100]) {
      expect(evaluarStep(radios, count)).toBeLessThan(RADIO_CLUSTER_MENOR)
    }
    expect([1, 10, 50].map((count) => evaluarStep(radios, count))).toEqual([10, 12, 14])
    const paint = circlePaintCluster(false)!
    expect(paint['circle-color']).toEqual(colorPorSeveridadRango(false))
    expect(paint['circle-stroke-color']).toEqual([
      'case', ['==', ['get', 'escuelasAfectadas'], 0], '#8a8886', '#1c1c1c',
    ])
    expect(paint['circle-stroke-width']).toEqual([
      'case', ['==', ['get', 'escuelasAfectadas'], 0], 1.5, 1,
    ])
    for (const point_count of [1, 10, 50]) {
      const radio = evaluarPaint(paint['circle-radius'], { escuelasAfectadas: 0, point_count })
      expect(radio).toBeLessThan(RADIO_CLUSTER_MENOR)
      expect(evaluarPaint(paint['circle-radius'], { escuelasAfectadas: 1, point_count })).toBeGreaterThan(radio as number)
    }
  })

  it('muestra point_count en neutro y usa --ink-soft para el texto sin reporte', () => {
    const conteo = expresionConteoCluster()
    const claro = colorTextoCluster(false)
    const oscuro = colorTextoCluster(true)
    expect(conteo[0]).toBe('to-string')
    expect(evaluarPaint(conteo, { escuelasAfectadas: 0, point_count: 12 })).toBe('12')
    expect(evaluarPaint(conteo, { escuelasAfectadas: 4, point_count: 8 })).toBe('4')
    expect(evaluarPaint(claro, { escuelasAfectadas: 0, severidadRango: 0 })).toBe('#5f5e5c')
    expect(evaluarPaint(oscuro, { escuelasAfectadas: 0, severidadRango: 0 })).toBe('#c9c6c3')
  })
})

describe('filtro del ícono de escuela', () => {
  function evaluarFiltro(expresion: unknown[], propiedades: Record<string, unknown>): boolean {
    const [op, ...args] = expresion
    if (op === 'all') return args.every((parte) => evaluarFiltro(parte as unknown[], propiedades))
    if (op === '!') return !evaluarFiltro(args[0] as unknown[], propiedades)
    if (op === 'has') return args[0] === 'point_count' && 'point_count' in propiedades
    if (op === '==') {
      const consulta = args[0] as unknown[]
      return propiedades[consulta[1] as string] === args[1]
    }
    throw new Error(`Operador de filtro no soportado: ${String(op)}`)
  }

  it('incluye escuelas individuales afectadas y excluye las sin reporte y los clusters', () => {
    const filtro = filtroIconoEscuelaAfectada() as unknown[]
    expect(evaluarFiltro(filtro, { estado: 'afectada' })).toBe(true)
    expect(evaluarFiltro(filtro, { estado: 'sin_afectacion_reportada' })).toBe(false)
    expect(evaluarFiltro(filtro, { estado: 'afectada', point_count: 7 })).toBe(false)
  })

  it('incluye sólo escuelas individuales con situación solucionada recientemente', () => {
    const filtro = filtroIconoEscuelaSolucionada() as unknown[]
    expect(evaluarFiltro(filtro, { solucionadaReciente: true })).toBe(true)
    expect(evaluarFiltro(filtro, { solucionadaReciente: false })).toBe(false)
    expect(evaluarFiltro(filtro, { solucionadaReciente: true, point_count: 7 })).toBe(false)
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
