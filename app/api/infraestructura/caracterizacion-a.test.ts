// Characterization (golden) tests for the infraestructura route group A1.
// Every exported handler is called with unauthenticated, authorized and invalid
// requests, and each response is frozen as { status, contentType, cacheControl,
// body }. Volatile values are normalized like the parte golden test does.
// Snapshots are the contract of the api-standard phase: never regenerate them
// with `vitest -u`.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura, verificarAccesoSeccion } from '@/lib/infraestructura/acceso-lectura'
import { getSessionUser } from '@/lib/session'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

vi.mock('@/lib/session', async () => {
  // Same rule as staffGuard in lib/session.ts. Not importOriginal: the real
  // module pulls in @/lib/auth -> @/lib/db before DATA_DIR is set.
  const { isStaff } = await import('@/lib/acl')
  return {
    getSessionUser: vi.fn(),
    staffGuard: (user: SessionUser | null) => {
      if (!user) return { status: 401 as const, error: 'No autenticado' }
      if (user.banned || !isStaff(user.role)) return { status: 403 as const, error: 'No tiene acceso a este recurso' }
      return null
    },
  }
})

vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn(), verificarAccesoSeccion: vi.fn() }))

// Signed read URLs go to external storage: stubbed so no network is touched.
vi.mock('@/lib/infraestructura/adjuntos/lectura', () => ({
  firmarLecturaAdjunto: vi.fn(async (key: string) => `https://storage.invalid/lectura/${key}`),
}))

usarDbTemporal('infra-a1-golden-', {
  env: {
    REPORTES_OFFLINE_BORRADORES_SYNC: undefined,
    REPORTES_OFFLINE_FOTOS: undefined,
    REPORTES_OFFLINE_MAPA_BORRADORES: undefined,
  },
})

const FECHA_FIJA = '2026-10-25T12:00:00.000Z'
const CUE = '1801605-71'
const BASE = 'http://localhost'

const ADMIN: SessionUser = { id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
const EDITOR: SessionUser = { ...ADMIN, id: 'editor-1', role: 'editor' }
const CONSULTA: SessionUser = { ...ADMIN, id: 'consulta-1', role: 'consulta' }

const SIN_SESION: AccesoLectura = { ok: false, status: 401 }
const SIN_PERMISO: AccesoLectura = { ok: false, status: 403 }
const ACCESO_OK: AccesoLectura = { ok: true, user: ADMIN }

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})/g

// Same contract as normalizar() in app/api/problematicas/parte/caracterizacion.test.ts:
// the same uuid always maps to the same placeholder; ISO timestamps become <fecha>.
function normalizar(valor: unknown): unknown {
  const ids = new Map<string, string>()
  const texto = JSON.stringify(valor)
    .replace(UUID, (id) => {
      if (!ids.has(id)) ids.set(id, `<id-${ids.size + 1}>`)
      return ids.get(id)!
    })
    .replace(ISO, '<fecha>')
  return JSON.parse(texto)
}

type Resumen = { status: number; contentType: string | null; cacheControl: string | null; body: unknown }

// JSON bodies are frozen (normalized). Binary bodies keep only the byte length
// and the zip signature, never the bytes themselves.
async function resumir(res: Response): Promise<Resumen> {
  const contentType = res.headers.get('content-type')
  const base = { status: res.status, contentType, cacheControl: res.headers.get('cache-control') }
  if (contentType?.includes('application/json')) return { ...base, body: normalizar(await res.json()) }
  const bytes = new Uint8Array(await res.arrayBuffer())
  return { ...base, body: { bytes: bytes.byteLength, firma: new TextDecoder().decode(bytes.slice(0, 2)) } }
}

function pedido(ruta: string, init?: RequestInit): Request {
  return new Request(`${BASE}${ruta}`, init)
}

function ctx<T extends Record<string, string>>(valores: T) {
  return { params: Promise.resolve(valores) }
}

function sesion(user: SessionUser | null) {
  vi.mocked(getSessionUser).mockResolvedValue(user)
}

function acceso(valor: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(valor)
}

const FLAG_FOTOS = 'REPORTES_OFFLINE_FOTOS'
const FLAG_MAPA = 'REPORTES_OFFLINE_MAPA_BORRADORES'

