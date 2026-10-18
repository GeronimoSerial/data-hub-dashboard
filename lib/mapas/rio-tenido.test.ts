import { describe, expect, it } from 'vitest'
import { PALETA_ESTADO_ALTURA } from './paleta-tonal'
import { celdasRio, colorRioTenido, estadoTenido, type EstacionTenido } from './rio-tenido'

const est = (rio: 'parana' | 'uruguay', lat: number, lon: number, estado: EstacionTenido['estado'] = 'normal', extra: Partial<EstacionTenido> = {}): EstacionTenido => ({
  rio, lat, lon, estado, lectura: { lecturaM: 1 }, lecturaVencida: false, ...extra,
})

// Ray casting; enough to check which cell owns a point.
function dentro([x, y]: [number, number], anillo: number[][]): boolean {
  let adentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) adentro = !adentro
  }
  return adentro
}

describe('estadoTenido', () => {
  it('paints stale or missing readings as sin dato', () => {
    expect(estadoTenido(est('parana', 0, 0, 'alerta', { lecturaVencida: true }))).toBe('sin_dato')
    expect(estadoTenido(est('parana', 0, 0, 'alerta', { lectura: null }))).toBe('sin_dato')
    expect(estadoTenido(est('parana', 0, 0, 'alerta'))).toBe('alerta')
  })
})

describe('celdasRio', () => {
  const estaciones = [est('parana', -27.4, -58.8, 'alerta'), est('parana', -28.5, -59.1, 'normal'), est('parana', -29.2, -59.6, 'evacuacion'), est('uruguay', -29.7, -57.1)]

  it('builds one closed cell per station, split per river', () => {
    const celdas = celdasRio(estaciones)
    expect(celdas.filter((c) => c.rio === 'parana')).toHaveLength(3)
    expect(celdas.filter((c) => c.rio === 'uruguay')).toHaveLength(1)
    for (const celda of celdas) {
      const anillo = celda.poligono.coordinates[0]
      expect(anillo[0]).toEqual(anillo[anillo.length - 1])
    }
  })

  it('sets the boundary between neighbours at their midpoint along the river', () => {
    const [norte, centro] = celdasRio(estaciones)
    expect(dentro([-58.9, -27.9], norte.poligono.coordinates[0])).toBe(true)
    expect(dentro([-59.0, -28.1], centro.poligono.coordinates[0])).toBe(true)
    expect(dentro([-59.0, -28.1], norte.poligono.coordinates[0])).toBe(false)
  })

  it('a lone station owns a cell wide enough for the whole course', () => {
    const [unica] = celdasRio([est('uruguay', -29.7, -57.1)])
    expect(dentro([-55.7, -27.3], unica.poligono.coordinates[0])).toBe(true)
    expect(dentro([-58.4, -31.5], unica.poligono.coordinates[0])).toBe(true)
  })
})

describe('colorRioTenido', () => {
  it('is transparent without stations', () => {
    expect(colorRioTenido([])).toBe('rgba(0,0,0,0)')
  })

  it('maps each cell to its state colour and falls back to transparent', () => {
    const expresion = colorRioTenido(celdasRio([est('parana', -27.4, -58.8, 'alerta')])) as unknown[]
    expect(expresion[0]).toBe('case')
    expect(JSON.stringify(expresion[1])).toContain('"within"')
    expect(JSON.stringify(expresion[1])).toContain('Paraná')
    expect(expresion[2]).toBe(PALETA_ESTADO_ALTURA.alerta)
    expect(expresion.at(-1)).toBe('rgba(0,0,0,0)')
  })
})
