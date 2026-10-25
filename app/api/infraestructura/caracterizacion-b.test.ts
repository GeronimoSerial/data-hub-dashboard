// Characterization (golden) tests for the infraestructura route group B: radar,
// riesgo, situacion, tendencia-estacional, veredictos and verificaciones.
// Every exported handler is called with an unauthenticated request, an
// authenticated one when feasible and invalid input. Snapshots freeze status,
// content-type, cache-control and the normalized body; binary responses freeze
// only their byte length. Snapshots are the contract: never refresh them with
// `vitest -u`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { estadoReferencias } from '@/lib/infraestructura/datasets/memoria'
import { obtenerUltimoRunRadarMeteo } from '@/lib/infraestructura/radar-meteo/job-sync'
import { getSessionUser } from '@/lib/session'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

// Factory without importOriginal: the real module chain reaches @/lib/db before
// usarDbTemporal fixes DATA_DIR. staffGuard mirrors lib/session.ts.
vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(async () => null),
  staffGuard: (user: { banned: boolean; role: string } | null) => {
    if (!user) return { status: 401 as const, error: 'No autenticado' }
    if (user.banned || (user.role !== 'admin' && user.role !== 'editor')) {
      return { status: 403 as const, error: 'No tiene acceso a este recurso' }
    }
    return null
  },
}))

vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(async () => ({ ok: false, status: 401 })),
}))

// The radar-meteo run comes from the job's database table; a fixed payload keeps
// the success branch deterministic and avoids any provider call.
vi.mock('@/lib/infraestructura/radar-meteo/job-sync', () => ({
  obtenerUltimoRunRadarMeteo: vi.fn(async () => null),
}))

usarDbTemporal('infra-caracterizacion-b-', { env: { RISK_RADAR_ENABLED: 'true' } })

const FECHA_FIJA = new Date('2026-10-25T12:00:00.000Z')
const BASE = 'http://localhost/api/infraestructura'

