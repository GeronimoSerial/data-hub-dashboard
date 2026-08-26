import { describe, expect, it } from 'vitest'
import { puedeAbrir, type RecursoAccess, type SessionUser } from './acl'

const pub: RecursoAccess = {
  estado: 'publicado',
  audienciaNivelIds: [],
  audienciaUserIds: [],
}

const consulta = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 'u1',
  role: 'consulta',
  banned: false,
  nivelIds: [],
  ...over,
})

describe('puedeAbrir', () => {
  it('denies anonymous', () => {
    expect(puedeAbrir(null, pub)).toBe(false)
  })

  it('allows consulta when audience is empty', () => {
    expect(puedeAbrir(consulta(), pub)).toBe(true)
  })

  it('allows consulta when nivel intersects', () => {
    expect(
      puedeAbrir(consulta({ nivelIds: ['primario', 'secundario'] }), {
        ...pub,
        audienciaNivelIds: ['primario'],
      }),
    ).toBe(true)
  })

  it('denies consulta when nivel misses and not nominated', () => {
    expect(
      puedeAbrir(consulta({ nivelIds: ['inicial'] }), {
        ...pub,
        audienciaNivelIds: ['primario'],
      }),
    ).toBe(false)
  })

  it('allows nominated consulta without matching nivel', () => {
    expect(
      puedeAbrir(consulta({ id: 'u9', nivelIds: [] }), {
        ...pub,
        audienciaNivelIds: ['primario'],
        audienciaUserIds: ['u9'],
      }),
    ).toBe(true)
  })

  it('denies consulta on borrador', () => {
    expect(
      puedeAbrir(consulta(), { ...pub, estado: 'borrador' }),
    ).toBe(false)
  })

  it('allows editor and admin on borrador', () => {
    expect(
      puedeAbrir(consulta({ role: 'editor' }), { ...pub, estado: 'borrador' }),
    ).toBe(true)
    expect(
      puedeAbrir(consulta({ role: 'admin' }), { ...pub, estado: 'borrador' }),
    ).toBe(true)
  })

  it('denies banned users', () => {
    expect(puedeAbrir(consulta({ banned: true }), pub)).toBe(false)
  })
})
