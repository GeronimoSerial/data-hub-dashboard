import { describe, expect, it } from 'vitest'
import {
  adminPageGate,
  filtrarVisibles,
  isStaff,
  puedeAbrir,
  type RecursoAccess,
  type SessionUser,
} from './acl'

const pub: RecursoAccess = {
  id: 'r1',
  estado: 'publicado',
  audienciaNivelIds: [],
  audienciaUserIds: [],
}

const consulta = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 'u1',
  role: 'consulta',
  banned: false,
  nivelIds: [],
  accesoRecursos: 'todos',
  recursoIds: [],
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

  it('allows consulta+seleccionados when the recurso is in recursoIds', () => {
    expect(
      puedeAbrir(
        consulta({ accesoRecursos: 'seleccionados', recursoIds: ['r1'] }),
        pub,
      ),
    ).toBe(true)
  })

  it('denies consulta+seleccionados when the recurso is not in recursoIds, even with open audience', () => {
    expect(
      puedeAbrir(
        consulta({ accesoRecursos: 'seleccionados', recursoIds: ['otro'] }),
        pub,
      ),
    ).toBe(false)
  })

  it('denies consulta+seleccionados listed but excluded by audience (intersection)', () => {
    expect(
      puedeAbrir(
        consulta({
          accesoRecursos: 'seleccionados',
          recursoIds: ['r1'],
          nivelIds: [],
        }),
        { ...pub, audienciaNivelIds: ['primario'] },
      ),
    ).toBe(false)
  })

  it('consulta+todos behaves exactly as before regardless of recursoIds', () => {
    expect(
      puedeAbrir(consulta({ accesoRecursos: 'todos', recursoIds: [] }), pub),
    ).toBe(true)
  })

  it('admin and editor with seleccionados and empty recursoIds are still allowed', () => {
    expect(
      puedeAbrir(
        consulta({ role: 'admin', accesoRecursos: 'seleccionados', recursoIds: [] }),
        pub,
      ),
    ).toBe(true)
    expect(
      puedeAbrir(
        consulta({ role: 'editor', accesoRecursos: 'seleccionados', recursoIds: [] }),
        pub,
      ),
    ).toBe(true)
  })
})

describe('isStaff', () => {
  it('is true for admin and editor', () => {
    expect(isStaff('admin')).toBe(true)
    expect(isStaff('editor')).toBe(true)
  })

  it('is false for consulta, logged-out, and undefined', () => {
    expect(isStaff('consulta')).toBe(false)
    expect(isStaff(null)).toBe(false)
    expect(isStaff(undefined)).toBe(false)
  })
})

describe('adminPageGate', () => {
  it('sends anonymous users to login', () => {
    expect(adminPageGate(null)).toBe('login')
  })

  it('forbids banned staff even when role is admin or editor', () => {
    expect(adminPageGate(consulta({ role: 'admin', banned: true }))).toBe(
      'forbidden',
    )
    expect(adminPageGate(consulta({ role: 'editor', banned: true }))).toBe(
      'forbidden',
    )
  })

  it('forbids consulta', () => {
    expect(adminPageGate(consulta())).toBe('forbidden')
  })

  it('allows active staff', () => {
    expect(adminPageGate(consulta({ role: 'admin' }))).toBe('ok')
    expect(adminPageGate(consulta({ role: 'editor' }))).toBe('ok')
  })
})

describe('filtrarVisibles', () => {
  const abierto = { id: 'r1', estado: 'publicado' as const }
  const borrador = { id: 'r2', estado: 'borrador' as const }
  const restringido = {
    id: 'r3',
    estado: 'publicado' as const,
    audienciaNivelIds: ['secundario'],
    audienciaUserIds: [],
  }
  const catalogo = [abierto, borrador, restringido]

  it('anonymous sees nothing (no ACL, no public catalog)', () => {
    expect(filtrarVisibles(null, catalogo)).toEqual([])
  })

  it('consulta+todos sees every published open resource but not drafts or out-of-audience', () => {
    expect(filtrarVisibles(consulta(), catalogo)).toEqual([abierto])
  })

  it('consulta+todos sees restricted resources when the nivel matches', () => {
    expect(
      filtrarVisibles(consulta({ nivelIds: ['secundario'] }), catalogo),
    ).toEqual([abierto, restringido])
  })

  it('consulta+seleccionados sees only listed resources, respecting audience', () => {
    expect(
      filtrarVisibles(
        consulta({ accesoRecursos: 'seleccionados', recursoIds: ['r1', 'r3'] }),
        catalogo,
      ),
    ).toEqual([abierto])
    expect(
      filtrarVisibles(
        consulta({
          accesoRecursos: 'seleccionados',
          recursoIds: ['r1', 'r3'],
          nivelIds: ['secundario'],
        }),
        catalogo,
      ),
    ).toEqual([abierto, restringido])
  })

  it('staff sees everything including drafts', () => {
    expect(filtrarVisibles(consulta({ role: 'admin' }), catalogo)).toEqual(
      catalogo,
    )
    expect(filtrarVisibles(consulta({ role: 'editor' }), catalogo)).toEqual(
      catalogo,
    )
  })
})
