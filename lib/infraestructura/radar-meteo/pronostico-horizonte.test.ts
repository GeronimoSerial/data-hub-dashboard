import { describe, expect, it } from 'vitest'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { DiaResumen, HoraResumen } from './use-resumen-radar-meteo'
import { pronosticoPorHorizonte } from './pronostico-horizonte'

type Departamento = {
  id: string
  nombre: string
  dias: DiaResumen[]
  proximas48h: HoraResumen[]
}

function crearDia(fecha: string, cambios: Partial<DiaResumen> = {}): DiaResumen {
  return {
    fecha,
    lluvia24h: 0,
    lluviaLocalMax: 0,
    rafagaMaxKmh: 0,
    picoHora: null,
    tormenta: false,
    granizoMax: null,
    cobertura: 100,
    resaltado: { lluvia: null, rafaga: null },
    ensamble: null,
    ...cambios,
  }
}

function crearHora(probabilidadMax: number | null): HoraResumen {
  return {
    hora: '2026-10-06T00:00:00Z',
    lluviaMm: 0,
    rafagaMaxKmh: 0,
    probabilidadMax,
    cobertura: 100,
  }
}

function crearDepartamento(
  id: string,
  nombre: string,
  lluvias: Array<number | null>,
  opciones: { rafagas?: Array<number | null>; granizoEn?: number[]; probabilidades?: Array<number | null> } = {},
): Departamento {
  return {
    id,
    nombre,
    dias: lluvias.map((lluvia24h, indice) => crearDia(`2026-10-${String(indice + 6).padStart(2, '0')}`, {
      lluvia24h,
      rafagaMaxKmh: opciones.rafagas?.[indice] ?? null,
      granizoMax: opciones.granizoEn?.includes(indice) ? 1 : null,
    })),
    proximas48h: (opciones.probabilidades ?? []).map(crearHora),
  }
}

function calcular(departamentos: Departamento[], horizonte: HorizonteMotor) {
  return pronosticoPorHorizonte({ departamentos }, horizonte)
}

describe('pronosticoPorHorizonte', () => {
  const departamentos: Departamento[] = [
    crearDepartamento('a', 'Alfa', [12, 9, 0, 5], {
      rafagas: [20, 31, 45, 22],
      probabilidades: [...Array.from({ length: 24 }, () => 10), ...Array.from({ length: 24 }, () => 35)],
    }),
    crearDepartamento('b', 'Beta', [20, null, null, null], {
      rafagas: [70, null, null, null],
      granizoEn: [2],
      probabilidades: Array.from({ length: 48 }, () => 20),
    }),
    crearDepartamento('c', 'Gamma', [null, null, null, null], {
      probabilidades: Array.from({ length: 48 }, () => null),
    }),
  ]

  it('usa sólo el primer día para el horizonte de 24 h', () => {
    const resultado = calcular(departamentos, 24)

    expect(resultado.dias).toBe(1)
    expect(resultado.filas.map(({ id, lluviaMm }) => [id, lluviaMm])).toEqual([
      ['b', 20], ['a', 12], ['c', null],
    ])
    expect(resultado.filas.map(({ id, probabilidadMax }) => [id, probabilidadMax])).toEqual([
      ['b', 20], ['a', 10], ['c', null],
    ])
  })

  it('suma tres días para 72 h y usa sus primeras 48 horas para probabilidad', () => {
    const resultado = calcular(departamentos, 72)

    expect(resultado.dias).toBe(3)
    expect(resultado.filas.map(({ id, lluviaMm }) => [id, lluviaMm])).toEqual([
      ['a', 21], ['b', 20], ['c', null],
    ])
    expect(resultado.filas.map(({ id, probabilidadMax }) => [id, probabilidadMax])).toEqual([
      ['a', 35], ['b', 20], ['c', null],
    ])
  })

  it('usa todos los días disponibles, ignora nulos y redondea la suma', () => {
    const resultado = calcular([
      crearDepartamento('a', 'Alfa', [0.14, 0.16, null, 0.25]),
      crearDepartamento('b', 'Beta', [null, null, null, null]),
    ], 240)

    expect(resultado.dias).toBe(4)
    expect(resultado.filas.map(({ id, lluviaMm }) => [id, lluviaMm])).toEqual([
      ['a', 0.6], ['b', null],
    ])
  })

  it('cuenta umbral exacto, mayor ráfaga y departamentos con granizo', () => {
    const resultado = calcular(departamentos, 240)

    expect(resultado.conLluvia20mm).toBe(2)
    expect(resultado.rafagaMax).toEqual({ kmh: 70, departamento: 'Beta' })
    expect(resultado.conGranizo).toBe(1)
  })

  it('cuenta 20 mm y excluye 19,9 mm', () => {
    const resultado = calcular([
      crearDepartamento('exacto', 'Exacto', [20]),
      crearDepartamento('menor', 'Menor', [19.9]),
    ], 24)

    expect(resultado.conLluvia20mm).toBe(1)
  })

  it('devuelve un resumen vacío sin departamentos', () => {
    expect(calcular([], 72)).toEqual({
      dias: 0,
      filas: [],
      conLluvia20mm: 0,
      rafagaMax: null,
      conGranizo: 0,
    })
  })
})
