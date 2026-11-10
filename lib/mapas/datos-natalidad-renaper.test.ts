import { describe, expect, it } from 'vitest'
import base from '../../public/data/natalidad/departamentos.json'
import renaper from '../../public/data/natalidad/renaper.json'
import type { DatosNatalidad } from './natalidad'
import { calcularVariacion } from './natalidad'
import { construirDatosNatalidadRenaper } from './datos-natalidad-renaper'

const deis = base as unknown as DatosNatalidad

describe('construirDatosNatalidadRenaper', () => {
  it('updates the entire dataset through 2025 without mutating DEIS or school metadata', () => {
    const original = JSON.stringify(deis)
    const datos = construirDatosNatalidadRenaper(deis, renaper)
    expect(datos.meta.anios).toEqual(Array.from({ length: 14 }, (_, i) => 2012 + i))
    expect(datos.meta.anioFin).toBe(2025)
    expect(datos.meta.fuenteNatalidad.nombre).toContain('RENAPER')
    expect(datos.departamentos).toHaveLength(25)
    for (const [i, d] of datos.departamentos.entries()) {
      expect(d.porNivel).toEqual(deis.departamentos[i].porNivel)
      expect(d.inicial).toEqual(deis.departamentos[i].inicial)
      expect(d.coddpto).toBe(deis.departamentos[i].coddpto)
      expect(d.serie).toEqual(renaper.departamentos[d.clave as keyof typeof renaper.departamentos].serie)
      expect(d.variacion).toEqual(calcularVariacion(d.serie, 2012, 2025))
    }
    expect(datos.provincia.serie['2025']).toBe(12077)
    expect(datos.departamentos.reduce((n, d) => n + d.serie['2025'], 0)).toBe(12076)
    expect(JSON.stringify(deis)).toBe(original)
    expect(deis.meta.anioFin).toBe(2023)
  })

  it('rejects missing or duplicate normalized departments and incomplete years', () => {
    const missing = structuredClone(renaper)
    delete (missing.departamentos as Record<string, unknown>).CAPITAL
    expect(() => construirDatosNatalidadRenaper(deis, missing)).toThrow()
    const duplicate = structuredClone(renaper)
    Object.assign(duplicate.departamentos, { 'CÁPITAL': duplicate.departamentos.CAPITAL })
    expect(() => construirDatosNatalidadRenaper(deis, duplicate)).toThrow()
    const sparse = structuredClone(renaper)
    delete (sparse.departamentos.CAPITAL.serie as Record<string, number>)['2025']
    expect(() => construirDatosNatalidadRenaper(deis, sparse)).toThrow()
  })
})
