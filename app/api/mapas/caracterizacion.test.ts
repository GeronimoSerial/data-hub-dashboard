// Characterization (golden) test of the mapas API. Every route under
// app/api/mapas/** is loaded through its exported handler and called with
// unauthenticated, forbidden, valid and invalid requests against the real
// PGlite database. Only the session is mocked. Snapshots freeze status, content
// type, cache policy and body shape; they are the contract for the api-standard
// phase and must never be refreshed with `vitest -u`.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRawClient } from '@/lib/db'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { getSessionUser } from '@/lib/session'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn(async () => null) }))

usarDbTemporal('mapas-caracterizacion', { seed: false })

const CUE = '1801605-71'
const CUE_INEXISTENTE = '9999999-99'
const CUE_LARGO = 'x'.repeat(51)
const AFECTACION_INEXISTENTE = '00000000-0000-0000-0000-000000000000'
const VERSION_INVALIDA = 'invalida'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})/g

// Replaces volatile values (ids, timestamps) with stable placeholders while
// keeping identity: the same uuid always maps to the same placeholder.
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

// Status, content type and cache policy are frozen. The x-request-id header is
// deliberately not captured: it changes on every request.
async function capturar(res: Response) {
  const contentType = res.headers.get('content-type')
  const base = { status: res.status, contentType, cacheControl: res.headers.get('cache-control') }
  if (contentType?.includes('json')) return { ...base, body: normalizar(await res.json()) }
  if (contentType?.startsWith('text/')) return { ...base, body: normalizar(await res.text()) }
  return { ...base, bytes: (await res.arrayBuffer()).byteLength }
}

function usuario(extra: Record<string, unknown> & { id: string; role: string }) {
  return { banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], ...extra }
}

const ADMIN = usuario({ id: 'admin', role: 'admin' })
const CONSULTA = usuario({ id: 'consulta', role: 'consulta' })
const BANEADO = usuario({ id: 'baneado', role: 'consulta', banned: true })

function conUsuario(user: unknown) {
  vi.mocked(getSessionUser).mockResolvedValue(user as never)
}

function url(ruta: string) {
  return new Request(`http://localhost/api/mapas/infraestructura${ruta}`)
}

const porCueAnexo = (cueAnexo: string) => ({ params: Promise.resolve({ cueAnexo }) })
const porDataset = (dataset: string) => ({ params: Promise.resolve({ dataset }) })

// Route modules read DATA_DIR when they load, so they are imported lazily,
// after usarDbTemporal has set it up.
const rutas = {
  exposicionInundacion: () => import('./infraestructura/accesos/[cueAnexo]/exposicion-inundacion/route'),
  geometria: () => import('./infraestructura/accesos/[cueAnexo]/geometria/route'),
  datasets: () => import('./infraestructura/datasets/[dataset]/route'),
  escuelas: () => import('./infraestructura/escuelas/route'),
  evolucion: () => import('./infraestructura/evolucion/route'),
  historial: () => import('./infraestructura/historial/route'),
  nominal: () => import('./infraestructura/nominal/route'),
  parte: () => import('./infraestructura/parte/route'),
  referenciasEventos: () => import('./infraestructura/referencias/eventos/route'),
  raiz: () => import('./infraestructura/route'),
  territorio: () => import('./infraestructura/territorio/route'),
  totales: () => import('./infraestructura/totales/route'),
}