let rutas: {
  accesos: typeof import('./accesos/[cueAnexo]/route')
  adjuntos: typeof import('./adjuntos/route')
  borradoresConteos: typeof import('./borradores/conteos/route')
  borradoresCue: typeof import('./borradores/[cueAnexo]/route')
  episodios: typeof import('./episodios-derivados/route')
  episodiosId: typeof import('./episodios-derivados/[id]/route')
  exportar: typeof import('./exportar/route')
  fuentes: typeof import('./fuentes/route')
  geoPerfiles: typeof import('./geo-perfiles/[cueAnexo]/route')
  hidroEstaciones: typeof import('./hidrometria/estaciones/route')
  hidroLecturas: typeof import('./hidrometria/estaciones/[id]/lecturas/route')
  hidroEstado: typeof import('./hidrometria/estado/route')
  motivos: typeof import('./motivos/route')
  permisos: typeof import('./nominal/permisos/route')
  salud: typeof import('./operacion/salud/route')
  peligro: typeof import('./peligro/route')
  grilla: typeof import('./peligro/observado-grilla/route')
}

let estacionConCoordenadas = ''
let episodioRegla = ''

beforeAll(async () => {
  // Fixed clock: frescura, edad de lecturas and vencimientos become reproducible.
  // Only Date is faked so the async DB work keeps running on real timers.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(FECHA_FIJA))

  rutas = {
    accesos: await import('./accesos/[cueAnexo]/route'),
    adjuntos: await import('./adjuntos/route'),
    borradoresConteos: await import('./borradores/conteos/route'),
    borradoresCue: await import('./borradores/[cueAnexo]/route'),
    episodios: await import('./episodios-derivados/route'),
    episodiosId: await import('./episodios-derivados/[id]/route'),
    exportar: await import('./exportar/route'),
    fuentes: await import('./fuentes/route'),
    geoPerfiles: await import('./geo-perfiles/[cueAnexo]/route'),
    hidroEstaciones: await import('./hidrometria/estaciones/route'),
    hidroLecturas: await import('./hidrometria/estaciones/[id]/lecturas/route'),
    hidroEstado: await import('./hidrometria/estado/route'),
    motivos: await import('./motivos/route'),
    permisos: await import('./nominal/permisos/route'),
    salud: await import('./operacion/salud/route'),
    peligro: await import('./peligro/route'),
    grilla: await import('./peligro/observado-grilla/route'),
  }

  const { obtenerEstacionesPrefectura } = await import('@/lib/infraestructura/hidrometria/estaciones-prefectura')
  estacionConCoordenadas = obtenerEstacionesPrefectura().find((e) => e.coordenadas !== null)!.estacionId
  const { EPISODIOS_REGLA_VERSION } = await import('@/lib/infraestructura/episodios-derivados/regla')
  episodioRegla = EPISODIOS_REGLA_VERSION
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  // Section and resource checks are covered by their own tests; here the
  // session user alone decides, as before the access gates existed.
  const porSesion = async () => {
    const user = await vi.mocked(getSessionUser)()
    return user ? { ok: true as const, user } : { ok: false as const, status: 401 as const }
  }
  vi.mocked(verificarAccesoLectura).mockReset().mockImplementation(porSesion)
  vi.mocked(verificarAccesoSeccion).mockReset().mockImplementation(porSesion)
})

describe('GET /api/infraestructura/accesos/[cueAnexo]', () => {
  it('answers 401 without a session', async () => {
    sesion(null)
    const res = await rutas.accesos.GET(pedido(`/api/infraestructura/accesos/${CUE}`), ctx({ cueAnexo: CUE }))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 403 for a non-staff role', async () => {
    sesion(CONSULTA)
    const res = await rutas.accesos.GET(pedido(`/api/infraestructura/accesos/${CUE}`), ctx({ cueAnexo: CUE }))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 for an oversized cueAnexo', async () => {
    sesion(EDITOR)
    const res = await rutas.accesos.GET(pedido('/api/infraestructura/accesos/x'), ctx({ cueAnexo: 'x'.repeat(51) }))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 404 for a staff user and a CUE missing from the territorial registry', async () => {
    sesion(EDITOR)
    const res = await rutas.accesos.GET(pedido(`/api/infraestructura/accesos/${CUE}`), ctx({ cueAnexo: CUE }))
    expect(await resumir(res)).toMatchSnapshot()
  })
})