const EDITOR = { id: 'editor-1', role: 'editor', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
const CONSULTA = { ...EDITOR, id: 'consulta-1', role: 'consulta' }
const SIN_SESION = { ok: false, status: 401 } as const
const ACCESO_LECTURA = { ok: true, user: { id: 'consulta-1' } } as never

const CUE_RIESGO = '1000000-01'
const GEO = [
  { cueAnexo: '1000000-01', departamento: 'PARANA' },
  { cueAnexo: '1000000-02', departamento: 'PARANA' },
  { cueAnexo: '1000000-03', departamento: 'CONCORDIA' },
  { cueAnexo: '1000000-04', departamento: 'PARANA' },
  { cueAnexo: '1000000-05', departamento: 'PARANA' },
]

// Radar-meteo run fixture: a 2x2 grid over 6 hourly steps.
const times = Array.from({ length: 6 }, (_, i) => `2026-10-25T0${i}:00:00.000Z`)
const RUN_RADAR = {
  id: 'run-radar-1',
  runAt: times[0],
  fetchedAt: times[0],
  model: 'best_match',
  gridVersion: 'corrientes-0.2-v1',
  units: {},
  payload: {
    times,
    cells: [
      { id: 'r-1c-1', row: -1, col: -1, lat: -0.2, lon: -0.2 },
      { id: 'r0c0', row: 0, col: 0, lat: 0, lon: 0 },
    ],
    values: {
      precipitation_probability: [[60, 11, 12, 13, 14, 15], [60, 21, 22, 23, 24, 25]],
      precipitation: [[0.11, 0.22, 0.33, 0.44, 0.55, 0.66], [0.26, 0.3, 0.4, 0.5, 0.6, 0.7]],
      wind_speed_10m: [[1.4, 2, 3, 4, 5, 6], [10, 20, 30, 40, 50, 60]],
      weather_code: [[3, 3, 3, 96, 3, 3], [3, 3, 3, 99, 3, 3]],
      cape: [[1200, 1200, 1200, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
      lifted_index: [[-1, -1, -1, null, null, null], [null, null, null, null, null, null]],
      wind_gusts_10m: [[20, 20, 20, 20, 20, 20], [20, 20, 20, 20, 20, 20]],
      freezing_level_height: [[3000, 3000, 3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000, 3000, 3000]],
    },
  },
}

const cargarRutas = async () => ({
  radar: await import('./radar/route'),
  radarMeteo: await import('./radar-meteo/route'),
  radarMeteoAlertas: await import('./radar-meteo/alertas/route'),
  radarMeteoResumen: await import('./radar-meteo/resumen/route'),
  radarMeteoEscuela: await import('./radar-meteo/escuela/[cueAnexo]/route'),
  riesgo: await import('./riesgo/route'),
  riesgoSnapshot: await import('./riesgo/[snapshotId]/route'),
  riesgoEscuela: await import('./riesgo/escuela/[cueAnexo]/route'),
  situacion: await import('./situacion/route'),
  situacionCambios: await import('./situacion/cambios/route'),
  situacionExport: await import('./situacion/export/route'),
  tendencia: await import('./tendencia-estacional/route'),
  veredictos: await import('./veredictos/route'),
  veredictosEnlaces: await import('./veredictos/enlaces/route'),
  veredictosEventos: await import('./veredictos/eventos/route'),
  veredictosHistorial: await import('./veredictos/historial/route'),
  veredictosPdf: await import('./veredictos/pdf/route'),
  verificaciones: await import('./verificaciones/route'),
  verificacionCancelar: await import('./verificaciones/[id]/cancelar/route'),
  verificacionResponder: await import('./verificaciones/[id]/responder-asistida/route'),
})

let rutas: Awaited<ReturnType<typeof cargarRutas>>
let PERIODO = ''

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FECHA_FIJA)
  // Any real network call fails loudly instead of reaching a provider.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      throw new Error(`fetch bloqueado en test: ${String(url)}`)
    }),
  )

  const seed = await import('@/lib/db/seed')
  PERIODO = seed.PERIODO_ENOS_2026_2027_ID
  rutas = await cargarRutas()

  const { getDb } = await import('@/lib/db')
  const { infraGeoProfile } = await import('@/lib/db/schema')
  const { sembrarMotorBase } = await import('@/lib/infraestructura/riesgo/__fixtures__/motor-api')
  await getDb().insert(infraGeoProfile).values(
    GEO.map((g) => ({
      cueAnexo: g.cueAnexo,
      lat: -31.7,
      lon: -60.5,
      geoCalidad: 'alta',
      departamento: g.departamento,
      geometryRef: '-31.7_-60.5',
      motivoExclusion: null,
      perfilVersion: 'v1',
      calculadoEn: '2026-01-01T00:00:00Z',
    })),
  )
  await sembrarMotorBase(PERIODO)

  // Published reference datasets (as in eventos-terreno.test.ts): one event
  // inside the default window, so the list and PDF branches carry data.
  const { parsearCsv } = await import('@/lib/infraestructura/veredicto/eventos-terreno')
  const estado = estadoReferencias()
  estado.cargadoEn = Date.now()
  estado.referencias.set('registro-eventos', {
    versionId: 'eventos-test',
    revision: 'v1',
    documento: parsearCsv(
      [
        'id_evento,clase,tipo_afectacion,departamento,localidad,inicio_evento,fin_evento,estado_temporal,ultima_actualizacion,evidencias,confianza',
        'EVT-1,evento_publico,Crecida,PARANA,Parana,2026-10-24,,ocurrido,2026-10-24,EVD-001,alta',
      ].join('\n'),
    ),
  })
  estado.referencias.set('evidencias-inundaciones', {
    versionId: 'evidencias-test',
    revision: 'v1',
    documento: parsearCsv(
      [
        'id_evidencia,fuente,autor_organismo,titulo,url,fecha_publicacion,verificacion',
        'EVD-001,SMN,Servicio Meteorologico,Alerta amarilla,https://example.invalid/evd-001,2026-10-24,verificada',
      ].join('\n'),
    ),
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(getSessionUser).mockResolvedValue(null)
  vi.mocked(verificarAccesoLectura).mockReset()
  vi.mocked(verificarAccesoLectura).mockResolvedValue(SIN_SESION as never)
  vi.mocked(obtenerUltimoRunRadarMeteo).mockReset()
  vi.mocked(obtenerUltimoRunRadarMeteo).mockResolvedValue(RUN_RADAR as never)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function autenticarLectura() {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(ACCESO_LECTURA)
}

function autenticarStaff(usuario: typeof EDITOR | typeof CONSULTA = EDITOR) {
  vi.mocked(getSessionUser).mockResolvedValue(usuario as never)
}

function get(ruta: string, query = ''): Request {
  return new Request(`${BASE}${ruta}${query}`)
}

function enviar(ruta: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', cuerpo?: unknown): Request {
  const texto = typeof cuerpo === 'string' ? cuerpo : cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  return new Request(`${BASE}${ruta}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: texto,
  })
}

type Capturada = { status: number; contentType: string | null; cacheControl: string | null; body: unknown }

async function capturar(res: Response): Promise<Capturada> {
  const contentType = res.headers.get('content-type')
  const texto = await res.text()
  const body = texto === '' ? null : contentType?.includes('application/json') ? JSON.parse(texto) : texto
  return { status: res.status, contentType, cacheControl: res.headers.get('cache-control'), body }
}

// The PDF size embeds the generation date, so only its signature is frozen.
async function capturarBinaria(res: Response) {
  const bytes = await res.arrayBuffer()
  return { status: res.status, contentType: res.headers.get('content-type'), cacheControl: res.headers.get('cache-control'), pdf: new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-' }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})/g

// Replaces volatile values with stable placeholders, keeping identity: the same
// uuid always maps to the same placeholder within one snapshot.
// Creates a verificación through the public POST handler and returns its id.
async function crearVerificacion(cueAnexo: string): Promise<string> {
  autenticarStaff()
  const res = await rutas.verificaciones.POST(enviar('/verificaciones', 'POST', { cueAnexo }))
  const cuerpo = (await res.json()) as { verificacion: { id: string } }
  return cuerpo.verificacion.id
}

function normalizar(valor: unknown): unknown {
  const ids = new Map<string, string>()
  const texto = JSON.stringify(valor)
    .replace(UUID, (id) => {
      if (!ids.has(id)) ids.set(id, `<id-${ids.size + 1}>`)
      return ids.get(id)!
    })
    .replace(ISO, '<fecha>')
    .replace(/\/veredicto\/compartido\/[^"]+/g, '/veredicto/compartido/<token>')
    .replace(/"token":"[^"]*"/g, '"token":"<token>"')
  return JSON.parse(texto)
}

describe('GET /api/infraestructura/radar', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.radar.GET(get('/radar'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('responde 403 cuando el usuario no tiene acceso al recurso', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 403 })
    const res = await rutas.radar.GET(get('/radar'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin acceso')
  })

  it('rechaza un horizonte fuera de catálogo', async () => {
    autenticarLectura()
    const res = await rutas.radar.GET(get('/radar', '?horizonte=7'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('horizonte invalido')
  })

  it('rechaza un nivel desconocido', async () => {
    autenticarLectura()
    const res = await rutas.radar.GET(get('/radar', '?nivel=extremo'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('nivel invalido')
  })

  it('lista la vista para un usuario autenticado', async () => {
    autenticarLectura()
    const res = await rutas.radar.GET(get('/radar', '?horizonte=24&pageSize=5'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })
})

describe('GET /api/infraestructura/radar-meteo', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.radarMeteo.GET(get('/radar-meteo'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('responde 404 con el flag de radar apagado', async () => {
    vi.stubEnv('RISK_RADAR_ENABLED', 'false')
    autenticarLectura()
    const res = await rutas.radarMeteo.GET(get('/radar-meteo'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('flag apagado')
  })

  it('rechaza una variable desconocida', async () => {
    autenticarLectura()
    const res = await rutas.radarMeteo.GET(get('/radar-meteo', '?variables=no_existe'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('variable invalida')
  })

  it('rechaza una fecha que no es ISO', async () => {
    autenticarLectura()
    const res = await rutas.radarMeteo.GET(get('/radar-meteo', '?desde=ayer'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('fecha invalida')
  })

  it('representa la ausencia de corrida sin ceros', async () => {
    autenticarLectura()
    vi.mocked(obtenerUltimoRunRadarMeteo).mockResolvedValueOnce(null as never)
    const res = await rutas.radarMeteo.GET(get('/radar-meteo'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin corrida')
  })

  it('devuelve las variables pedidas de la última corrida', async () => {
    autenticarLectura()
    const res = await rutas.radarMeteo.GET(get('/radar-meteo', '?variables=precipitation_probability,wind_speed_10m'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('con corrida')
  })
})

describe('GET /api/infraestructura/radar-meteo/alertas', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.radarMeteoAlertas.GET(new Request('http://localhost/api'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('responde 404 con el flag de radar apagado', async () => {
    vi.stubEnv('RISK_RADAR_ENABLED', 'false')
    autenticarLectura()
    const res = await rutas.radarMeteoAlertas.GET(new Request('http://localhost/api'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('flag apagado')
  })

  it('lista las alertas SMN activas (vacías en la base de test)', async () => {
    autenticarLectura()
    const res = await rutas.radarMeteoAlertas.GET(new Request('http://localhost/api'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })
})

describe('GET /api/infraestructura/radar-meteo/resumen', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.radarMeteoResumen.GET(get('/radar-meteo/resumen'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('responde 404 con el flag de radar apagado', async () => {
    vi.stubEnv('RISK_RADAR_ENABLED', 'false')
    autenticarLectura()
    const res = await rutas.radarMeteoResumen.GET(get('/radar-meteo/resumen'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('flag apagado')
  })

  it('resume la corrida vigente', async () => {
    autenticarLectura()
    const res = await rutas.radarMeteoResumen.GET(get('/radar-meteo/resumen'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })

  it('responde 304 cuando el ETag coincide', async () => {
    autenticarLectura()
    const primera = await rutas.radarMeteoResumen.GET(get('/radar-meteo/resumen'))
    const etag = primera.headers.get('etag')!
    const req = new Request(`${BASE}/radar-meteo/resumen`, { headers: { 'if-none-match': etag } })
    const res = await rutas.radarMeteoResumen.GET(req)
    expect(normalizar(await capturar(res))).toMatchSnapshot('etag coincide')
  })
})

describe('GET /api/infraestructura/radar-meteo/escuela/[cueAnexo]', () => {
  const ctx = (cueAnexo: string) => ({ params: Promise.resolve({ cueAnexo }) })

  it('responde 401 sin sesión', async () => {
    const res = await rutas.radarMeteoEscuela.GET(get(`/radar-meteo/escuela/${CUE_RIESGO}`), ctx(CUE_RIESGO))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('responde 404 con el flag de radar apagado', async () => {
    vi.stubEnv('RISK_RADAR_ENABLED', 'false')
    autenticarLectura()
    const res = await rutas.radarMeteoEscuela.GET(get(`/radar-meteo/escuela/${CUE_RIESGO}`), ctx(CUE_RIESGO))
    expect(normalizar(await capturar(res))).toMatchSnapshot('flag apagado')
  })

  it('responde 404 para una escuela que no existe en el mapa', async () => {
    autenticarLectura()
    const res = await rutas.radarMeteoEscuela.GET(get('/radar-meteo/escuela/9999999-99'), ctx('9999999-99'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('escuela inexistente')
  })
})

describe('GET /api/infraestructura/riesgo', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.riesgo.GET(get('/riesgo'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('rechaza un horizonte fuera de catálogo', async () => {
    autenticarLectura()
    const res = await rutas.riesgo.GET(get('/riesgo', '?horizonte=5'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('horizonte invalido')
  })

  it('rechaza un pageSize fuera de rango', async () => {
    autenticarLectura()
    const res = await rutas.riesgo.GET(get('/riesgo', '?pageSize=500'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('pageSize invalido')
  })

  it('lista el corte vigente sembrado', async () => {
    autenticarLectura()
    const res = await rutas.riesgo.GET(get('/riesgo', '?horizonte=24&pageSize=5'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })

  it('representa la ausencia de corte vigente sin error', async () => {
    autenticarLectura()
    const { getDb } = await import('@/lib/db')
    const { infraRiskRun } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    await getDb().update(infraRiskRun).set({ estado: 'historico' }).where(eq(infraRiskRun.estado, 'vigente'))
    try {
      const res = await rutas.riesgo.GET(get('/riesgo'))
      expect(normalizar(await capturar(res))).toMatchSnapshot('sin corte vigente')
    } finally {
      await getDb().update(infraRiskRun).set({ estado: 'vigente' }).where(eq(infraRiskRun.estado, 'historico'))
    }
  })
})

describe('GET /api/infraestructura/riesgo/[snapshotId]', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.riesgoSnapshot.GET(get('/riesgo/snap-x'), { params: Promise.resolve({ snapshotId: 'snap-x' }) })
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('devuelve el snapshot sembrado', async () => {
    autenticarLectura()
    const { getDb } = await import('@/lib/db')
    const { infraRiskSnapshot } = await import('@/lib/db/schema')
    const [snapshot] = await getDb().select().from(infraRiskSnapshot).limit(1)
    const res = await rutas.riesgoSnapshot.GET(get(`/riesgo/${snapshot!.id}`), { params: Promise.resolve({ snapshotId: snapshot!.id }) })
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })

  it('responde 404 para un snapshot inexistente', async () => {
    autenticarLectura()
    const res = await rutas.riesgoSnapshot.GET(get('/riesgo/no-existe'), { params: Promise.resolve({ snapshotId: 'no-existe' }) })
    expect(normalizar(await capturar(res))).toMatchSnapshot('inexistente')
  })
})

describe('GET /api/infraestructura/riesgo/escuela/[cueAnexo]', () => {
  const ctx = (cueAnexo: string) => ({ params: Promise.resolve({ cueAnexo }) })

  it('responde 401 sin sesión', async () => {
    const res = await rutas.riesgoEscuela.GET(get(`/riesgo/escuela/${CUE_RIESGO}`), ctx(CUE_RIESGO))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('rechaza un horizonte fuera de catálogo', async () => {
    autenticarLectura()
    const res = await rutas.riesgoEscuela.GET(get(`/riesgo/escuela/${CUE_RIESGO}`, '?horizonte=99'), ctx(CUE_RIESGO))
    expect(normalizar(await capturar(res))).toMatchSnapshot('horizonte invalido')
  })

  it('devuelve la ficha de riesgo de la escuela sembrada', async () => {
    autenticarLectura()
    const res = await rutas.riesgoEscuela.GET(get(`/riesgo/escuela/${CUE_RIESGO}`, '?horizonte=24'), ctx(CUE_RIESGO))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })
})

describe('GET /api/infraestructura/situacion', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.situacion.GET(get('/situacion'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('responde 403 a un usuario sin rol staff', async () => {
    autenticarStaff(CONSULTA)
    const res = await rutas.situacion.GET(get('/situacion'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('consulta')
  })

  it('rechaza un tipo de territorio no soportado', async () => {
    autenticarStaff()
    const res = await rutas.situacion.GET(get('/situacion', '?territorioTipo=pais'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('territorio invalido')
  })

  it('devuelve el estado de situación para staff', async () => {
    autenticarStaff()
    const res = await rutas.situacion.GET(get('/situacion'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })
})

describe('GET /api/infraestructura/situacion/cambios', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.situacionCambios.GET(get('/situacion/cambios', '?desde=2026-01-01T00:00:00Z'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('rechaza un desde que no es fecha-hora ISO', async () => {
    autenticarStaff()
    const res = await rutas.situacionCambios.GET(get('/situacion/cambios', '?desde=ayer'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('desde invalido')
  })

  it('lista los cambios desde la fecha pedida', async () => {
    autenticarStaff()
    const res = await rutas.situacionCambios.GET(get('/situacion/cambios', '?desde=2026-01-01T00:00:00Z'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })
})

describe('GET /api/infraestructura/situacion/export', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.situacionExport.GET(get('/situacion/export'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('rechaza un formato desconocido', async () => {
    autenticarStaff()
    const res = await rutas.situacionExport.GET(get('/situacion/export', '?formato=xml'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('formato invalido')
  })

  it('exporta el último corte en JSON', async () => {
    autenticarStaff()
    const res = await rutas.situacionExport.GET(get('/situacion/export'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('json')
  })

  it('exporta el último corte en CSV', async () => {
    autenticarStaff()
    const res = await rutas.situacionExport.GET(get('/situacion/export', '?formato=csv'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('csv')
  })
})

describe('GET /api/infraestructura/tendencia-estacional', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.tendencia.GET(get('/tendencia-estacional'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('rechaza un departamento demasiado largo', async () => {
    autenticarStaff()
    const res = await rutas.tendencia.GET(get('/tendencia-estacional', `?departamento=${'A'.repeat(101)}`))
    expect(normalizar(await capturar(res))).toMatchSnapshot('departamento invalido')
  })

  it('devuelve la tendencia para staff', async () => {
    autenticarStaff()
    const res = await rutas.tendencia.GET(get('/tendencia-estacional', '?departamento=PARANA'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })
})

describe('GET /api/infraestructura/veredictos', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.veredictos.GET(get('/veredictos'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('responde 403 a un usuario sin rol staff', async () => {
    autenticarStaff(CONSULTA)
    const res = await rutas.veredictos.GET(get('/veredictos'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('consulta')
  })

  it('rechaza una fecha inexistente', async () => {
    autenticarStaff()
    const res = await rutas.veredictos.GET(get('/veredictos', '?desde=2026-13-01'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('fecha invalida')
  })

  it('lista los veredictos vigentes de la ventana', async () => {
    autenticarStaff()
    const res = await rutas.veredictos.GET(get('/veredictos'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })
})

describe('veredictos/enlaces POST and DELETE', () => {
  it('POST responde 401 sin sesión', async () => {
    const res = await rutas.veredictosEnlaces.POST(enviar('/veredictos/enlaces', 'POST', {}))
    expect(normalizar(await capturar(res))).toMatchSnapshot('post sin sesion')
  })

  it('POST rechaza una fecha con formato inválido', async () => {
    autenticarStaff()
    const res = await rutas.veredictosEnlaces.POST(enviar('/veredictos/enlaces', 'POST', { desde: '01/10/2026' }))
    expect(normalizar(await capturar(res))).toMatchSnapshot('post fecha invalida')
  })

  it('POST rechaza un rango con desde posterior a hasta', async () => {
    autenticarStaff()
    const res = await rutas.veredictosEnlaces.POST(
      enviar('/veredictos/enlaces', 'POST', { desde: '2026-10-25', hasta: '2026-10-24' }),
    )
    expect(normalizar(await capturar(res))).toMatchSnapshot('post rango invertido')
  })

  it('POST crea un enlace compartible con el rango pedido', async () => {
    autenticarStaff()
    const res = await rutas.veredictosEnlaces.POST(
      enviar('/veredictos/enlaces', 'POST', { desde: '2026-10-24', hasta: '2026-10-25' }),
    )
    expect(normalizar(await capturar(res))).toMatchSnapshot('post autenticado')
  })

  it('DELETE responde 401 sin sesión', async () => {
    const res = await rutas.veredictosEnlaces.DELETE(new Request('http://localhost/api'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('delete sin sesion')
  })

  it('DELETE revoca los enlaces del día para staff', async () => {
    autenticarStaff()
    const res = await rutas.veredictosEnlaces.DELETE(new Request('http://localhost/api'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('delete autenticado')
  })
})

describe('GET /api/infraestructura/veredictos/eventos', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.veredictosEventos.GET(get('/veredictos/eventos', '?desde=2026-10-24&hasta=2026-10-25'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('rechaza un rango sin parámetros obligatorios', async () => {
    autenticarStaff()
    const res = await rutas.veredictosEventos.GET(get('/veredictos/eventos'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin parametros')
  })

  it('lista los eventos de terreno del rango', async () => {
    autenticarStaff()
    const res = await rutas.veredictosEventos.GET(get('/veredictos/eventos', '?desde=2026-10-24&hasta=2026-10-25'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })
})

describe('GET /api/infraestructura/veredictos/historial', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.veredictosHistorial.GET(get('/veredictos/historial', '?fecha=2026-10-25&ambito=PARANA'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('rechaza una petición sin fecha', async () => {
    autenticarStaff()
    const res = await rutas.veredictosHistorial.GET(get('/veredictos/historial', '?ambito=PARANA'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin fecha')
  })

  it('rechaza una petición sin ámbito', async () => {
    autenticarStaff()
    const res = await rutas.veredictosHistorial.GET(get('/veredictos/historial', '?fecha=2026-10-25'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin ambito')
  })

  it('lista las versiones del veredicto', async () => {
    autenticarStaff()
    const res = await rutas.veredictosHistorial.GET(get('/veredictos/historial', '?fecha=2026-10-25&ambito=PARANA'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
  })
})

describe('GET /api/infraestructura/veredictos/pdf', () => {
  it('responde 401 sin sesión', async () => {
    const res = await rutas.veredictosPdf.GET(get('/veredictos/pdf'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('rechaza un rango con fechas inválidas', async () => {
    autenticarStaff()
    const res = await rutas.veredictosPdf.GET(get('/veredictos/pdf', '?desde=2026-02-30'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('fecha invalida')
  })

  it('genera el PDF de la ventana (sólo status, content-type y tamaño)', async () => {
    autenticarStaff()
    const res = await rutas.veredictosPdf.GET(get('/veredictos/pdf'))
    expect(await capturarBinaria(res)).toMatchSnapshot('autenticado')
  })
})

describe('verificaciones GET and POST', () => {
  it('GET responde 401 sin sesión', async () => {
    const res = await rutas.verificaciones.GET(get('/verificaciones'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('get sin sesion')
  })

  it('GET lista las verificaciones para staff', async () => {
    autenticarStaff()
    const res = await rutas.verificaciones.GET(get('/verificaciones'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('get autenticado')
  })

  it('POST responde 401 sin sesión', async () => {
    const res = await rutas.verificaciones.POST(enviar('/verificaciones', 'POST', { cueAnexo: CUE_RIESGO }))
    expect(normalizar(await capturar(res))).toMatchSnapshot('post sin sesion')
  })

  it('POST rechaza un cuerpo que no es JSON', async () => {
    autenticarStaff()
    const res = await rutas.verificaciones.POST(enviar('/verificaciones', 'POST', '{no-json'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('post cuerpo invalido')
  })

  it('POST rechaza un cuerpo sin cueAnexo', async () => {
    autenticarStaff()
    const res = await rutas.verificaciones.POST(enviar('/verificaciones', 'POST', {}))
    expect(normalizar(await capturar(res))).toMatchSnapshot('post sin cue')
  })

  it('POST crea una verificación y devuelve el token en claro una sola vez', async () => {
    autenticarStaff()
    const res = await rutas.verificaciones.POST(enviar('/verificaciones', 'POST', { cueAnexo: '1000000-03' }))
    expect(normalizar(await capturar(res))).toMatchSnapshot('post autenticado')
  })
})

describe('POST /api/infraestructura/verificaciones/[id]/cancelar', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it('responde 401 sin sesión', async () => {
    const res = await rutas.verificacionCancelar.POST(enviar('/verificaciones/x/cancelar', 'POST', {}), ctx('x'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('rechaza un cuerpo que no es JSON', async () => {
    autenticarStaff()
    const res = await rutas.verificacionCancelar.POST(enviar('/verificaciones/x/cancelar', 'POST', '{no-json'), ctx('x'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('cuerpo invalido')
  })

  it('cancela una verificación creada y informa que ya estaba cancelada', async () => {
    const id = await crearVerificacion('1000000-04')
    const res = await rutas.verificacionCancelar.POST(enviar(`/verificaciones/${id}/cancelar`, 'POST', { motivo: 'prueba' }), ctx(id))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
    const repetida = await rutas.verificacionCancelar.POST(enviar(`/verificaciones/${id}/cancelar`, 'POST', {}), ctx(id))
    expect(normalizar(await capturar(repetida))).toMatchSnapshot('ya cancelada')
  })

  it('informa una verificación inexistente', async () => {
    autenticarStaff()
    const res = await rutas.verificacionCancelar.POST(enviar('/verificaciones/no-existe/cancelar', 'POST', {}), ctx('no-existe'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('inexistente')
  })
})

describe('POST /api/infraestructura/verificaciones/[id]/responder-asistida', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it('responde 401 sin sesión', async () => {
    const res = await rutas.verificacionResponder.POST(enviar('/verificaciones/x/responder-asistida', 'POST', {}), ctx('x'))
    expect(normalizar(await capturar(res))).toMatchSnapshot('sin sesion')
  })

  it('rechaza un canal desconocido', async () => {
    autenticarStaff()
    const res = await rutas.verificacionResponder.POST(
      enviar('/verificaciones/x/responder-asistida', 'POST', { canal: 'carta', resultado: 'sin_afectacion' }),
      ctx('x'),
    )
    expect(normalizar(await capturar(res))).toMatchSnapshot('canal invalido')
  })

  it('registra la respuesta asistida y rechaza una segunda respuesta', async () => {
    const id = await crearVerificacion('1000000-05')
    const ruta = `/verificaciones/${id}/responder-asistida`
    const cuerpo = { canal: 'telefono', resultado: 'sin_afectacion' }
    const res = await rutas.verificacionResponder.POST(enviar(ruta, 'POST', cuerpo), ctx(id))
    expect(normalizar(await capturar(res))).toMatchSnapshot('autenticado')
    const repetida = await rutas.verificacionResponder.POST(enviar(ruta, 'POST', cuerpo), ctx(id))
    expect(normalizar(await capturar(repetida))).toMatchSnapshot('ya respondida')
  })

  it('informa una verificación inexistente', async () => {
    autenticarStaff()
    const res = await rutas.verificacionResponder.POST(
      enviar('/verificaciones/no-existe/responder-asistida', 'POST', { canal: 'telefono', resultado: 'sin_afectacion' }),
      ctx('no-existe'),
    )
    expect(normalizar(await capturar(res))).toMatchSnapshot('inexistente')
  })
})
