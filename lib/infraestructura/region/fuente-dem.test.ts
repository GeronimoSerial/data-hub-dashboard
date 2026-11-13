import { describe, expect, it } from 'vitest'
import { RegionConfigSchema, regionPublica } from './esquema'
import { cargarRegion } from './registro'
import manaos from '../../../config/regiones/manaos.json' with { type: 'json' }
import { fuenteDemDe, fuenteDemDeRegionId } from './fuente-dem'

describe('fuenteDemDe', () => {
  it('uses copernicus when the region omits fuenteDem', () => {
    expect(fuenteDemDe({})).toBe('copernicus')
  })

  it('returns the declared fuente', () => {
    expect(fuenteDemDe({ fuenteDem: 'fabdem' })).toBe('fabdem')
  })
})

describe('fuenteDemDeRegionId with the real region configs', () => {
  it('selects fabdem for manaos', () => {
    expect(fuenteDemDeRegionId('manaos')).toBe('fabdem')
  })

  it('keeps corrientes on copernicus', () => {
    expect(fuenteDemDeRegionId('corrientes')).toBe('copernicus')
  })
})

describe('RegionConfigSchema fuenteDem', () => {
  it('accepts the manaos config with fabdem', () => {
    expect(RegionConfigSchema.parse(manaos).fuenteDem).toBe('fabdem')
  })

  it('accepts a config without fuenteDem', () => {
    const { fuenteDem: _omitido, ...sinCampo } = manaos
    expect(RegionConfigSchema.parse(sinCampo).fuenteDem).toBeUndefined()
  })

  it('rejects an unknown fuenteDem', () => {
    expect(() => RegionConfigSchema.parse({ ...manaos, fuenteDem: 'srtm' })).toThrow()
  })

  it('keeps fuenteDem out of the client-safe region', () => {
    expect(Object.keys(regionPublica(cargarRegion('manaos')))).not.toContain('fuenteDem')
  })
})
