import { describe, it, expect } from 'vitest'
import corrientesJson from '../../../config/regiones/corrientes.json'
import { RegionConfigSchema, regionPublica } from './esquema'

const base = () => structuredClone(corrientesJson) as Record<string, unknown>

describe('RegionConfigSchema', () => {
  it('accepts the corrientes config file', () => {
    expect(() => RegionConfigSchema.parse(corrientesJson)).not.toThrow()
  })

  it('rejects a config missing bboxPlausible', () => {
    const sinBbox = base()
    delete sinBbox.bboxPlausible
    expect(() => RegionConfigSchema.parse(sinBbox)).toThrow()
  })

  it('rejects an unknown extra key', () => {
    expect(() => RegionConfigSchema.parse({ ...base(), extra: 1 })).toThrow()
  })

  it('rejects an empty idiomas array', () => {
    expect(() => RegionConfigSchema.parse({ ...base(), idiomas: [] })).toThrow()
  })

  it('rejects a language outside es|pt', () => {
    expect(() => RegionConfigSchema.parse({ ...base(), idiomas: ['en'] })).toThrow()
  })
})

describe('config/regiones/corrientes.json values', () => {
  const r = corrientesJson

  it('identity and locale fields', () => {
    expect(r.id).toBe('corrientes')
    expect(r.nombre).toBe('Corrientes')
    expect(r.pais).toBe('AR')
    expect(r.zonaHoraria).toBe('America/Argentina/Buenos_Aires')
    expect(r.locale).toBe('es-AR')
    expect(r.idiomas).toEqual(['es'])
  })

  it('tolerancia de borde in km (5)', () => {
    expect(r.toleranciaBorde).toBe(5)
  })

  it('bboxPlausible numbers', () => {
    expect(r.bboxPlausible.latMin).toBe(-32)
    expect(r.bboxPlausible.latMax).toBe(-26)
    expect(r.bboxPlausible.lonMin).toBe(-61)
    expect(r.bboxPlausible.lonMax).toBe(-54)
  })

  it('limitesMapa numbers', () => {
    expect(r.limitesMapa[0][0]).toBe(-59.710824)
    expect(r.limitesMapa[0][1]).toBe(-30.730192)
    expect(r.limitesMapa[1][0]).toBe(-55.620259)
    expect(r.limitesMapa[1][1]).toBe(-27.253966)
  })

  it('bboxRuta numbers', () => {
    expect(r.bboxRuta.latMin).toBe(-30.8)
    expect(r.bboxRuta.latMax).toBe(-27.0)
    expect(r.bboxRuta.lonMin).toBe(-59.7)
    expect(r.bboxRuta.lonMax).toBe(-55.6)
  })

  it('regionesInteresLluvia numbers', () => {
    expect(r.regionesInteresLluvia[0].lon).toEqual([-59.8, -55.6])
    expect(r.regionesInteresLluvia[0].lat).toEqual([-30.8, -27.2])
    expect(r.regionesInteresLluvia[1].lon).toEqual([-56.1, -53.6])
    expect(r.regionesInteresLluvia[1].lat).toEqual([-28.2, -25.4])
  })

  it('vistaInicial and map center/zoom numbers', () => {
    expect(r.vistaInicial.centro).toEqual([-58.15, -29.55])
    expect(r.vistaInicial.zoom).toBe(6.3)
    expect(r.mapaCentro).toEqual([-58.215, -28.811])
    expect(r.mapaZoom).toBe(8)
  })

  it('infra dataset keys, river/alert sources and anchor station', () => {
    expect(r.datasets).toEqual({
      unidadesAdministrativas: 'departamentos',
      estacionesRio: 'estaciones-prefectura',
      localizaciones: 'localizaciones',
    })
    expect(r.fuentesRio).toEqual(['prefectura', 'ina'])
    expect(r.fuentesAlertas).toEqual(['smn'])
    expect(r.estacionAncla).toBe('pna-corrientes')
  })

  it('archivos paths', () => {
    expect(r.archivos).toEqual({
      mascara: '/data/mascara-corrientes.geojson',
      departamentos: '/data/departamentos-corrientes-georef-2026-09-27.geojson',
    })
  })
})

describe('regionPublica', () => {
  it('exposes only the client-safe keys', () => {
    const publica = regionPublica(RegionConfigSchema.parse(corrientesJson))
    expect(Object.keys(publica).sort()).toEqual(
      [
        'archivos',
        'id',
        'idiomas',
        'limitesMapa',
        'locale',
        'mapaCentro',
        'mapaZoom',
        'nombre',
        'pais',
        'regionesInteresLluvia',
        'vistaInicial',
        'zonaHoraria',
      ].sort(),
    )
  })
})
