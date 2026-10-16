import { describe, expect, it } from 'vitest'
import { getReportesOfflineFeatures } from './feature-flags'

describe('getReportesOfflineFeatures', () => {
  it('defaults all gradual enablement flags to off', () => {
    expect(getReportesOfflineFeatures({})).toEqual({
      borradoresSync: false,
      fotos: false,
      mapaBorradores: false,
    })
  })

  it('enables only values set to the exact string true', () => {
    expect(getReportesOfflineFeatures({
      REPORTES_OFFLINE_BORRADORES_SYNC: 'true',
      REPORTES_OFFLINE_FOTOS: '1',
      REPORTES_OFFLINE_MAPA_BORRADORES: 'TRUE',
    })).toEqual({ borradoresSync: true, fotos: false, mapaBorradores: false })
  })

  it('reads the current environment each time', () => {
    const env: Record<string, string | undefined> = {}
    expect(getReportesOfflineFeatures(env).fotos).toBe(false)
    env.REPORTES_OFFLINE_FOTOS = 'true'
    expect(getReportesOfflineFeatures(env).fotos).toBe(true)
  })
})