describe('GET /api/infraestructura/adjuntos', () => {
  it('answers 503 feature_disabled while the photo flag is off, before any access check', async () => {
    const res = await rutas.adjuntos.GET(pedido(`/api/infraestructura/adjuntos?cue=${CUE}`))
    expect(await resumir(res)).toMatchSnapshot()
    expect(verificarAccesoLectura).not.toHaveBeenCalled()
  })

  describe('with the photo flag on', () => {
    beforeAll(() => {
      process.env[FLAG_FOTOS] = 'true'
    })
    afterAll(() => {
      delete process.env[FLAG_FOTOS]
    })

    it('answers 401 without a session', async () => {
      acceso(SIN_SESION)
      const res = await rutas.adjuntos.GET(pedido(`/api/infraestructura/adjuntos?cue=${CUE}`))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 when the CUE is invalid', async () => {
      acceso(ACCESO_OK)
      const res = await rutas.adjuntos.GET(pedido('/api/infraestructura/adjuntos?cue=abc'))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 for an attachmentId with an unsupported variant', async () => {
      acceso(ACCESO_OK)
      const res = await rutas.adjuntos.GET(pedido(`/api/infraestructura/adjuntos?cue=${CUE}&attachmentId=adj-1&variant=grande`))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 404 for an attachment that is not confirmed for the CUE', async () => {
      acceso(ACCESO_OK)
      const res = await rutas.adjuntos.GET(pedido(`/api/infraestructura/adjuntos?cue=${CUE}&attachmentId=adj-inexistente&variant=optimizada`))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('lists no movements for a CUE without confirmed photos', async () => {
      acceso(ACCESO_OK)
      const res = await rutas.adjuntos.GET(pedido(`/api/infraestructura/adjuntos?cue=${CUE}`))
      expect(await resumir(res)).toMatchSnapshot()
    })
  })
})

describe('GET /api/infraestructura/borradores/conteos', () => {
  it('answers an empty item list while the offline map flag is off, without an access check', async () => {
    const res = await rutas.borradoresConteos.GET(pedido('/api/infraestructura/borradores/conteos'))
    expect(await resumir(res)).toMatchSnapshot()
    expect(verificarAccesoLectura).not.toHaveBeenCalled()
  })

  describe('with the offline map flag on', () => {
    beforeAll(() => {
      process.env[FLAG_MAPA] = 'true'
    })
    afterAll(() => {
      delete process.env[FLAG_MAPA]
    })

    it('answers 401 without a session', async () => {
      acceso(SIN_SESION)
      const res = await rutas.borradoresConteos.GET(pedido('/api/infraestructura/borradores/conteos'))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 for a malformed cues list', async () => {
      acceso(ACCESO_OK)
      const res = await rutas.borradoresConteos.GET(pedido(`/api/infraestructura/borradores/conteos?cues=${CUE},abc`))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 for more than 1000 distinct cues', async () => {
      acceso(ACCESO_OK)
      const cues = Array.from({ length: 1001 }, (_, i) => `${String(i).padStart(7, '0')}-00`).join(',')
      const res = await rutas.borradoresConteos.GET(pedido(`/api/infraestructura/borradores/conteos?cues=${cues}`))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('returns counts when no cues are requested', async () => {
      acceso(ACCESO_OK)
      const res = await rutas.borradoresConteos.GET(pedido('/api/infraestructura/borradores/conteos'))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('returns counts for an explicit cue list', async () => {
      acceso(ACCESO_OK)
      const res = await rutas.borradoresConteos.GET(pedido(`/api/infraestructura/borradores/conteos?cues=${CUE}`))
      expect(await resumir(res)).toMatchSnapshot()
    })
  })
})

describe('GET /api/infraestructura/borradores/[cueAnexo]', () => {
  it('answers an empty page while the offline map flag is off, without an access check', async () => {
    const res = await rutas.borradoresCue.GET(pedido(`/api/infraestructura/borradores/${CUE}`), ctx({ cueAnexo: CUE }))
    expect(await resumir(res)).toMatchSnapshot()
    expect(verificarAccesoLectura).not.toHaveBeenCalled()
  })

  describe('with the offline map flag on', () => {
    beforeAll(() => {
      process.env[FLAG_MAPA] = 'true'
    })
    afterAll(() => {
      delete process.env[FLAG_MAPA]
    })

    it('answers 401 without a session', async () => {
      acceso(SIN_SESION)
      const res = await rutas.borradoresCue.GET(pedido(`/api/infraestructura/borradores/${CUE}`), ctx({ cueAnexo: CUE }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 for a CUE that is not valid', async () => {
      acceso(ACCESO_OK)
      const res = await rutas.borradoresCue.GET(pedido('/api/infraestructura/borradores/abc'), ctx({ cueAnexo: 'abc' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 for a limit above the maximum', async () => {
      acceso(ACCESO_OK)
      const res = await rutas.borradoresCue.GET(pedido(`/api/infraestructura/borradores/${CUE}?limit=51`), ctx({ cueAnexo: CUE }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 for a cursor that is not a valid draft cursor', async () => {
      acceso(ACCESO_OK)
      const cursor = Buffer.from('no-es-json').toString('base64url')
      const res = await rutas.borradoresCue.GET(pedido(`/api/infraestructura/borradores/${CUE}?cursor=${cursor}`), ctx({ cueAnexo: CUE }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('lists drafts for an authorized user with the default page size', async () => {
      acceso(ACCESO_OK)
      const res = await rutas.borradoresCue.GET(pedido(`/api/infraestructura/borradores/${CUE}`), ctx({ cueAnexo: CUE }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('accepts a well-formed cursor and lists the next page', async () => {
      acceso(ACCESO_OK)
      const cursor = Buffer.from(JSON.stringify({ actividadEn: '2026-10-24T12:00:00.000Z', draftId: 'borrador-1' })).toString('base64url')
      const res = await rutas.borradoresCue.GET(pedido(`/api/infraestructura/borradores/${CUE}?cursor=${cursor}`), ctx({ cueAnexo: CUE }))
      expect(await resumir(res)).toMatchSnapshot()
    })
  })
})

describe('GET /api/infraestructura/episodios-derivados', () => {
  it('answers 401 without a session', async () => {
    acceso(SIN_SESION)
    const res = await rutas.episodios.GET(pedido('/api/infraestructura/episodios-derivados'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 403 without access to the resource', async () => {
    acceso(SIN_PERMISO)
    const res = await rutas.episodios.GET(pedido('/api/infraestructura/episodios-derivados'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('lists no episodes while the table is empty', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.episodios.GET(pedido('/api/infraestructura/episodios-derivados'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 naming the invalid estado', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.episodios.GET(pedido('/api/infraestructura/episodios-derivados?estado=pendiente'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 naming the pageSize above 200', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.episodios.GET(pedido('/api/infraestructura/episodios-derivados?pageSize=500'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 naming a desde that is not an ISO datetime', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.episodios.GET(pedido('/api/infraestructura/episodios-derivados?desde=ayer'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('paginates an empty filtered result', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.episodios.GET(pedido('/api/infraestructura/episodios-derivados?estado=abierto&page=2&pageSize=10'))
    expect(await resumir(res)).toMatchSnapshot()
  })
})

describe('GET /api/infraestructura/episodios-derivados/[id]', () => {
  beforeAll(async () => {
    const { getDb } = await import('@/lib/db')
    const { infraEpisodioDerivado } = await import('@/lib/db/schema')
    await getDb()
      .insert(infraEpisodioDerivado)
      .values({
        id: 'episodio-golden-1',
        reglaVersion: episodioRegla,
        parametros: { umbralMm: 50 },
        unidadTipo: 'departamento',
        unidadId: 'PARANA',
        inicioEn: '2026-10-20T00:00:00.000Z',
        finEn: null,
        estado: 'abierto',
        escuelasAfectadas: 4,
        calculadoEn: '2026-10-20T01:00:00.000Z',
      })
  })

  it('answers 401 without a session', async () => {
    acceso(SIN_SESION)
    const res = await rutas.episodiosId.GET(pedido('/api/infraestructura/episodios-derivados/episodio-golden-1'), ctx({ id: 'episodio-golden-1' }))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 for an id longer than 100 characters', async () => {
    acceso(ACCESO_OK)
    const id = 'x'.repeat(101)
    const res = await rutas.episodiosId.GET(pedido(`/api/infraestructura/episodios-derivados/${id}`), ctx({ id }))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 404 for an unknown episode', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.episodiosId.GET(pedido('/api/infraestructura/episodios-derivados/episodio-inexistente'), ctx({ id: 'episodio-inexistente' }))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('returns the episode with its members', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.episodiosId.GET(pedido('/api/infraestructura/episodios-derivados/episodio-golden-1'), ctx({ id: 'episodio-golden-1' }))
    expect(await resumir(res)).toMatchSnapshot()
  })
})

describe('GET /api/infraestructura/exportar', () => {
  it('answers 401 without a session', async () => {
    acceso(SIN_SESION)
    const res = await rutas.exportar.GET(pedido('/api/infraestructura/exportar'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 403 without access to the resource', async () => {
    acceso(SIN_PERMISO)
    const res = await rutas.exportar.GET(pedido('/api/infraestructura/exportar'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 for an unsupported formato', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.exportar.GET(pedido('/api/infraestructura/exportar?formato=csv'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('returns the json preview as a paginated payload', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.exportar.GET(pedido('/api/infraestructura/exportar?formato=json'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('returns the xlsx workbook when no formato is given', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.exportar.GET(pedido('/api/infraestructura/exportar'))
    expect(await resumir(res)).toMatchSnapshot()
  })
})

describe('GET /api/infraestructura/fuentes', () => {
  beforeAll(async () => {
    const { getDb } = await import('@/lib/db')
    const { hazardSourceHealth } = await import('@/lib/db/schema')
    // Ten minutes before FECHA_FIJA: frescuraMinutos is 10 for the first source.
    const exitoReciente = '2026-10-25T11:50:00.000Z'
    await getDb().insert(hazardSourceHealth).values([
      {
        provider: 'open-meteo',
        ultimoExitoEn: exitoReciente,
        ultimoIntentoEn: exitoReciente,
        estado: 'ok',
        ultimoErrorSaneado: null,
        ttlMinutos: 120,
        licencia: 'CC-BY-4.0',
        actualizadaEn: exitoReciente,
      },
      {
        provider: 'inameh',
        ultimoExitoEn: null,
        ultimoIntentoEn: exitoReciente,
        estado: 'degradado',
        ultimoErrorSaneado: 'timeout al consultar la fuente',
        ttlMinutos: 360,
        licencia: 'uso institucional',
        actualizadaEn: exitoReciente,
      },
    ])
  })

  it('answers 401 without a session', async () => {
    acceso(SIN_SESION)
    const res = await rutas.fuentes.GET(new Request('http://localhost/api'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 403 without access to the resource', async () => {
    acceso(SIN_PERMISO)
    const res = await rutas.fuentes.GET(new Request('http://localhost/api'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('lists the sources with frescuraMinutos derived at read time', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.fuentes.GET(new Request('http://localhost/api'))
    expect(await resumir(res)).toMatchSnapshot()
  })
})

describe('GET /api/infraestructura/geo-perfiles/[cueAnexo]', () => {
  it('answers 401 without a session', async () => {
    acceso(SIN_SESION)
    const res = await rutas.geoPerfiles.GET(pedido(`/api/infraestructura/geo-perfiles/${CUE}`), ctx({ cueAnexo: CUE }))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 for an oversized cueAnexo', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.geoPerfiles.GET(pedido('/api/infraestructura/geo-perfiles/x'), ctx({ cueAnexo: 'x'.repeat(51) }))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers the profile lookup for a CUE with no geographic profile', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.geoPerfiles.GET(pedido(`/api/infraestructura/geo-perfiles/${CUE}`), ctx({ cueAnexo: CUE }))
    expect(await resumir(res)).toMatchSnapshot()
  })
})

describe('GET /api/infraestructura/hidrometria/estaciones', () => {
  it('answers 401 without a session', async () => {
    acceso(SIN_SESION)
    const res = await rutas.hidroEstaciones.GET(new Request('http://localhost/api'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 403 without access to the resource', async () => {
    acceso(SIN_PERMISO)
    const res = await rutas.hidroEstaciones.GET(new Request('http://localhost/api'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('lists the catalog stations with coordinates and no reading yet', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.hidroEstaciones.GET(new Request('http://localhost/api'))
    expect(await resumir(res)).toMatchSnapshot()
  })
})

describe('GET /api/infraestructura/hidrometria/estaciones/[id]/lecturas', () => {
  it('answers 401 without a session', async () => {
    acceso(SIN_SESION)
    const res = await rutas.hidroLecturas.GET(pedido(`/api/infraestructura/hidrometria/estaciones/${estacionConCoordenadas}/lecturas`), ctx({ id: estacionConCoordenadas }))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('rejects an unknown station id', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.hidroLecturas.GET(pedido('/api/infraestructura/hidrometria/estaciones/estacion-inexistente/lecturas'), ctx({ id: 'estacion-inexistente' }))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('rejects a desde that is not a date', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.hidroLecturas.GET(
      pedido(`/api/infraestructura/hidrometria/estaciones/${estacionConCoordenadas}/lecturas?desde=ayer`),
      ctx({ id: estacionConCoordenadas }),
    )
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('rejects a limite above the maximum', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.hidroLecturas.GET(
      pedido(`/api/infraestructura/hidrometria/estaciones/${estacionConCoordenadas}/lecturas?limite=999999`),
      ctx({ id: estacionConCoordenadas }),
    )
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('returns the reading history for a catalog station', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.hidroLecturas.GET(
      pedido(`/api/infraestructura/hidrometria/estaciones/${estacionConCoordenadas}/lecturas`),
      ctx({ id: estacionConCoordenadas }),
    )
    expect(await resumir(res)).toMatchSnapshot()
  })
})

describe('GET /api/infraestructura/hidrometria/estado', () => {
  it('answers 401 without a session', async () => {
    acceso(SIN_SESION)
    const res = await rutas.hidroEstado.GET(pedido('/api/infraestructura/hidrometria/estado?localidad=Parana'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 when localidad is missing', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.hidroEstado.GET(pedido('/api/infraestructura/hidrometria/estado'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 when localidad is empty', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.hidroEstado.GET(pedido('/api/infraestructura/hidrometria/estado?localidad='))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers no tramo and no reading for a localidad without a reference station', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.hidroEstado.GET(pedido('/api/infraestructura/hidrometria/estado?localidad=Localidad%20Inexistente'))
    expect(await resumir(res)).toMatchSnapshot()
  })
})

describe('/api/infraestructura/motivos', () => {
  describe('GET', () => {
    it('answers 401 without a session', async () => {
      sesion(null)
      const res = await rutas.motivos.GET(new Request('http://localhost/api'))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 403 for a non-staff role', async () => {
      sesion(CONSULTA)
      const res = await rutas.motivos.GET(new Request('http://localhost/api'))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('lists the seeded motives for staff', async () => {
      sesion(EDITOR)
      const res = await rutas.motivos.GET(new Request('http://localhost/api'))
      expect(await resumir(res)).toMatchSnapshot()
    })
  })

  describe('POST', () => {
    const cuerpo = (valores: Record<string, unknown>) =>
      pedido('/api/infraestructura/motivos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(valores),
      })

    it('answers 401 without a session', async () => {
      sesion(null)
      const res = await rutas.motivos.POST(cuerpo({ id: 'motivo-golden-1', nombre: 'Golden', categoria: 'establecimiento' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 403 for an editor, since only admin may write', async () => {
      sesion(EDITOR)
      const res = await rutas.motivos.POST(cuerpo({ id: 'motivo-golden-1', nombre: 'Golden', categoria: 'establecimiento' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 for a body that is not JSON', async () => {
      sesion(ADMIN)
      const res = await rutas.motivos.POST(pedido('/api/infraestructura/motivos', { method: 'POST', body: 'no-json' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 when id is missing', async () => {
      sesion(ADMIN)
      const res = await rutas.motivos.POST(cuerpo({ nombre: 'Golden', categoria: 'establecimiento' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 for an unknown categoria', async () => {
      sesion(ADMIN)
      const res = await rutas.motivos.POST(cuerpo({ id: 'motivo-golden-1', nombre: 'Golden', categoria: 'otra' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 for an unknown severidadSugerida', async () => {
      sesion(ADMIN)
      const res = await rutas.motivos.POST(cuerpo({ id: 'motivo-golden-1', nombre: 'Golden', categoria: 'establecimiento', severidadSugerida: 'Desconocida' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('creates a motive for an admin', async () => {
      sesion(ADMIN)
      const res = await rutas.motivos.POST(cuerpo({ id: 'motivo-golden-1', nombre: 'Golden', categoria: 'establecimiento', severidadSugerida: 'Alta' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 when another motive already uses the name', async () => {
      sesion(ADMIN)
      const res = await rutas.motivos.POST(cuerpo({ id: 'motivo-golden-2', nombre: 'Golden', categoria: 'establecimiento' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('updates an existing motive in place when the id matches', async () => {
      sesion(ADMIN)
      const res = await rutas.motivos.POST(cuerpo({ id: 'motivo-golden-1', nombre: 'Golden renombrado', categoria: 'alumnos' }))
      expect(await resumir(res)).toMatchSnapshot()
    })
  })

  describe('DELETE', () => {
    it('answers 401 without a session', async () => {
      sesion(null)
      const res = await rutas.motivos.DELETE(pedido('/api/infraestructura/motivos?id=motivo-golden-1', { method: 'DELETE' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 403 for an editor', async () => {
      sesion(EDITOR)
      const res = await rutas.motivos.DELETE(pedido('/api/infraestructura/motivos?id=motivo-golden-1', { method: 'DELETE' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 when no id is sent in the query or the body', async () => {
      sesion(ADMIN)
      const res = await rutas.motivos.DELETE(pedido('/api/infraestructura/motivos', { method: 'DELETE' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 for an unknown motive, reading the id from the JSON body', async () => {
      sesion(ADMIN)
      const res = await rutas.motivos.DELETE(
        pedido('/api/infraestructura/motivos', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 'motivo-inexistente' }),
        }),
      )
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('deletes the motive created above', async () => {
      sesion(ADMIN)
      const res = await rutas.motivos.DELETE(pedido('/api/infraestructura/motivos?id=motivo-golden-1', { method: 'DELETE' }))
      expect(await resumir(res)).toMatchSnapshot()
    })
  })
})

describe('/api/infraestructura/nominal/permisos', () => {
  describe('GET', () => {
    it('answers 401 without a session', async () => {
      sesion(null)
      const res = await rutas.permisos.GET(new Request('http://localhost/api'))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 403 for an editor, since nominal access is admin only', async () => {
      sesion(EDITOR)
      const res = await rutas.permisos.GET(new Request('http://localhost/api'))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('lists no permits before any is granted', async () => {
      sesion(ADMIN)
      const res = await rutas.permisos.GET(new Request('http://localhost/api'))
      expect(await resumir(res)).toMatchSnapshot()
    })
  })

  describe('POST', () => {
    const cuerpo = (valores: Record<string, unknown>) =>
      pedido('/api/infraestructura/nominal/permisos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(valores),
      })

    it('answers 401 without a session', async () => {
      sesion(null)
      const res = await rutas.permisos.POST(cuerpo({ userId: 'usuario-golden-1', venceEn: '2027-01-01T00:00:00.000Z' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 403 for an editor', async () => {
      sesion(EDITOR)
      const res = await rutas.permisos.POST(cuerpo({ userId: 'usuario-golden-1', venceEn: '2027-01-01T00:00:00.000Z' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 when userId or venceEn is missing', async () => {
      sesion(ADMIN)
      const res = await rutas.permisos.POST(cuerpo({}))
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('answers 400 for a venceEn in the past', async () => {
      sesion(ADMIN)
      const res = await rutas.permisos.POST(cuerpo({ userId: 'usuario-golden-1', venceEn: '2026-01-01T00:00:00.000Z' }))
      expect(await resumir(res)).toMatchSnapshot()
    })

    let permisoId = ''

    it('grants a nominal permit for a future expiry', async () => {
      sesion(ADMIN)
      const res = await rutas.permisos.POST(cuerpo({ userId: 'usuario-golden-1', venceEn: '2027-01-01T00:00:00.000Z' }))
      permisoId = (await res.clone().json()).permiso.id
      expect(await resumir(res)).toMatchSnapshot()
    })

    it('lists the permit granted above', async () => {
      sesion(ADMIN)
      const res = await rutas.permisos.GET(new Request('http://localhost/api'))
      expect(await resumir(res)).toMatchSnapshot()
    })

    describe('DELETE', () => {
      it('answers 401 without a session', async () => {
        sesion(null)
        const res = await rutas.permisos.DELETE(pedido(`/api/infraestructura/nominal/permisos?id=${permisoId}`, { method: 'DELETE' }))
        expect(await resumir(res)).toMatchSnapshot()
      })

      it('answers 403 for an editor', async () => {
        sesion(EDITOR)
        const res = await rutas.permisos.DELETE(pedido(`/api/infraestructura/nominal/permisos?id=${permisoId}`, { method: 'DELETE' }))
        expect(await resumir(res)).toMatchSnapshot()
      })

      it('answers 400 when id is missing', async () => {
        sesion(ADMIN)
        const res = await rutas.permisos.DELETE(pedido('/api/infraestructura/nominal/permisos', { method: 'DELETE' }))
        expect(await resumir(res)).toMatchSnapshot()
      })

      it('revokes the permit granted above', async () => {
        sesion(ADMIN)
        const res = await rutas.permisos.DELETE(pedido(`/api/infraestructura/nominal/permisos?id=${permisoId}`, { method: 'DELETE' }))
        expect(await resumir(res)).toMatchSnapshot()
      })
    })
  })
})

describe('GET /api/infraestructura/operacion/salud', () => {
  it('answers 401 without a session', async () => {
    sesion(null)
    const res = await rutas.salud.GET(new Request('http://localhost/api'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 403 for a non-staff role', async () => {
    sesion(CONSULTA)
    const res = await rutas.salud.GET(new Request('http://localhost/api'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('returns the operational state for an editor', async () => {
    sesion(EDITOR)
    const res = await rutas.salud.GET(new Request('http://localhost/api'))
    expect(await resumir(res)).toMatchSnapshot()
  })
})

describe('GET /api/infraestructura/peligro', () => {
  it('answers 401 without a session', async () => {
    acceso(SIN_SESION)
    const res = await rutas.peligro.GET(pedido('/api/infraestructura/peligro'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 for an oversized geometryRef', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.peligro.GET(pedido(`/api/infraestructura/peligro?geometryRef=${'x'.repeat(51)}`))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 for an oversized puntoRioId', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.peligro.GET(pedido(`/api/infraestructura/peligro?puntoRioId=${'x'.repeat(51)}`))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('returns empty layers when no cell or river point is requested', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.peligro.GET(pedido('/api/infraestructura/peligro'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('returns the hazard layers for one grid cell', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.peligro.GET(pedido('/api/infraestructura/peligro?geometryRef=-34.5_-58.5'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('returns the river level for one point', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.peligro.GET(pedido('/api/infraestructura/peligro?puntoRioId=RIO-1'))
    expect(await resumir(res)).toMatchSnapshot()
  })
})

describe('GET /api/infraestructura/peligro/observado-grilla', () => {
  it('answers 401 without a session', async () => {
    acceso(SIN_SESION)
    const res = await rutas.grilla.GET(pedido('/api/infraestructura/peligro/observado-grilla'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('answers 400 for an unsupported horas value', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.grilla.GET(pedido('/api/infraestructura/peligro/observado-grilla?horas=48'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('returns the 24 h grid by default', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.grilla.GET(pedido('/api/infraestructura/peligro/observado-grilla'))
    expect(await resumir(res)).toMatchSnapshot()
  })

  it('returns the 72 h grid', async () => {
    acceso(ACCESO_OK)
    const res = await rutas.grilla.GET(pedido('/api/infraestructura/peligro/observado-grilla?horas=72'))
    expect(await resumir(res)).toMatchSnapshot()
  })
})
