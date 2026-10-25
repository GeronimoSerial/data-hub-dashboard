// Characterization (golden) test of the misc API group: auth, hub, gate,
// materiales, problematicas (acceso, contexto, verificaciones), recursos,
// taxonomia, usuarios and the public veredicto PDF. Every exported handler is
// called the way a client would call it and its response is frozen. Route
// wrapping (ruta(), error envelopes) must keep these snapshots identical;
// x-request-id is deliberately not part of the snapshot.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRawClient } from '@/lib/db'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { crearVerificacion, responderPorEnlace } from '@/lib/infraestructura/verificaciones'
import { getSessionUser } from '@/lib/session'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

const s3 = vi.hoisted(() => ({ firmar: vi.fn(), leerConfig: vi.fn() }))

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  getSessionUser: vi.fn(async () => null),
}))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    destroy() {}
  },
  GetObjectCommand: class {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: s3.firmar }))
// The field-events dataset is not published in the test database; the PDF is still
// generated for real, just without field events.
vi.mock('@/lib/infraestructura/veredicto/eventos-terreno', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/infraestructura/veredicto/eventos-terreno')>()),
  cargarEventosTerreno: vi.fn(async () => []),
}))
vi.mock('@/lib/infraestructura/adjuntos/obs', () => ({
  readObsConfig: s3.leerConfig,
  opcionesClienteObs: () => ({}),
}))

// claveDePrueba() is random per call: one value must serve both the env and the cases.
const CLAVE_ACCESO = claveDePrueba()

usarDbTemporal('caracterizacion-api', {
  env: {
    PROBLEMATICAS_ACCESO_PASSWORD: CLAVE_ACCESO,
    ADMIN_EMAIL: undefined,
    ADMIN_PASSWORD: undefined,
    AI_API_KEY: undefined,
    OPENAI_API_KEY: undefined,
    MATERIALES_STORAGE: undefined,
  },
})

const CUE_CONTEXTO = '1801610-71'
const CUE_SIN_SECCIONES = '1801610-72'
const SECCION_MANANA = 7210
const ALUMNOS = [72000, 72001]

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})/g

// Same contract as normalizar() in app/api/problematicas/parte/caracterizacion.test.ts.
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

// Keeps keys and value types, drops the values: for large catalogs the shape is the contract.
function forma(valor: unknown): unknown {
  if (Array.isArray(valor)) return { $items: valor.length, $primero: valor.length ? forma(valor[0]) : null }
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([clave, v]) => [clave, forma(v)]))
  }
  return valor === null ? null : typeof valor
}

// Binary and empty bodies are reduced to their byte length (PDFs, whose size embeds
// the generation date, to their signature); JSON is kept whole (or as shape).
function binario(tipo: string | null, bytes: ArrayBuffer) {
  if (tipo?.includes('pdf')) return { pdf: new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-' }
  return { bytes: bytes.byteLength }
}

async function capturar(res: Response, { soloForma = false } = {}) {
  const tipo = res.headers.get('content-type')
  let body: unknown = null
  if (tipo?.includes('json')) body = await res.json()
  else if (res.body) body = binario(tipo, await res.arrayBuffer())
  return normalizar({
    status: res.status,
    contentType: tipo,
    cacheControl: res.headers.get('cache-control'),
    location: res.headers.get('location'),
    body: soloForma ? forma(body) : body,
  })
}

function req(url: string, init?: RequestInit): Request {
  return new Request(`http://localhost${url}`, init)
}

function conJson(metodo: string, url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return req(url, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function conCookieDeParte(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('cookie', `${NOMBRE_COOKIE}=${crearTokenSesion().token}`)
  return req(url, { ...init, headers })
}

const ctx = <T extends Record<string, string | string[]>>(params: T) => ({ params: Promise.resolve(params) })

const ADMIN = {
  id: 'usuario-admin',
  role: 'admin',
  banned: false,
  nivelJurIds: [],
  accesoRecursos: 'todos',
  recursoIds: [],
}
const EDITOR = { ...ADMIN, id: 'usuario-editor', role: 'editor' }
const CONSULTA = { ...ADMIN, id: 'usuario-consulta', role: 'consulta' }

function comoUsuario(usuario: unknown) {
  vi.mocked(getSessionUser).mockResolvedValue(usuario as never)
}

beforeEach(() => {
  comoUsuario(null)
  _resetLimitesParaTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  s3.firmar.mockReset()
  s3.leerConfig.mockReset()
})

beforeAll(async () => {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE_CONTEXTO}', NULL, 'Escuela contexto', 'ER', 'Parana')`,
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE_SIN_SECCIONES}', NULL, 'Escuela sin secciones', 'ER', 'Parana')`,
  )
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ${SECCION_MANANA}, '${CUE_CONTEXTO}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
  )
  for (const alumno of ALUMNOS) {
    await client.execute({
      sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
      args: [SECCION_MANANA, alumno],
    })
  }

  // Fixture for the local-storage download; the route reads it from DATA_DIR.
  const { materialesPublicados } = await import('@/lib/materiales')
  const { getDataDir } = await import('@/lib/data-dir')
  const material = materialesPublicados.find((m) => m.id === 'manual-1')!
  mkdirSync(path.join(getDataDir(), 'materiales'), { recursive: true })
  writeFileSync(path.join(getDataDir(), 'materiales', material.archivo), '%PDF-1.4 fixture')
})

