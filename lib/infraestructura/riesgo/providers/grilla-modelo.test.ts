import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  agruparPorPuntoGrilla,
  clavePuntoGrilla,
  crearColaLotesPorPuntoGrilla,
  destinoDeRespuesta,
  empaquetarRefsPorPuntoGrilla,
  respuestaEnPuntoGrilla,
} from './grilla-modelo'

const fixture = JSON.parse(
  readFileSync(new URL('./__fixtures__/grilla-ifs025-celdas-prod-2026-10-18.json', import.meta.url), 'utf8'),
) as { celdas: Array<[string, string]> }

function celda(geometryRef: string) {
  const [lat, lon] = geometryRef.split('_').map(Number)
  return { geometryRef, lat, lon }
}

describe('clavePuntoGrilla', () => {
  it('ubica la celda de 0,1° en el punto más cercano de la grilla de 0,25°', () => {
    expect(clavePuntoGrilla(celda('-27.4_-58.8'))).toBe('-27.5_-58.75')
    expect(clavePuntoGrilla(celda('-27.3_-58.0'))).toBe('-27.25_-58')
    expect(clavePuntoGrilla(celda('-28.0_-58.9'))).toBe('-28_-59')
  })

  it('coincide con el punto que devolvió Open-Meteo para las 387 celdas de producción', () => {
    expect(fixture.celdas).toHaveLength(387)
    const distintas = fixture.celdas.filter(([ref, punto]) => clavePuntoGrilla(celda(ref)) !== punto)
    expect(distintas).toEqual([])
    expect(new Set(fixture.celdas.map(([, punto]) => punto)).size).toBe(130)
  })
})

describe('agruparPorPuntoGrilla', () => {
  it('agrupa las celdas del mismo punto manteniendo el orden de primera aparición', () => {
    const grupos = agruparPorPuntoGrilla(['-27.4_-58.8', '-28.0_-58.0', '-27.5_-58.7'].map(celda))
    expect(grupos.map((grupo) => grupo.clave)).toEqual(['-27.5_-58.75', '-28_-58'])
    expect(grupos[0].celdas.map((c) => c.geometryRef)).toEqual(['-27.4_-58.8', '-27.5_-58.7'])
  })
})

describe('respuestaEnPuntoGrilla', () => {
  it('confirma, rechaza o no opina según el lat/lon devuelto', () => {
    expect(respuestaEnPuntoGrilla('-27.5_-58.75', { latitude: -27.5, longitude: -58.75 })).toBe(true)
    expect(respuestaEnPuntoGrilla('-27.5_-58.75', { latitude: -27.75, longitude: -58.75 })).toBe(false)
    expect(respuestaEnPuntoGrilla('-27.5_-58.75', {})).toBeNull()
    expect(respuestaEnPuntoGrilla(null, { latitude: -27.5, longitude: -58.75 })).toBeNull()
  })
})

describe('destinoDeRespuesta y crearColaLotesPorPuntoGrilla', () => {
  it('replica a todo el grupo si el punto coincide y reencola los miembros si no', () => {
    const cola = crearColaLotesPorPuntoGrilla(
      ['-27.4_-58.8', '-27.5_-58.7', '-27.6_-58.8', '-28.0_-58.0'].map(celda),
      10,
    )
    const lote = cola.siguiente()
    expect(lote?.map((grupo) => grupo.celdas.length)).toEqual([3, 1])

    const [grupoA, grupoB] = lote!
    expect(destinoDeRespuesta(grupoB, { latitude: -28, longitude: -58 }).destino).toHaveLength(1)

    const resultadoA = destinoDeRespuesta(grupoA, { latitude: -27.75, longitude: -58.75 })
    expect(resultadoA.destino.map((c) => c.geometryRef)).toEqual(['-27.4_-58.8'])
    expect(resultadoA.reencolar).toBe(true)
    cola.reencolarMiembros(grupoA)

    // Los miembros reencolados salen como consultas individuales, sin verificación.
    const reencolado = cola.siguiente()
    expect(reencolado?.map((grupo) => grupo.celdas.map((c) => c.geometryRef))).toEqual([
      ['-27.5_-58.7'],
      ['-27.6_-58.8'],
    ])
    expect(reencolado?.every((grupo) => grupo.clave === null)).toBe(true)
    expect(cola.siguiente()).toBeUndefined()
  })

  it('vaciar devuelve todas las celdas todavía no consultadas', () => {
    const cola = crearColaLotesPorPuntoGrilla(['-27.4_-58.8', '-27.5_-58.7', '-28.0_-58.0'].map(celda), 1)
    cola.siguiente()
    expect(cola.vaciar().map((c) => c.geometryRef)).toEqual(['-28.0_-58.0'])
    expect(cola.siguiente()).toBeUndefined()
  })
})

describe('empaquetarRefsPorPuntoGrilla', () => {
  it('arma tandas de puntos completos sin partir un punto entre tandas', () => {
    const refs = fixture.celdas.map(([ref]) => ref)
    const tandas = empaquetarRefsPorPuntoGrilla(refs, 20)

    expect(tandas.flat().sort()).toEqual([...refs].sort())
    expect(tandas).toHaveLength(Math.ceil(130 / 20))
    const tandaPorPunto = new Map<string, number>()
    tandas.forEach((tanda, indice) => {
      const puntos = new Set(tanda.map((ref) => clavePuntoGrilla(celda(ref))))
      expect(puntos.size).toBeLessThanOrEqual(20)
      for (const punto of puntos) {
        expect(tandaPorPunto.get(punto) ?? indice).toBe(indice)
        tandaPorPunto.set(punto, indice)
      }
    })
  })

  it('una ref no parseable viaja sola para que el provider reporte su error', () => {
    expect(empaquetarRefsPorPuntoGrilla(['basura', '-27.4_-58.8'], 20)).toEqual([['basura', '-27.4_-58.8']])
  })
})