beforeAll(async () => {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES ('${CUE}', NULL, 'Escuela', 'ER', 'Parana', -31.7, -60.5)`,
  )
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
  )
  await client.execute({
    sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, ?)',
    args: [1],
  })

  // ensureSeeded() registers the mapas resource (recurso-infraestructura) that
  // verificarAccesoLectura() checks.
  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

beforeEach(() => {
  conUsuario(null)
})

describe('GET /api/mapas/infraestructura/accesos/[cueAnexo]/exposicion-inundacion', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.exposicionInundacion()
    expect(await capturar(await GET(url(`/accesos/${CUE}/exposicion-inundacion`), porCueAnexo(CUE)))).toMatchSnapshot()
  })

  it('returns the flood exposure indicator for an authorized user', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.exposicionInundacion()
    expect(await capturar(await GET(url(`/accesos/${CUE}/exposicion-inundacion`), porCueAnexo(CUE)))).toMatchSnapshot()
  })

  it('rejects an overlong cueAnexo with 400', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.exposicionInundacion()
    expect(await capturar(await GET(url(`/accesos/${CUE_LARGO}/exposicion-inundacion`), porCueAnexo(CUE_LARGO)))).toMatchSnapshot()
  })

  it('rejects a banned user with 403', async () => {
    conUsuario(BANEADO)
    const { GET } = await rutas.exposicionInundacion()
    expect(await capturar(await GET(url(`/accesos/${CUE}/exposicion-inundacion`), porCueAnexo(CUE)))).toMatchSnapshot()
  })
})

describe('GET /api/mapas/infraestructura/accesos/[cueAnexo]/geometria', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.geometria()
    expect(await capturar(await GET(url(`/accesos/${CUE}/geometria`), porCueAnexo(CUE)))).toMatchSnapshot()
  })

  it('answers 200 with available=false when no geometry is imported', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.geometria()
    expect(await capturar(await GET(url(`/accesos/${CUE}/geometria`), porCueAnexo(CUE)))).toMatchSnapshot()
  })

  it('rejects an overlong cueAnexo with 400', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.geometria()
    expect(await capturar(await GET(url(`/accesos/${CUE_LARGO}/geometria`), porCueAnexo(CUE_LARGO)))).toMatchSnapshot()
  })

  it('rejects a banned user with 403', async () => {
    conUsuario(BANEADO)
    const { GET } = await rutas.geometria()
    expect(await capturar(await GET(url(`/accesos/${CUE}/geometria`), porCueAnexo(CUE)))).toMatchSnapshot()
  })
})

describe('GET /api/mapas/infraestructura/datasets/[dataset]', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.datasets()
    expect(await capturar(await GET(url('/datasets/departamentos'), porDataset('departamentos')))).toMatchSnapshot()
  })

  it('answers 503 when a reference dataset has no published version', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.datasets()
    expect(await capturar(await GET(url('/datasets/departamentos'), porDataset('departamentos')))).toMatchSnapshot()
  })

  it('answers 404 for an unknown dataset', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.datasets()
    expect(await capturar(await GET(url('/datasets/no-existe'), porDataset('no-existe')))).toMatchSnapshot()
  })

  it('answers 200 with an empty version history', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.datasets()
    expect(await capturar(await GET(url('/datasets/departamentos?historial=1'), porDataset('departamentos')))).toMatchSnapshot()
  })

  it('rejects a malformed version id with 400', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.datasets()
    const ruta = `/datasets/departamentos?version=${VERSION_INVALIDA}`
    expect(await capturar(await GET(url(ruta), porDataset('departamentos')))).toMatchSnapshot()
  })

  it('rejects a banned user with 403', async () => {
    conUsuario(BANEADO)
    const { GET } = await rutas.datasets()
    expect(await capturar(await GET(url('/datasets/departamentos'), porDataset('departamentos')))).toMatchSnapshot()
  })
})

describe('GET /api/mapas/infraestructura/escuelas', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.escuelas()
    expect(await capturar(await GET(url('/escuelas')))).toMatchSnapshot()
  })

  it('answers 200 with the enriched school list for an authorized user', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.escuelas()
    expect(await capturar(await GET(url('/escuelas')))).toMatchSnapshot()
  })

  it('rejects a banned user with 403', async () => {
    conUsuario(BANEADO)
    const { GET } = await rutas.escuelas()
    expect(await capturar(await GET(url('/escuelas')))).toMatchSnapshot()
  })
})

describe('GET /api/mapas/infraestructura/evolucion', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.evolucion()
    expect(await capturar(await GET(url('/evolucion')))).toMatchSnapshot()
  })

  it('answers 200 with the four evolution views when unfiltered', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.evolucion()
    expect(await capturar(await GET(url('/evolucion')))).toMatchSnapshot()
  })

  it('answers 200 when filtered by department', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.evolucion()
    expect(await capturar(await GET(url('/evolucion?departamento=ER')))).toMatchSnapshot()
  })

  it('rejects an empty department filter with 400', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.evolucion()
    expect(await capturar(await GET(url('/evolucion?departamento=')))).toMatchSnapshot()
  })
})

describe('GET /api/mapas/infraestructura/historial', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.historial()
    expect(await capturar(await GET(url(`/historial?cue=${CUE}`)))).toMatchSnapshot()
  })

  it('answers 200 with the movement history of a school in scope', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.historial()
    expect(await capturar(await GET(url(`/historial?cue=${CUE}`)))).toMatchSnapshot()
  })

  it('rejects a missing cue with 400', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.historial()
    expect(await capturar(await GET(url('/historial')))).toMatchSnapshot()
  })

  it('answers 200 with an empty history for a CUE unknown to the dataset', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.historial()
    expect(await capturar(await GET(url(`/historial?cue=${CUE_INEXISTENTE}`)))).toMatchSnapshot()
  })

  it('rejects a banned user with 403', async () => {
    conUsuario(BANEADO)
    const { GET } = await rutas.historial()
    expect(await capturar(await GET(url(`/historial?cue=${CUE}`)))).toMatchSnapshot()
  })
})

describe('GET /api/mapas/infraestructura/nominal', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.nominal()
    expect(await capturar(await GET(url(`/nominal?afectacionId=${AFECTACION_INEXISTENTE}`)))).toMatchSnapshot()
  })

  it('rejects a user without nominal permission with 403', async () => {
    conUsuario(CONSULTA)
    const { GET } = await rutas.nominal()
    expect(await capturar(await GET(url(`/nominal?afectacionId=${AFECTACION_INEXISTENTE}`)))).toMatchSnapshot()
  })

  it('rejects a missing afectacionId with 400', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.nominal()
    expect(await capturar(await GET(url('/nominal')))).toMatchSnapshot()
  })

  it('answers 404 for an unknown afectacion', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.nominal()
    expect(await capturar(await GET(url(`/nominal?afectacionId=${AFECTACION_INEXISTENTE}`)))).toMatchSnapshot()
  })
})

describe('GET /api/mapas/infraestructura/parte', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.parte()
    expect(await capturar(await GET(url(`/parte?cue=${CUE}`)))).toMatchSnapshot()
  })

  it('answers 200 with the parte card and census of a school in scope', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.parte()
    expect(await capturar(await GET(url(`/parte?cue=${CUE}`)))).toMatchSnapshot()
  })

  it('rejects a missing cue with 400', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.parte()
    expect(await capturar(await GET(url('/parte')))).toMatchSnapshot()
  })

  it('answers 200 with a null parte for a CUE unknown to the dataset', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.parte()
    expect(await capturar(await GET(url(`/parte?cue=${CUE_INEXISTENTE}`)))).toMatchSnapshot()
  })

  it('rejects a banned user with 403', async () => {
    conUsuario(BANEADO)
    const { GET } = await rutas.parte()
    expect(await capturar(await GET(url(`/parte?cue=${CUE}`)))).toMatchSnapshot()
  })
})

describe('GET /api/mapas/infraestructura/referencias/eventos', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.referenciasEventos()
    expect(await capturar(await GET(url('/referencias/eventos')))).toMatchSnapshot()
  })

  it('answers 503 while the map references are not published', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.referenciasEventos()
    expect(await capturar(await GET(url('/referencias/eventos')))).toMatchSnapshot()
  })

  it('rejects a banned user with 403', async () => {
    conUsuario(BANEADO)
    const { GET } = await rutas.referenciasEventos()
    expect(await capturar(await GET(url('/referencias/eventos')))).toMatchSnapshot()
  })
})

describe('GET /api/mapas/infraestructura (root)', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.raiz()
    expect(await capturar(await GET(url('')))).toMatchSnapshot()
  })

  it('answers 200 with the current partes for an authorized user', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.raiz()
    expect(await capturar(await GET(url('')))).toMatchSnapshot()
  })

  it('rejects a banned user with 403', async () => {
    conUsuario(BANEADO)
    const { GET } = await rutas.raiz()
    expect(await capturar(await GET(url('')))).toMatchSnapshot()
  })
})

describe('GET /api/mapas/infraestructura/territorio', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.territorio()
    expect(await capturar(await GET(url('/territorio')))).toMatchSnapshot()
  })

  it('answers 200 with the territorial layers for an authorized user', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.territorio()
    expect(await capturar(await GET(url('/territorio')))).toMatchSnapshot()
  })

  it('rejects a banned user with 403', async () => {
    conUsuario(BANEADO)
    const { GET } = await rutas.territorio()
    expect(await capturar(await GET(url('/territorio')))).toMatchSnapshot()
  })
})

describe('GET /api/mapas/infraestructura/totales', () => {
  it('rejects an anonymous request with 401', async () => {
    const { GET } = await rutas.totales()
    expect(await capturar(await GET(url('/totales')))).toMatchSnapshot()
  })

  it('answers 200 with the map totals for an authorized user', async () => {
    conUsuario(ADMIN)
    const { GET } = await rutas.totales()
    expect(await capturar(await GET(url('/totales')))).toMatchSnapshot()
  })

  it('rejects a banned user with 403', async () => {
    conUsuario(BANEADO)
    const { GET } = await rutas.totales()
    expect(await capturar(await GET(url('/totales')))).toMatchSnapshot()
  })
})
