import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import corrientesJson from '../../../config/regiones/corrientes.json'
import manaosJson from '../../../config/regiones/manaos.json'
import { RegionConfigSchema, marcaPublica, MARCA_SIN_CONFIGURAR } from './esquema'
import { marcaActual, __reiniciarRegionPublicaClienteParaPruebas } from './publica'
import { cargarRegion } from './index'
import { __reiniciarRegionActivaParaPruebas } from './activa'

const DIR_REGIONES = join(process.cwd(), 'config', 'regiones')
const originalRegion = process.env.REGION

describe('marca de la region (esquema)', () => {
  it('acepta una region sin marca', () => {
    const { marca: _omitida, ...sinMarca } = corrientesJson
    expect(() => RegionConfigSchema.parse(sinMarca)).not.toThrow()
    expect(marcaPublica(RegionConfigSchema.parse(sinMarca))).toEqual(MARCA_SIN_CONFIGURAR)
  })

  it('Corrientes conserva exactamente los textos y el logo actuales', () => {
    expect(marcaPublica(RegionConfigSchema.parse(corrientesJson))).toEqual({
      logo: 'educacion-corrientes',
      reparticionesLineas: ['Dirección de Sistemas de Información', 'Dirección de Gestión Escolar'],
      jurisdiccionLineas: ['Provincia de Corrientes', 'República Argentina'],
      pieLineas: ['Ministerio de Educación', 'Provincia de Corrientes'],
    })
  })

  it('Manaos usa la marca neutra ENOS sin logo de Corrientes', () => {
    const marca = marcaPublica(RegionConfigSchema.parse(manaosJson))
    expect(marca.logo).toBeNull()
    expect(marca.reparticionesLineas).toEqual(['ENOS'])
    expect(marca.jurisdiccionLineas).toEqual(['Amazonas', 'Brasil'])
    expect(marca.pieLineas).toEqual(['ENOS'])
    expect(JSON.stringify(marca)).not.toMatch(/Corrientes/)
  })

  it('ninguna config de region contiene el texto [PENDIENTE', () => {
    for (const archivo of readdirSync(DIR_REGIONES).filter((f) => f.endsWith('.json'))) {
      expect(readFileSync(join(DIR_REGIONES, archivo), 'utf8'), archivo).not.toContain('[PENDIENTE')
    }
  })

  it('rechaza claves desconocidas dentro de marca', () => {
    const malo = { ...corrientesJson, marca: { ...corrientesJson.marca, extra: 'x' } }
    expect(() => RegionConfigSchema.parse(malo)).toThrow()
  })
})

describe('marca de la region (lectura publica)', () => {
  beforeEach(() => {
    delete process.env.REGION
    __reiniciarRegionActivaParaPruebas()
    __reiniciarRegionPublicaClienteParaPruebas()
  })
  afterEach(() => {
    if (originalRegion === undefined) delete process.env.REGION
    else process.env.REGION = originalRegion
    __reiniciarRegionActivaParaPruebas()
    __reiniciarRegionPublicaClienteParaPruebas()
  })

  it('en servidor expone la marca de la region activa', () => {
    process.env.REGION = 'manaos'
    __reiniciarRegionActivaParaPruebas()
    expect(marcaActual()).toEqual(marcaPublica(cargarRegion('manaos')))
  })

})
