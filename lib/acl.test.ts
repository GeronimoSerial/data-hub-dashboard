import { describe, expect, it } from 'vitest'
import {
  accesoDe,
  adminPageGate,
  isStaff,
  marcarAcceso,
  puedeAbrir,
  type RecursoAccess,
  type SessionUser,
} from './acl'

const pub: RecursoAccess = {
  id: 'r1',
  estado: 'publicado',
  audienciaNivelJurIds: [],
  audienciaUserIds: [],
}

const consulta = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 'u1',
  role: 'consulta',
  banned: false,
  nivelJurIds: [],
  accesoRecursos: 'todos',
  recursoIds: [],
  ...over,
})

describe('puedeAbrir', () => {
  it('denies anonymous', () => {
    expect(puedeAbrir(null, pub)).toBe(false)
  })

  it('denies consulta when audience is empty (no audience means staff only)', () => {
    expect(puedeAbrir(consulta(), pub)).toBe(false)
  })

  it('denies director_nivel and operador_establecimiento when audience is empty', () => {
    for (const role of ['director_nivel', 'operador_establecimiento'] as const) {
      expect(puedeAbrir(consulta({ role, nivelJurIds: [1] }), pub)).toBe(false)
    }
  })

  it('allows staff when audience is empty', () => {
    expect(puedeAbrir(consulta({ role: 'admin' }), pub)).toBe(true)
    expect(puedeAbrir(consulta({ role: 'editor' }), pub)).toBe(true)
  })

  it('allows consulta+seleccionados when the recurso is assigned, even without audience', () => {
    expect(
      puedeAbrir(
        consulta({ accesoRecursos: 'seleccionados', recursoIds: ['r1'] }),
        pub,
      ),
    ).toBe(true)
  })

  it('allows consulta when nivel intersects', () => {
    expect(
      puedeAbrir(consulta({ nivelJurIds: [1, 2] }), {
        ...pub,
        audienciaNivelJurIds: [1],
      }),
    ).toBe(true)
  })

  it('denies consulta when nivel misses and not nominated', () => {
    expect(
      puedeAbrir(consulta({ nivelJurIds: [3] }), {
        ...pub,
        audienciaNivelJurIds: [1],
      }),
    ).toBe(false)
  })

  it('allows nominated consulta without matching nivel', () => {
    expect(
      puedeAbrir(consulta({ id: 'u9', nivelJurIds: [] }), {
        ...pub,
        audienciaNivelJurIds: [1],
        audienciaUserIds: ['u9'],
      }),
    ).toBe(true)
  })

  it('denies consulta on borrador', () => {
    expect(
      puedeAbrir(consulta(), { ...pub, estado: 'borrador' }),
    ).toBe(false)
  })

  it('denies GE SSO roles on borrador', () => {
    for (const role of ['director_nivel', 'operador_establecimiento'] as const) {
      expect(puedeAbrir(consulta({ role }), { ...pub, estado: 'borrador' })).toBe(false)
    }
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
          nivelJurIds: [],
        }),
        { ...pub, audienciaNivelJurIds: [1] },
      ),
    ).toBe(false)
  })

  it('consulta+todos without audience is denied regardless of recursoIds', () => {
    expect(
      puedeAbrir(consulta({ accesoRecursos: 'todos', recursoIds: [] }), pub),
    ).toBe(false)
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

describe('accesoDe', () => {
  it('anonymous is always ingresar, even for an otherwise-open resource', () => {
    expect(accesoDe(null, pub)).toBe('ingresar')
  })

  it('signed-in consulta with permission is abrir', () => {
    expect(accesoDe(consulta({ nivelJurIds: [1] }), { ...pub, audienciaNivelJurIds: [1] })).toBe('abrir')
  })

  it('signed-in consulta without permission is restringido', () => {
    expect(
      accesoDe(consulta({ accesoRecursos: 'seleccionados', recursoIds: ['otro'] }), pub),
    ).toBe('restringido')
    expect(
      accesoDe(consulta(), { ...pub, audienciaNivelJurIds: [2] }),
    ).toBe('restringido')
  })

  it('staff is always abrir, even on borrador', () => {
    expect(accesoDe(consulta({ role: 'admin' }), { ...pub, estado: 'borrador' })).toBe(
      'abrir',
    )
  })
})

describe('marcarAcceso', () => {
  const abierto = { id: 'r1', estado: 'publicado' as const, audienciaNivelJurIds: [], audienciaUserIds: ['u1'] }
  const borrador = { id: 'r2', estado: 'borrador' as const }
  const restringido = {
    id: 'r3',
    estado: 'publicado' as const,
    audienciaNivelJurIds: [2],
    audienciaUserIds: [],
  }
  const catalogo = [abierto, borrador, restringido]

  it('anonymous: every item comes back marked ingresar, nothing is dropped', () => {
    expect(marcarAcceso(null, catalogo)).toEqual([
      { ...abierto, acceso: 'ingresar' },
      { ...borrador, acceso: 'ingresar' },
      { ...restringido, acceso: 'ingresar' },
    ])
  })

  it('consulta+todos: abierto is abrir, out-of-audience/borrador are restringido', () => {
    expect(marcarAcceso(consulta(), catalogo)).toEqual([
      { ...abierto, acceso: 'abrir' },
      { ...borrador, acceso: 'restringido' },
      { ...restringido, acceso: 'restringido' },
    ])
  })

  it('consulta+todos sees restringido become abrir when the nivel matches', () => {
    expect(marcarAcceso(consulta({ nivelJurIds: [2] }), catalogo)).toEqual([
      { ...abierto, acceso: 'abrir' },
      { ...borrador, acceso: 'restringido' },
      { ...restringido, acceso: 'abrir' },
    ])
  })

  it('consulta+seleccionados: only listed ids are abrir, respecting audience', () => {
    expect(
      marcarAcceso(
        consulta({ accesoRecursos: 'seleccionados', recursoIds: ['r1', 'r3'] }),
        catalogo,
      ),
    ).toEqual([
      { ...abierto, acceso: 'abrir' },
      { ...borrador, acceso: 'restringido' },
      { ...restringido, acceso: 'restringido' },
    ])
  })

  it('staff: everything is abrir, including drafts', () => {
    expect(marcarAcceso(consulta({ role: 'admin' }), catalogo)).toEqual([
      { ...abierto, acceso: 'abrir' },
      { ...borrador, acceso: 'abrir' },
      { ...restringido, acceso: 'abrir' },
    ])
    expect(marcarAcceso(consulta({ role: 'editor' }), catalogo)).toEqual([
      { ...abierto, acceso: 'abrir' },
      { ...borrador, acceso: 'abrir' },
      { ...restringido, acceso: 'abrir' },
    ])
  })
})

describe('allow-list exemptions (S8)', () => {
  const consultaUser: SessionUser = { id: 'u9', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
  const sinAudiencia: RecursoAccess = { id: 'infra', estado: 'publicado', audienciaNivelJurIds: [], audienciaUserIds: [] }

  it('keeps the infra map open to signed-in users when it has no audience', () => {
    expect(puedeAbrir(consultaUser, { ...sinAudiencia, ruta: '/mapas/infraestructura' })).toBe(true)
    expect(accesoDe(consultaUser, { ...sinAudiencia, ruta: '/mapas/infraestructura' })).toBe('abrir')
  })

  it('does not extend the exemption to other routes', () => {
    expect(puedeAbrir(consultaUser, { ...sinAudiencia, ruta: '/mapas/natalidad' })).toBe(false)
  })
})
