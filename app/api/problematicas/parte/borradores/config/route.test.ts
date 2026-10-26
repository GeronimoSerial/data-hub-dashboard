import { afterEach, describe, expect, it } from 'vitest'
import { GET } from './route'

const FLAGS = [
  'REPORTES_OFFLINE_BORRADORES_SYNC',
  'REPORTES_OFFLINE_FOTOS',
  'REPORTES_OFFLINE_MAPA_BORRADORES',
] as const
const previous = new Map(FLAGS.map((name) => [name, process.env[name]]))

afterEach(() => {
  for (const name of FLAGS) {
    const value = previous.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('GET /api/problematicas/parte/borradores/config', () => {
  it('exposes only safe boolean flags and defaults them off', async () => {
    for (const name of FLAGS) delete process.env[name]
    const response = await GET(new Request('http://localhost/api/problematicas/parte/borradores/config'))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ borradoresSync: false, fotos: false, mapaBorradores: false })
  })

  it('reflects exact true values without returning environment contents', async () => {
    process.env.REPORTES_OFFLINE_BORRADORES_SYNC = 'true'
    process.env.REPORTES_OFFLINE_FOTOS = 'false'
    process.env.REPORTES_OFFLINE_MAPA_BORRADORES = 'true'
    const response = await GET(new Request('http://localhost/api/problematicas/parte/borradores/config'))
    expect(await response.json()).toEqual({ borradoresSync: true, fotos: false, mapaBorradores: true })
  })
})
