import { describe, expect, it } from 'vitest'
import { crearSerieDiaria, fechaDeIndice, indiceDia, type FilaDiaria } from './hidrologia/analogos'
import { ESTACION_AGUAS_ARRIBA_ONDA, construirEscenariosSubida, subidaP90Analogos, tendenciaEnSitio } from './escenarios-estacion'
import { ubicarEscuelaEnRio, type EstacionTransferencia } from './transferencia-nivel'
import type { LecturaPrefectura } from '../motor/escenarios-subida'

const AS_OF = '2026-10-18T02:15:04.000Z'

function serie(desde: string, hasta: string, desplazamientoM = 0): FilaDiaria[] {
  const filas: FilaDiaria[] = []
  for (let i = indiceDia(desde); i <= indiceDia(hasta); i++) {
    filas.push({ fecha: fechaDeIndice(i), valorM: 4 + desplazamientoM + 2 * Math.sin((2 * Math.PI * i) / 365) + 0.8 * Math.sin((2 * Math.PI * i) / 9) })
  }
  return filas
}

function diarias(desde: string, valores: number[]): LecturaPrefectura[] {
  const base = Date.parse(`${desde}T15:00:00Z`)
  return valores.map((v, i) => ({ medidaEn: new Date(base + i * 86_400_000).toISOString(), lecturaM: v }))
}

describe('subidaP90Analogos', () => {
  it('p90 de la subida máxima, no negativa y monótona con el horizonte', () => {
    const r = subidaP90Analogos(crearSerieDiaria(serie('2018-01-01', '2026-10-17')), '2026-10-17')!
    expect(r[24]).not.toBeNull()
    expect(r[24]!).toBeLessThanOrEqual(r[72]!)
    expect(r[72]!).toBeLessThanOrEqual(r[240]!)
    expect(r[240]!).toBeGreaterThan(0)
  })

  it('sin historia suficiente no hay análogos (null)', () => {
    expect(subidaP90Analogos(crearSerieDiaria(serie('2026-10-01', '2026-10-17')), '2026-10-17')).toBeNull()
  })
})

describe('construirEscenariosSubida', () => {
  it('la onda aguas arriba sólo existe para el Paraná aguas abajo de Corrientes', () => {
    expect(ESTACION_AGUAS_ARRIBA_ONDA.get('pna-empedrado')).toBe('pna-corrientes')
    expect(ESTACION_AGUAS_ARRIBA_ONDA.get('pna-esquina')).toBe('pna-goya')
    expect(ESTACION_AGUAS_ARRIBA_ONDA.has('pna-corrientes')).toBe(false)
    expect(ESTACION_AGUAS_ARRIBA_ONDA.has('pna-paso-de-los-libres')).toBe(false)
  })

  it('combina análogos de la serie A5 con tendencia y onda de Prefectura', () => {
    const r = construirEscenariosSubida({
      asOf: AS_OF,
      series: new Map([['pna-corrientes', serie('2018-01-01', '2026-10-17')]]),
      lecturas: new Map([
        ['pna-corrientes', diarias('2026-10-12', [5.43, 5.8, 6.2, 6.5, 6.75, 6.77])],
        ['pna-empedrado', diarias('2026-10-12', [4.94, 5.1, 5.25, 5.4, 5.55, 5.67])],
      ]),
    })
    const c = r.get('pna-corrientes')!
    expect(c.porHorizonte[240].analogosP90M).not.toBeNull()
    expect(c.tasaMediaM).toBeCloseTo(0.268, 3)
    expect(c.ondaM).toBeNull()
    const e = r.get('pna-empedrado')!
    expect(e.porHorizonte[240].analogosP90M).toBeNull()
    expect(e.estacionAguasArriba).toBe('pna-corrientes')
    expect(e.ondaM).toBeCloseTo(0.61, 3)
  })
})

describe('tendenciaEnSitio (zona modelada)', () => {
  const CORRIENTES: EstacionTransferencia = { estacionId: 'pna-corrientes', rio: 'parana', ceroM: 42.39, kmRio: 1208, coordenadas: { lat: -27.46, lon: -58.84 } }
  const EMPEDRADO: EstacionTransferencia = { estacionId: 'pna-empedrado', rio: 'parana', ceroM: 39.68, kmRio: 1140, coordenadas: { lat: -27.958948, lon: -58.820198 } }
  const u = ubicarEscuelaEnRio({
    punto: { lat: -27.46 + 0.5 * (-27.958948 + 27.46), lon: -58.84 + 0.5 * (-58.820198 + 58.84) },
    estacionTramoId: 'pna-corrientes',
    estaciones: [CORRIENTES, EMPEDRADO],
  })
  if (u.estado !== 'ubicada') throw new Error('no ubicada')

  it('una tendencia en subida alcanza la cota conservadora en 240 h pero no en 24 h; en baja no alcanza', () => {
    const subiendo = construirEscenariosSubida({
      asOf: AS_OF,
      series: new Map(),
      lecturas: new Map([
        ['pna-corrientes', diarias('2026-10-12', [5.4, 5.6, 5.8, 6.0, 6.2, 6.4])],
        ['pna-empedrado', diarias('2026-10-12', [4.9, 5.1, 5.3, 5.5, 5.7, 5.9])],
      ]),
    })
    // Sitio a mitad de camino: (42,39 + 6,4 + 39,68 + 5,9) / 2 = 47,185 m hoy.
    const r = tendenciaEnSitio(u, subiendo, 48.5)!
    expect(r[24].alcanza).toBe(false)
    expect(r[240]).toMatchObject({ alcanza: true, cotaM: 48.5 })
    expect(r[240].nivelSitioM).toBeCloseTo(49.185, 1)
    const bajando = construirEscenariosSubida({
      asOf: AS_OF,
      series: new Map(),
      lecturas: new Map([
        ['pna-corrientes', diarias('2026-10-12', [6.4, 6.2, 6.0, 5.8, 5.6, 5.4])],
        ['pna-empedrado', diarias('2026-10-12', [5.9, 5.7, 5.5, 5.3, 5.1, 4.9])],
      ]),
    })
    expect(tendenciaEnSitio(u, bajando, 48.5)![240].alcanza).toBe(false)
  })

  it('sin nivel de Prefectura en alguna estación no hay escenario', () => {
    expect(tendenciaEnSitio(u, new Map(), 48)).toBeNull()
  })
})