describe('auth', () => {
  it('ge-login OPTIONS from a disallowed origin', async () => {
    const { OPTIONS } = await import('./auth/ge-login/route')
    const res = await OPTIONS(req('/api/auth/ge-login', { method: 'OPTIONS', headers: { origin: 'https://sitio-ajeno.example' } }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('ge-login POST without origin is refused before any upstream call', async () => {
    const { POST } = await import('./auth/ge-login/route')
    const res = await POST(conJson('POST', '/api/auth/ge-login', { usuario: 'x', clave: 'y' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('ge-login POST with a disallowed origin and a malformed body', async () => {
    const { POST } = await import('./auth/ge-login/route')
    const res = await POST(conJson('POST', '/api/auth/ge-login', '{no-json', { origin: 'https://sitio-ajeno.example' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it.skip('ge-login POST from an allowed origin: reaches the external GE SSO upstream, not exercised offline', () => {})

  it('better-auth GET get-session without a cookie', async () => {
    const { GET } = await import('./auth/[...all]/route')
    const res = await GET(req('/api/auth/get-session'))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('better-auth GET of an unknown auth path', async () => {
    const { GET } = await import('./auth/[...all]/route')
    const res = await GET(req('/api/auth/ruta-que-no-existe'))
    expect(await capturar(res)).toMatchSnapshot()
  })
})

describe('hub and gate', () => {
  it('GET /api/hub without session returns the published catalog', async () => {
    const { GET } = await import('./hub/route')
    const res = await GET(new Request('http://localhost/api'))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('GET /api/hub/admin without session is denied', async () => {
    const { GET } = await import('./hub/admin/route')
    expect(await capturar(await GET(new Request('http://localhost/api')))).toMatchSnapshot()
  })

  it('GET /api/hub/admin as consulta is forbidden', async () => {
    comoUsuario(CONSULTA)
    const { GET } = await import('./hub/admin/route')
    expect(await capturar(await GET(new Request('http://localhost/api')))).toMatchSnapshot()
  })

  it('GET /api/hub/admin as admin returns the full catalog', async () => {
    comoUsuario(ADMIN)
    const { GET } = await import('./hub/admin/route')
    expect(await capturar(await GET(new Request('http://localhost/api')))).toMatchSnapshot()
  })

  it('GET /api/gate without session redirects to login', async () => {
    const { GET } = await import('./gate/[...path]/route')
    const res = await GET(req('/api/gate/manual-1.pdf?x=1'), ctx({ path: ['manual-1.pdf'] }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('GET /api/gate as admin for an unregistered path is 404', async () => {
    comoUsuario(ADMIN)
    const { GET } = await import('./gate/[...path]/route')
    const res = await GET(req('/api/gate/no/existe.pdf'), ctx({ path: ['no', 'existe.pdf'] }))
    expect(await capturar(res)).toMatchSnapshot()
  })
})

describe('materiales/[id]/descargar', () => {
  it('unknown material is 404', async () => {
    const { GET } = await import('./materiales/[id]/descargar/route')
    const res = await GET(req('/api/materiales/no-existe/descargar'), ctx({ id: 'no-existe' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('local PDF is served as an attachment with a byte length', async () => {
    const { GET } = await import('./materiales/[id]/descargar/route')
    const res = await GET(req('/api/materiales/manual-1/descargar'), ctx({ id: 'manual-1' }))
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('local storage without the file is a retryable 503', async () => {
    const { materialesPublicados } = await import('@/lib/materiales')
    const sinArchivo = materialesPublicados.find((m) => m.id !== 'manual-1')!.id
    const { GET } = await import('./materiales/[id]/descargar/route')
    const res = await GET(req(`/api/materiales/${sinArchivo}/descargar`), ctx({ id: sinArchivo }))
    expect(res.headers.get('retry-after')).toBe('60')
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('s3 storage answers a 307 to a presigned URL that is never cached', async () => {
    vi.stubEnv('MATERIALES_STORAGE', 's3')
    s3.leerConfig.mockReturnValue({ bucket: 'bucket-test' })
    s3.firmar.mockResolvedValue('https://storage.example/firmada')
    const { GET } = await import('./materiales/[id]/descargar/route')
    const res = await GET(req('/api/materiales/manual-1/descargar'), ctx({ id: 'manual-1' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('s3 signing failure is the same retryable 503', async () => {
    vi.stubEnv('MATERIALES_STORAGE', 's3')
    s3.leerConfig.mockReturnValue({ bucket: 'bucket-test' })
    s3.firmar.mockRejectedValue(new Error('firma fallida'))
    const { GET } = await import('./materiales/[id]/descargar/route')
    const res = await GET(req('/api/materiales/manual-1/descargar'), ctx({ id: 'manual-1' }))
    expect(await capturar(res)).toMatchSnapshot()
  })
})

describe('problematicas/acceso', () => {
  const url = '/api/problematicas/acceso'

  it('malformed JSON is 400', async () => {
    const { POST } = await import('./problematicas/acceso/route')
    expect(await capturar(await POST(conJson('POST', url, '{no-json')))).toMatchSnapshot()
  })

  it('missing password is 400', async () => {
    const { POST } = await import('./problematicas/acceso/route')
    expect(await capturar(await POST(conJson('POST', url, {})))).toMatchSnapshot()
  })

  it('wrong password is 401', async () => {
    const { POST } = await import('./problematicas/acceso/route')
    expect(await capturar(await POST(conJson('POST', url, { password: 'incorrecta' })))).toMatchSnapshot()
  })

  it('correct password is 200 and sets the access cookie', async () => {
    const { POST } = await import('./problematicas/acceso/route')
    const res = await POST(conJson('POST', url, { password: CLAVE_ACCESO }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain(NOMBRE_COOKIE)
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('the eleventh attempt from one IP is rate limited', async () => {
    const { POST } = await import('./problematicas/acceso/route')
    const headers = { 'x-forwarded-for': '203.0.113.50' }
    let res: Response | null = null
    for (let i = 0; i < 11; i++) {
      res = await POST(conJson('POST', url, { password: 'incorrecta' }, headers))
    }
    expect(await capturar(res!)).toMatchSnapshot()
  })
})

describe('problematicas/contexto', () => {
  const url = '/api/problematicas/contexto'

  it('without session or cue is refused', async () => {
    const { GET } = await import('./problematicas/contexto/route')
    expect(await capturar(await GET(req(url)))).toMatchSnapshot()
  })

  it('without session and with a cue is refused', async () => {
    const { GET } = await import('./problematicas/contexto/route')
    expect(await capturar(await GET(req(`${url}?cue=${CUE_CONTEXTO}`)))).toMatchSnapshot()
  })

  it('with session and no cue is 400', async () => {
    const { GET } = await import('./problematicas/contexto/route')
    expect(await capturar(await GET(conCookieDeParte(url)))).toMatchSnapshot()
  })

  it('with session and an invalid cue is 400', async () => {
    const { GET } = await import('./problematicas/contexto/route')
    expect(await capturar(await GET(conCookieDeParte(`${url}?cue=abc`)))).toMatchSnapshot()
  })

  it('with session and an unknown cue is 404', async () => {
    const { GET } = await import('./problematicas/contexto/route')
    expect(await capturar(await GET(conCookieDeParte(`${url}?cue=9999999-99`)))).toMatchSnapshot()
  })

  it('with session and a school without sections is 404', async () => {
    const { GET } = await import('./problematicas/contexto/route')
    expect(await capturar(await GET(conCookieDeParte(`${url}?cue=${CUE_SIN_SECCIONES}`)))).toMatchSnapshot()
  })

  it('with session and a known cue returns the context', async () => {
    const { GET } = await import('./problematicas/contexto/route')
    expect(await capturar(await GET(conCookieDeParte(`${url}?cue=${CUE_CONTEXTO}`)))).toMatchSnapshot()
  })
})

describe('problematicas/verificaciones/[id]', () => {
  let contadorCue = 0

  async function verificacionPendiente() {
    contadorCue += 1
    const cueAnexo = `1801611-${String(contadorCue).padStart(2, '0')}`
    const creada = await crearVerificacion({ cueAnexo, solicitadaPorUserId: 'usuario-director' })
    if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
    return creada
  }

  function postVerificacion(accion: string, id: string, body: unknown): Request {
    return conJson('POST', `/api/problematicas/verificaciones/${id}/${accion}`, body)
  }

  describe('validar-token', () => {
    it('valid token is 200 with the verification', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/validar-token/route')
      const { token, verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('validar-token', verificacion.id, { token }), ctx({ id: verificacion.id }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('invalid token is 403', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/validar-token/route')
      const { verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('validar-token', verificacion.id, { token: 'token-malo' }), ctx({ id: verificacion.id }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('empty body is 400', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/validar-token/route')
      const { verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('validar-token', verificacion.id, {}), ctx({ id: verificacion.id }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('malformed JSON is 400', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/validar-token/route')
      const res = await POST(postVerificacion('validar-token', 'id-inexistente', '{no-json'), ctx({ id: 'id-inexistente' }))
      expect(await capturar(res)).toMatchSnapshot()
    })
  })

  describe('responder', () => {
    it('sin_afectacion is accepted', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/responder/route')
      const { token, verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('responder', verificacion.id, { token, resultado: 'sin_afectacion' }), ctx({ id: verificacion.id }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('a different answer after a recorded one is contradictory', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/responder/route')
      const { token, verificacion } = await verificacionPendiente()
      await responderPorEnlace({ verificacionId: verificacion.id, token, resultado: 'sin_afectacion' })
      const res = await POST(postVerificacion('responder', verificacion.id, { token, resultado: 'no_disponible' }), ctx({ id: verificacion.id }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('con_afectacion is rejected: it goes through vincular-movimiento', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/responder/route')
      const { token, verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('responder', verificacion.id, { token, resultado: 'con_afectacion' }), ctx({ id: verificacion.id }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('invalid token is 403', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/responder/route')
      const { verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('responder', verificacion.id, { token: 'token-malo', resultado: 'sin_afectacion' }), ctx({ id: verificacion.id }))
      expect(await capturar(res)).toMatchSnapshot()
    })
  })

  describe('canjear-sesion', () => {
    it('valid token is 200 with the scoped session cookie', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/canjear-sesion/route')
      const { token, verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('canjear-sesion', verificacion.id, { token }), ctx({ id: verificacion.id }))
      expect(res.headers.get('set-cookie')).toBeTruthy()
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('invalid token is 403 and sets no cookie', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/canjear-sesion/route')
      const { verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('canjear-sesion', verificacion.id, { token: 'token-malo' }), ctx({ id: verificacion.id }))
      expect(res.headers.get('set-cookie')).toBeNull()
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('empty body is 400', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/canjear-sesion/route')
      const { verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('canjear-sesion', verificacion.id, {}), ctx({ id: verificacion.id }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('already answered verification is 409 and sets no cookie', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/canjear-sesion/route')
      const { token, verificacion } = await verificacionPendiente()
      await responderPorEnlace({ verificacionId: verificacion.id, token, resultado: 'sin_afectacion' })
      const res = await POST(postVerificacion('canjear-sesion', verificacion.id, { token }), ctx({ id: verificacion.id }))
      expect(res.headers.get('set-cookie')).toBeNull()
      expect(await capturar(res)).toMatchSnapshot()
    })
  })

  describe('vincular-movimiento', () => {
    it('invalid token is 403 and writes nothing', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/vincular-movimiento/route')
      const { verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('vincular-movimiento', verificacion.id, { token: 'token-malo', movimientoId: 'mov-1' }), ctx({ id: verificacion.id }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('missing movimientoId is 400', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/vincular-movimiento/route')
      const { token, verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('vincular-movimiento', verificacion.id, { token }), ctx({ id: verificacion.id }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('unknown movimiento with a valid token is refused without writing', async () => {
      const { POST } = await import('./problematicas/verificaciones/[id]/vincular-movimiento/route')
      const { token, verificacion } = await verificacionPendiente()
      const res = await POST(postVerificacion('vincular-movimiento', verificacion.id, { token, movimientoId: 'mov-inexistente' }), ctx({ id: verificacion.id }))
      expect(await capturar(res)).toMatchSnapshot()
    })
  })
})

describe('recursos', () => {
  async function cuerpoRecurso(id: string, overrides: Record<string, unknown> = {}) {
    const { loadHubCatalog } = await import('@/lib/db/hub')
    const catalogo = await loadHubCatalog({ publishedOnly: false })
    return {
      id,
      titulo: 'Recurso de caracterización',
      descripcion: 'Descripción de prueba',
      formato: 'reporte',
      nivelId: catalogo.niveles[0]!.id,
      tipoId: catalogo.tipos[0]!.id,
      categoriaId: catalogo.categorias[0]!.id,
      area: 'Área de prueba',
      actualizado: '2026-10-25',
      estado: 'borrador',
      ...overrides,
    }
  }

  async function crearRecurso(id: string, overrides: Record<string, unknown> = {}) {
    const { POST } = await import('./recursos/route')
    comoUsuario(ADMIN)
    const res = await POST(conJson('POST', '/api/recursos', await cuerpoRecurso(id, overrides)))
    expect(res.status).toBe(201)
  }

  describe('POST /api/recursos', () => {
    it('without session is 401', async () => {
      const { POST } = await import('./recursos/route')
      expect(await capturar(await POST(conJson('POST', '/api/recursos', await cuerpoRecurso('caracterizacion-sin-sesion'))))).toMatchSnapshot()
    })

    it('as consulta is 403', async () => {
      comoUsuario(CONSULTA)
      const { POST } = await import('./recursos/route')
      expect(await capturar(await POST(conJson('POST', '/api/recursos', await cuerpoRecurso('caracterizacion-consulta'))))).toMatchSnapshot()
    })

    it('malformed JSON is 400', async () => {
      comoUsuario(ADMIN)
      const { POST } = await import('./recursos/route')
      expect(await capturar(await POST(conJson('POST', '/api/recursos', '{no-json')))).toMatchSnapshot()
    })

    it('body without titulo is 400', async () => {
      comoUsuario(ADMIN)
      const { POST } = await import('./recursos/route')
      const cuerpo = await cuerpoRecurso('caracterizacion-sin-titulo')
      delete (cuerpo as Record<string, unknown>).titulo
      expect(await capturar(await POST(conJson('POST', '/api/recursos', cuerpo)))).toMatchSnapshot()
    })

    it('published without file or route is 400', async () => {
      comoUsuario(ADMIN)
      const { POST } = await import('./recursos/route')
      const cuerpo = await cuerpoRecurso('caracterizacion-publicado', { estado: 'publicado' })
      expect(await capturar(await POST(conJson('POST', '/api/recursos', cuerpo)))).toMatchSnapshot()
    })

    it('draft with a valid body is 201', async () => {
      comoUsuario(ADMIN)
      const { POST } = await import('./recursos/route')
      const cuerpo = await cuerpoRecurso('caracterizacion-borrador')
      expect(await capturar(await POST(conJson('POST', '/api/recursos', cuerpo)))).toMatchSnapshot()
    })
  })

  describe('/api/recursos/[id]', () => {
    it('PUT without session is 401', async () => {
      const { PUT } = await import('./recursos/[id]/route')
      const res = await PUT(conJson('PUT', '/api/recursos/caracterizacion-borrador', {}), ctx({ id: 'caracterizacion-borrador' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('PUT with malformed JSON is 400', async () => {
      comoUsuario(ADMIN)
      const { PUT } = await import('./recursos/[id]/route')
      const res = await PUT(conJson('PUT', '/api/recursos/caracterizacion-borrador', '{no-json'), ctx({ id: 'caracterizacion-borrador' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('PUT of an unknown id is 404', async () => {
      comoUsuario(ADMIN)
      const { PUT } = await import('./recursos/[id]/route')
      const cuerpo = await cuerpoRecurso('no-existe')
      const res = await PUT(conJson('PUT', '/api/recursos/no-existe', cuerpo), ctx({ id: 'no-existe' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('PUT of an existing draft updates it', async () => {
      await crearRecurso('caracterizacion-editable')
      comoUsuario(ADMIN)
      const { PUT } = await import('./recursos/[id]/route')
      const cuerpo = await cuerpoRecurso('caracterizacion-editable', { titulo: 'Título editado' })
      const res = await PUT(conJson('PUT', '/api/recursos/caracterizacion-editable', cuerpo), ctx({ id: 'caracterizacion-editable' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('DELETE without session is 401', async () => {
      const { DELETE } = await import('./recursos/[id]/route')
      const res = await DELETE(req('/api/recursos/caracterizacion-editable', { method: 'DELETE' }), ctx({ id: 'caracterizacion-editable' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('DELETE of an unknown id is 404', async () => {
      comoUsuario(ADMIN)
      const { DELETE } = await import('./recursos/[id]/route')
      const res = await DELETE(req('/api/recursos/no-existe', { method: 'DELETE' }), ctx({ id: 'no-existe' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('DELETE of an existing resource removes it', async () => {
      await crearRecurso('caracterizacion-borrable')
      comoUsuario(ADMIN)
      const { DELETE } = await import('./recursos/[id]/route')
      const res = await DELETE(req('/api/recursos/caracterizacion-borrable', { method: 'DELETE' }), ctx({ id: 'caracterizacion-borrable' }))
      expect(await capturar(res)).toMatchSnapshot()
    })
  })

  describe('/api/recursos/[id]/archivo', () => {
    const archivoPdf = () => new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], 'anexo.pdf', { type: 'application/pdf' })

    it('GET without session is 401 even when the file exists', async () => {
      await crearRecurso('caracterizacion-con-archivo')
      const { POST } = await import('./recursos/[id]/archivo/route')
      comoUsuario(ADMIN)
      const fd = new FormData()
      fd.set('file', archivoPdf())
      await POST(req('/api/recursos/caracterizacion-con-archivo/archivo', { method: 'POST', body: fd }), ctx({ id: 'caracterizacion-con-archivo' }))
      comoUsuario(null)
      const { GET } = await import('./recursos/[id]/archivo/route')
      const res = await GET(req('/api/recursos/caracterizacion-con-archivo/archivo'), ctx({ id: 'caracterizacion-con-archivo' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('GET as admin streams the uploaded PDF', async () => {
      const { GET } = await import('./recursos/[id]/archivo/route')
      comoUsuario(ADMIN)
      const res = await GET(req('/api/recursos/caracterizacion-con-archivo/archivo'), ctx({ id: 'caracterizacion-con-archivo' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('GET as admin with download=1 keeps the same body as an attachment', async () => {
      const { GET } = await import('./recursos/[id]/archivo/route')
      comoUsuario(ADMIN)
      const res = await GET(req('/api/recursos/caracterizacion-con-archivo/archivo?download=1'), ctx({ id: 'caracterizacion-con-archivo' }))
      expect(res.headers.get('content-disposition')).toContain('attachment')
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('GET of a resource without a file is 404', async () => {
      const { GET } = await import('./recursos/[id]/archivo/route')
      comoUsuario(ADMIN)
      const res = await GET(req('/api/recursos/caracterizacion-editable/archivo'), ctx({ id: 'caracterizacion-editable' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('POST without session is 401', async () => {
      const { POST } = await import('./recursos/[id]/archivo/route')
      const fd = new FormData()
      fd.set('file', archivoPdf())
      const res = await POST(req('/api/recursos/caracterizacion-editable/archivo', { method: 'POST', body: fd }), ctx({ id: 'caracterizacion-editable' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('POST to an unknown resource is 404', async () => {
      comoUsuario(ADMIN)
      const { POST } = await import('./recursos/[id]/archivo/route')
      const fd = new FormData()
      fd.set('file', archivoPdf())
      const res = await POST(req('/api/recursos/no-existe/archivo', { method: 'POST', body: fd }), ctx({ id: 'no-existe' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('POST without a file field is 400', async () => {
      comoUsuario(ADMIN)
      const { POST } = await import('./recursos/[id]/archivo/route')
      const res = await POST(req('/api/recursos/caracterizacion-editable/archivo', { method: 'POST', body: new FormData() }), ctx({ id: 'caracterizacion-editable' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('POST of an SVG is rejected with 400', async () => {
      comoUsuario(ADMIN)
      const { POST } = await import('./recursos/[id]/archivo/route')
      const fd = new FormData()
      fd.set('file', new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'mapa.svg', { type: 'image/svg+xml' }))
      const res = await POST(req('/api/recursos/caracterizacion-editable/archivo', { method: 'POST', body: fd }), ctx({ id: 'caracterizacion-editable' }))
      expect(await capturar(res)).toMatchSnapshot()
    })
  })

  describe('/api/recursos/[id]/explain', () => {
    it('unknown resource is 404', async () => {
      const { POST } = await import('./recursos/[id]/explain/route')
      const res = await POST(req('/api/recursos/no-existe/explain', { method: 'POST' }), ctx({ id: 'no-existe' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('draft resource is 404 even for staff', async () => {
      comoUsuario(ADMIN)
      const { POST } = await import('./recursos/[id]/explain/route')
      const res = await POST(req('/api/recursos/caracterizacion-editable/explain', { method: 'POST' }), ctx({ id: 'caracterizacion-editable' }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('published resource without a session is 401 before any AI lookup', async () => {
      const { loadHubCatalog } = await import('@/lib/db/hub')
      const { id } = (await loadHubCatalog({ publishedOnly: true })).recursos[0]!
      const { POST } = await import('./recursos/[id]/explain/route')
      const res = await POST(req(`/api/recursos/${id}/explain`, { method: 'POST' }), ctx({ id }))
      expect(await capturar(res)).toMatchSnapshot()
    })

    it('published resource without an AI provider configured is 503', async () => {
      comoUsuario(ADMIN)
      const { loadHubCatalog } = await import('@/lib/db/hub')
      const { id } = (await loadHubCatalog({ publishedOnly: true })).recursos[0]!
      const { POST } = await import('./recursos/[id]/explain/route')
      const res = await POST(req(`/api/recursos/${id}/explain`, { method: 'POST' }), ctx({ id }))
      expect(await capturar(res)).toMatchSnapshot()
    })
  })
})

describe('taxonomia/[kind]', () => {
  const nivel = (id: string) => ({ id, nombre: 'Nivel de caracterización', orden: 99 })

  it('POST without session is 401', async () => {
    const { POST } = await import('./taxonomia/[kind]/route')
    const res = await POST(conJson('POST', '/api/taxonomia/niveles', nivel('caracterizacion-nivel')), ctx({ kind: 'niveles' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('POST as editor is 403: taxonomy is admin only', async () => {
    comoUsuario(EDITOR)
    const { POST } = await import('./taxonomia/[kind]/route')
    const res = await POST(conJson('POST', '/api/taxonomia/niveles', nivel('caracterizacion-nivel')), ctx({ kind: 'niveles' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('POST with an unknown kind is 400', async () => {
    comoUsuario(ADMIN)
    const { POST } = await import('./taxonomia/[kind]/route')
    const res = await POST(conJson('POST', '/api/taxonomia/bogus', nivel('x')), ctx({ kind: 'bogus' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('POST malformed JSON is 400', async () => {
    comoUsuario(ADMIN)
    const { POST } = await import('./taxonomia/[kind]/route')
    const res = await POST(conJson('POST', '/api/taxonomia/niveles', '{no-json'), ctx({ kind: 'niveles' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('POST tipos without aplicaA is 400', async () => {
    comoUsuario(ADMIN)
    const { POST } = await import('./taxonomia/[kind]/route')
    const res = await POST(conJson('POST', '/api/taxonomia/tipos', { id: 'caracterizacion-tipo', nombre: 'Tipo' }), ctx({ kind: 'tipos' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('POST niveles as admin upserts the level', async () => {
    comoUsuario(ADMIN)
    const { POST } = await import('./taxonomia/[kind]/route')
    const res = await POST(conJson('POST', '/api/taxonomia/niveles', nivel('caracterizacion-nivel')), ctx({ kind: 'niveles' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('POST categorias as admin upserts the category', async () => {
    comoUsuario(ADMIN)
    const { POST } = await import('./taxonomia/[kind]/route')
    const res = await POST(conJson('POST', '/api/taxonomia/categorias', { id: 'caracterizacion-categoria', nombre: 'Categoría', color: '#000000' }), ctx({ kind: 'categorias' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('DELETE without session is 401', async () => {
    const { DELETE } = await import('./taxonomia/[kind]/route')
    const res = await DELETE(req('/api/taxonomia/niveles?id=caracterizacion-nivel', { method: 'DELETE' }), ctx({ kind: 'niveles' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('DELETE without an id is 400', async () => {
    comoUsuario(ADMIN)
    const { DELETE } = await import('./taxonomia/[kind]/route')
    const res = await DELETE(req('/api/taxonomia/niveles', { method: 'DELETE' }), ctx({ kind: 'niveles' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('DELETE of a level still used by a resource is refused', async () => {
    comoUsuario(ADMIN)
    await (await import('./taxonomia/[kind]/route')).POST(conJson('POST', '/api/taxonomia/niveles', nivel('caracterizacion-nivel-uso')), ctx({ kind: 'niveles' }))
    const { POST: POST_RECURSO } = await import('./recursos/route')
    const { loadHubCatalog } = await import('@/lib/db/hub')
    const catalogo = await loadHubCatalog({ publishedOnly: false })
    await POST_RECURSO(conJson('POST', '/api/recursos', {
      id: 'caracterizacion-usa-nivel',
      titulo: 'Usa nivel',
      descripcion: 'Descripción',
      formato: 'reporte',
      nivelId: 'caracterizacion-nivel-uso',
      tipoId: catalogo.tipos[0]!.id,
      categoriaId: catalogo.categorias[0]!.id,
      area: 'Área',
      actualizado: '2026-10-25',
      estado: 'borrador',
    }))
    const { DELETE } = await import('./taxonomia/[kind]/route')
    const res = await DELETE(req('/api/taxonomia/niveles?id=caracterizacion-nivel-uso', { method: 'DELETE' }), ctx({ kind: 'niveles' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('DELETE of an unused level removes it, id taken from the body', async () => {
    comoUsuario(ADMIN)
    const { DELETE } = await import('./taxonomia/[kind]/route')
    const res = await DELETE(conJson('DELETE', '/api/taxonomia/niveles', { id: 'caracterizacion-nivel' }), ctx({ kind: 'niveles' }))
    expect(await capturar(res)).toMatchSnapshot()
  })
})

describe('usuarios', () => {
  let espiaCrear: ReturnType<typeof vi.spyOn> | undefined
  let espiaActualizar: ReturnType<typeof vi.spyOn> | undefined

  afterEach(() => {
    espiaCrear?.mockRestore()
    espiaActualizar?.mockRestore()
    espiaCrear = undefined
    espiaActualizar = undefined
  })

  it('GET without session is 401', async () => {
    const { GET } = await import('./usuarios/route')
    expect(await capturar(await GET(new Request('http://localhost/api')))).toMatchSnapshot()
  })

  it('GET as editor is 403: user administration is admin only', async () => {
    comoUsuario(EDITOR)
    const { GET } = await import('./usuarios/route')
    expect(await capturar(await GET(new Request('http://localhost/api')))).toMatchSnapshot()
  })

  it('GET as admin lists users without sensitive fields', async () => {
    comoUsuario(ADMIN)
    const { GET } = await import('./usuarios/route')
    expect(await capturar(await GET(new Request('http://localhost/api')))).toMatchSnapshot()
  })

  it('POST without session is 401', async () => {
    const { POST } = await import('./usuarios/route')
    const res = await POST(conJson('POST', '/api/usuarios', { email: 'a@b.example', name: 'A', password: 'clave-larga-123', role: 'consulta' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('POST as admin with a malformed body is 400', async () => {
    comoUsuario(ADMIN)
    const { POST } = await import('./usuarios/route')
    const res = await POST(conJson('POST', '/api/usuarios', { email: 'sin-tld@dominio', name: '', role: 'nope' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('POST as admin with an unknown nivel jurisdiccional is 400', async () => {
    comoUsuario(ADMIN)
    const { POST } = await import('./usuarios/route')
    const res = await POST(conJson('POST', '/api/usuarios', {
      email: 'nivel@caracterizacion.example', name: 'Nivel', password: 'clave-larga-123', role: 'consulta', nivelJurIds: [999999],
    }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('POST as admin creates the user through auth (auth.api.createUser stubbed)', async () => {
    comoUsuario(ADMIN)
    // better-auth inserts the created row (banned until activation); the stub must do the same.
    const { getDb } = await import('@/lib/db')
    const { user } = await import('@/lib/db/schema')
    await getDb().insert(user).values({
      id: 'usuario-creado-caracterizacion',
      name: 'Nuevo',
      email: 'nuevo@caracterizacion.example',
      role: 'consulta',
      banned: true,
    })
    const { auth } = await import('@/lib/auth')
    espiaCrear = vi.spyOn(auth.api, 'createUser').mockResolvedValue({ user: { id: 'usuario-creado-caracterizacion' } } as never)
    const { POST } = await import('./usuarios/route')
    const res = await POST(conJson('POST', '/api/usuarios', {
      email: 'nuevo@caracterizacion.example', name: 'Nuevo', password: 'clave-larga-123', role: 'consulta',
    }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('PATCH without session is 401', async () => {
    const { PATCH } = await import('./usuarios/[id]/route')
    const res = await PATCH(conJson('PATCH', '/api/usuarios/x', { name: 'x' }), ctx({ id: 'x' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('PATCH of an unknown user is 404', async () => {
    comoUsuario(ADMIN)
    const { PATCH } = await import('./usuarios/[id]/route')
    const res = await PATCH(conJson('PATCH', '/api/usuarios/no-existe', { name: 'Nombre' }), ctx({ id: 'no-existe' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('PATCH with a malformed body is 400', async () => {
    comoUsuario(ADMIN)
    const { PATCH } = await import('./usuarios/[id]/route')
    const res = await PATCH(conJson('PATCH', '/api/usuarios/no-existe', '{no-json'), ctx({ id: 'no-existe' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('PATCH of an existing user renames it through auth (auth.api.adminUpdateUser stubbed)', async () => {
    comoUsuario(ADMIN)
    // The test database starts without seeded users (no ADMIN_EMAIL), so the row is inserted here.
    const { getDb } = await import('@/lib/db')
    const { user } = await import('@/lib/db/schema')
    await getDb().insert(user).values({
      id: 'usuario-existente-caracterizacion',
      name: 'Usuario existente',
      email: 'existente@caracterizacion.example',
      role: 'consulta',
    })
    const { auth } = await import('@/lib/auth')
    espiaActualizar = vi.spyOn(auth.api, 'adminUpdateUser').mockResolvedValue({} as never)
    const { PATCH } = await import('./usuarios/[id]/route')
    const id = 'usuario-existente-caracterizacion'
    const res = await PATCH(conJson('PATCH', `/api/usuarios/${id}`, { name: 'Nombre editado' }), ctx({ id }))
    expect(await capturar(res)).toMatchSnapshot()
  })
})

describe('veredicto/compartido/[token]/pdf', () => {
  it('unknown token is 404', async () => {
    const { GET } = await import('./veredicto/compartido/[token]/pdf/route')
    const res = await GET(req('/api/veredicto/compartido/token-inexistente/pdf'), ctx({ token: 'token-inexistente' }))
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('valid token returns the PDF as an attachment', async () => {
    const { getDb } = await import('@/lib/db')
    const { crearEnlace } = await import('@/lib/infraestructura/veredicto/enlaces')
    const { token } = await crearEnlace(getDb(), { desde: '2026-10-01', hasta: '2026-10-02', creadoPor: 'usuario-admin' })
    const { GET } = await import('./veredicto/compartido/[token]/pdf/route')
    const res = await GET(req(`/api/veredicto/compartido/${token}/pdf`), ctx({ token }))
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(await capturar(res)).toMatchSnapshot()
  })

  it('revoked token is 410', async () => {
    const { getDb } = await import('@/lib/db')
    const { crearEnlace, revocarEnlacesDelDia } = await import('@/lib/infraestructura/veredicto/enlaces')
    const { token } = await crearEnlace(getDb(), { desde: '2026-10-03', hasta: '2026-10-04', creadoPor: 'usuario-admin' })
    await revocarEnlacesDelDia(getDb(), { revocadoPor: 'usuario-admin' })
    const { GET } = await import('./veredicto/compartido/[token]/pdf/route')
    const res = await GET(req(`/api/veredicto/compartido/${token}/pdf`), ctx({ token }))
    expect(await capturar(res)).toMatchSnapshot()
  })
})
