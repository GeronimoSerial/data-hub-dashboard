import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import {
  geSsoEvento,
  nivelesJurisdiccionales,
  user,
  userNivelesJur,
  verification,
} from '@/lib/db/schema'
import { manejarGeCallback, manejarGeLogin, responderPreflightGe } from './handlers'
import { emitirTicket, consumirTicket, hashTicket } from './ticket'
import { geRateLimit } from './seguridad'
import { esStagingForwardActivo } from './staging-forward'
import * as provision from './provision'

usarDbTemporal('ge-sso')

const ORIGEN = 'https://ge.mec.gob.ar'
const API_KEY = 'clave-de-prueba-ge'
const BASE = 'https://hub.test'

const ENV_PREVIA = {
  GE_SSO_API_KEY: process.env.GE_SSO_API_KEY,
  GE_SSO_ALLOWED_ORIGIN: process.env.GE_SSO_ALLOWED_ORIGIN,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  GE_SSO_STAGING_FORWARD_URL: process.env.GE_SSO_STAGING_FORWARD_URL,
  GE_SSO_STAGING_FORWARD_UNTIL: process.env.GE_SSO_STAGING_FORWARD_UNTIL,
  GE_SSO_STAGING_FORWARD_ENABLED: process.env.GE_SSO_STAGING_FORWARD_ENABLED,
  GE_SSO_STAGING_FORWARD_API_KEY: process.env.GE_SSO_STAGING_FORWARD_API_KEY,
}

beforeEach(() => {
  process.env.GE_SSO_API_KEY = API_KEY
  delete process.env.GE_SSO_ALLOWED_ORIGIN
  delete process.env.GE_SSO_STAGING_FORWARD_URL
  delete process.env.GE_SSO_STAGING_FORWARD_UNTIL
  delete process.env.GE_SSO_STAGING_FORWARD_ENABLED
  delete process.env.GE_SSO_STAGING_FORWARD_API_KEY
  process.env.BETTER_AUTH_URL = BASE
  geRateLimit.reset()
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const [clave, valor] of Object.entries(ENV_PREVIA)) {
    if (valor === undefined) delete process.env[clave]
    else process.env[clave] = valor
  }
})

let ipSeq = 0
function ipNueva(): string {
  ipSeq += 1
  return `10.9.0.${ipSeq}`
}

function pedidoLogin(
  body: Record<string, unknown>,
  opts: { origin?: string | null; ip?: string } = {},
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': opts.ip ?? ipNueva(),
  }
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGEN
  return new Request(`${BASE}/api/auth/ge-login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ api_key: API_KEY, ...body }),
  })
}

function pedidoLegacy(body: Record<string, unknown>, opts: { origin?: string | null } = {}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': ipNueva(),
  }
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGEN
  return new Request(`${BASE}/api/auth/ge-login`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const OPERADOR = {
  email: 'Operador.Escuela@Ejemplo.gob.ar',
  nombre: 'Ana',
  apellido: 'Pérez',
  rol: 'operador_establecimiento',
  cue: '9000001',
}

async function nivelValido(): Promise<number> {
  const [fila] = await getDb().select({ id: nivelesJurisdiccionales.id }).from(nivelesJurisdiccionales).limit(1)
  if (!fila) throw new Error('El catálogo de niveles debe estar sembrado')
  return fila.id
}

async function usuarioPorEmail(email: string) {
  const [fila] = await getDb().select().from(user).where(eq(user.email, email))
  return fila
}

async function loginOk(body: Record<string, unknown>): Promise<string> {
  const res = await manejarGeLogin(pedidoLogin(body))
  expect(res.status).toBe(201)
  const { redirectUrl } = (await res.json()) as { redirectUrl: string }
  return new URL(redirectUrl).searchParams.get('token') ?? ''
}

describe('CORS y origen', () => {
  it('rechaza un origen distinto de GE con 403 y sin cabeceras CORS', async () => {
    const res = await manejarGeLogin(pedidoLogin(OPERADOR, { origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rechaza las peticiones sin cabecera Origin', async () => {
    const res = await manejarGeLogin(pedidoLogin(OPERADOR, { origin: null }))
    expect(res.status).toBe(403)
  })

  it('responde el preflight sólo al origen permitido', () => {
    const ok = responderPreflightGe(
      new Request(`${BASE}/api/auth/ge-login`, { method: 'OPTIONS', headers: { origin: ORIGEN } }),
    )
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGEN)
    expect(ok.headers.get('access-control-allow-methods')).toBe('POST')
    expect(ok.headers.get('access-control-allow-headers')).toBe('content-type')

    const malo = responderPreflightGe(
      new Request(`${BASE}/api/auth/ge-login`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
    )
    expect(malo.status).toBe(403)
  })

  it('usa GE_SSO_ALLOWED_ORIGIN cuando está definida', async () => {
    process.env.GE_SSO_ALLOWED_ORIGIN = 'https://ge-staging.example'
    const res = await manejarGeLogin(
      pedidoLogin(OPERADOR, { origin: 'https://ge-staging.example' }),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://ge-staging.example')
  })
})

describe('api_key', () => {
  it('responde 503 si GE_SSO_API_KEY no está configurada (fail closed)', async () => {
    delete process.env.GE_SSO_API_KEY
    const res = await manejarGeLogin(pedidoLogin(OPERADOR))
    expect(res.status).toBe(503)
  })

  it('responde 401 con una clave incorrecta o ausente', async () => {
    const mala = await manejarGeLogin(pedidoLogin({ ...OPERADOR, api_key: 'otra' }))
    expect(mala.status).toBe(401)
    const ausente = await manejarGeLogin(
      new Request(`${BASE}/api/auth/ge-login`, {
        method: 'POST',
        headers: { origin: ORIGEN, 'content-type': 'application/json', 'x-forwarded-for': ipNueva() },
        body: JSON.stringify(OPERADOR),
      }),
    )
    expect(ausente.status).toBe(401)
  })

  it('no registra la api_key en la auditoría', async () => {
    await manejarGeLogin(pedidoLogin({ ...OPERADOR, email: 'nokey@ejemplo.gob.ar', api_key: 'x' }))
    const filas = await getDb().select().from(geSsoEvento)
    expect(JSON.stringify(filas)).not.toContain(API_KEY)
  })
})

describe('validación del body', () => {
  it('responde 400 si falta un campo obligatorio', async () => {
    const { nombre: _omit, ...sinNombre } = OPERADOR
    const res = await manejarGeLogin(pedidoLogin(sinNombre))
    expect(res.status).toBe(400)
  })

  it('responde 400 si el email no es válido', async () => {
    const res = await manejarGeLogin(pedidoLogin({ ...OPERADOR, email: 'no-es-email' }))
    expect(res.status).toBe(400)
  })

  it('responde 400 si el operador no trae cue', async () => {
    const { cue: _omit, ...sinCue } = OPERADOR
    const res = await manejarGeLogin(pedidoLogin(sinCue))
    expect(res.status).toBe(400)
  })

  it('responde 400 si el rol no pertenece al contrato', async () => {
    const res = await manejarGeLogin(pedidoLogin({ ...OPERADOR, rol: 'editor' }))
    expect(res.status).toBe(400)
  })

  it('responde 400 si el body no es JSON', async () => {
    const res = await manejarGeLogin(
      new Request(`${BASE}/api/auth/ge-login`, {
        method: 'POST',
        headers: { origin: ORIGEN, 'x-forwarded-for': ipNueva() },
        body: 'no json',
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('director_nivel', () => {
  it('responde 400 si no trae nivelJurisdiccionalId', async () => {
    const res = await manejarGeLogin(
      pedidoLogin({ email: 'dir1@ejemplo.gob.ar', nombre: 'D', apellido: 'Uno', rol: 'director_nivel' }),
    )
    expect(res.status).toBe(400)
  })

  it('responde 400 si el nivel no existe en el catálogo', async () => {
    const res = await manejarGeLogin(
      pedidoLogin({
        email: 'dir2@ejemplo.gob.ar',
        nombre: 'D',
        apellido: 'Dos',
        rol: 'director_nivel',
        nivelJurisdiccionalId: 987654,
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('rate limit', () => {
  it('responde 429 al exceder 30 pedidos por minuto desde la misma IP', async () => {
    const ip = '10.8.8.8'
    let ultimo = 0
    for (let i = 0; i < 31; i++) {
      const res = await manejarGeLogin(pedidoLogin({ ...OPERADOR, api_key: 'mala' }, { ip }))
      ultimo = res.status
    }
    expect(ultimo).toBe(429)
  })
})

describe('provisión y tickets contra la base', () => {
  it('crea el usuario en el primer login y actualiza el rol en el segundo', async () => {
    const email = 'ana.perez@ejemplo.gob.ar'
    await loginOk({ ...OPERADOR, email })
    const creado = await usuarioPorEmail(email)
    expect(creado.role).toBe('operador_establecimiento')
    expect(creado.name).toBe('Ana Pérez')
    expect(creado.emailVerified).toBe(true)
    expect(creado.geCueAnexo).toBe('9000001')

    const nivel = await nivelValido()
    await loginOk({
      email,
      nombre: 'Ana',
      apellido: 'Pérez',
      rol: 'director_nivel',
      nivelJurisdiccionalId: nivel,
    })
    const actualizado = await usuarioPorEmail(email)
    expect(actualizado.id).toBe(creado.id)
    expect(actualizado.role).toBe('director_nivel')
    expect(actualizado.geCueAnexo).toBeNull()
    const niveles = await getDb()
      .select()
      .from(userNivelesJur)
      .where(eq(userNivelesJur.userId, creado.id))
    expect(niveles.map((n) => n.nivelJurisdiccionalId)).toEqual([nivel])

    await loginOk({ email, nombre: 'Ana', apellido: 'Pérez', rol: 'administrador' })
    const admin = await usuarioPorEmail(email)
    expect(admin.role).toBe('admin_ge')
    expect(admin.geCueAnexo).toBeNull()
    const sinNiveles = await getDb()
      .select()
      .from(userNivelesJur)
      .where(eq(userNivelesJur.userId, creado.id))
    expect(sinNiveles).toEqual([])
  })

  it('responde 403 a un usuario bloqueado', async () => {
    const email = 'bloqueado@ejemplo.gob.ar'
    await loginOk({ ...OPERADOR, email })
    await getDb().update(user).set({ banned: true }).where(eq(user.email, email))
    const res = await manejarGeLogin(pedidoLogin({ ...OPERADOR, email }))
    expect(res.status).toBe(403)
  })

  it('registra el login aceptado y los rechazos en ge_sso_evento', async () => {
    const email = 'auditoria@ejemplo.gob.ar'
    await loginOk({ ...OPERADOR, email })
    await manejarGeLogin(pedidoLogin({ ...OPERADOR, email, api_key: 'mala' }))
    const filas = await getDb()
      .select()
      .from(geSsoEvento)
      .where(eq(geSsoEvento.email, email))
    expect(filas.map((f) => f.resultado)).toContain('ok')
    expect(filas.length).toBeGreaterThanOrEqual(1)
  })

  it('el ticket se guarda sólo como hash y es de un solo uso', async () => {
    const [usuario] = await getDb().select({ id: user.id }).from(user).limit(1)
    const token = await emitirTicket(usuario!.id)
    const filas = await getDb()
      .select({ identifier: verification.identifier })
      .from(verification)
    expect(filas.map((f) => f.identifier)).toContain(`ge-sso:${hashTicket(token)}`)
    expect(filas.map((f) => f.identifier).join(' ')).not.toContain(token)

    expect(await consumirTicket(token)).toBe(usuario!.id)
    expect(await consumirTicket(token)).toBeNull()
  })

  it('un ticket vencido (más de 60 s) no se canjea', async () => {
    const [usuario] = await getDb().select({ id: user.id }).from(user).limit(1)
    const token = await emitirTicket(usuario!.id, Date.now() - 61_000)
    expect(await consumirTicket(token)).toBeNull()
  })
})

describe('callback /auth/ge-callback', () => {
  it('redirige según el rol de la app y deja una cookie de sesión', async () => {
    const casos = [
      { rol: 'administrador', destino: '/mapas/infraestructura', email: 'cb-admin@ejemplo.gob.ar' },
      { rol: 'director_nivel', destino: '/mapas/infraestructura', email: 'cb-dir@ejemplo.gob.ar', nivel: true },
      { rol: 'operador_establecimiento', destino: '/problematicas/parte/nuevo', email: 'cb-op@ejemplo.gob.ar' },
    ] as const

    for (const caso of casos) {
      const extra: Record<string, unknown> = {}
      if ('nivel' in caso) extra.nivelJurisdiccionalId = await nivelValido()
      if (caso.rol === 'operador_establecimiento') extra.cue = '9000002'
      const token = await loginOk({
        email: caso.email,
        nombre: 'Cb',
        apellido: 'Prueba',
        rol: caso.rol,
        ...extra,
      })
      const res = await manejarGeCallback(new Request(`${BASE}/auth/ge-callback?token=${token}`))
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe(caso.destino)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('referrer-policy')).toBe('no-referrer')
      expect(res.headers.get('set-cookie')).toContain('session_token')
    }
  })

  it('un ticket canjeado no sirve una segunda vez', async () => {
    const token = await loginOk({ ...OPERADOR, email: 'cb-reuso@ejemplo.gob.ar' })
    const primera = await manejarGeCallback(new Request(`${BASE}/auth/ge-callback?token=${token}`))
    expect(primera.headers.get('location')).toBe('/problematicas/parte/nuevo')
    const segunda = await manejarGeCallback(new Request(`${BASE}/auth/ge-callback?token=${token}`))
    expect(segunda.headers.get('location')).toBe('/login?error=ge_sso')
  })

  it('redirige a error con ticket vencido o ausente', async () => {
    const [usuario] = await getDb().select({ id: user.id }).from(user).limit(1)
    const vencido = await emitirTicket(usuario!.id, Date.now() - 120_000)
    const res = await manejarGeCallback(new Request(`${BASE}/auth/ge-callback?token=${vencido}`))
    expect(res.headers.get('location')).toBe('/login?error=ge_sso')
    const sin = await manejarGeCallback(new Request(`${BASE}/auth/ge-callback`))
    expect(sin.headers.get('location')).toBe('/login?error=ge_sso')
  })
})

describe('formato legacy (asistencias) en el mismo endpoint', () => {

  it('responde 200 con la URL de callback y el callback deja un operador con su CUE', async () => {
    const res = await manejarGeLogin(pedidoLegacy({ CUE: '1800554-00', USUARIO: 1001, secret: API_KEY }))
    expect(res.status).toBe(200)
    const { url } = (await res.json()) as { url: string }
    expect(url.startsWith(`${BASE}/auth/ge-callback?token=`)).toBe(true)

    const token = new URL(url).searchParams.get('token') ?? ''
    const callback = await manejarGeCallback(new Request(`${BASE}/auth/ge-callback?token=${token}`))
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('/problematicas/parte/nuevo')

    const usuario = await usuarioPorEmail('ge-1001@ge-sso.invalid')
    expect(usuario.role).toBe('operador_establecimiento')
    expect(usuario.name).toBe('Usuario GE 1001')
    expect(usuario.geCueAnexo).toBe('1800554-00')

    const filas = await getDb()
      .select()
      .from(geSsoEvento)
      .where(eq(geSsoEvento.email, 'ge-1001@ge-sso.invalid'))
    expect(filas.map((f) => f.resultado)).toContain('ok')
    expect(JSON.stringify(filas)).not.toContain(API_KEY)
  })

  it('acepta dos logins simultáneos de un usuario nuevo y crea un solo usuario', async () => {
    const body = { CUE: '1800554-00', USUARIO: 1003, secret: API_KEY }
    const respuestas = await Promise.all([
      manejarGeLogin(pedidoLegacy(body)),
      manejarGeLogin(pedidoLegacy(body)),
    ])
    expect(respuestas.map((r) => r.status)).toEqual([200, 200])
    const filas = await getDb().select().from(user).where(eq(user.email, 'ge-1003@ge-sso.invalid'))
    expect(filas).toHaveLength(1)
  })

  it('responde 401 con un secret incorrecto o ausente y no crea usuario', async () => {
    const mala = await manejarGeLogin(pedidoLegacy({ CUE: '1800554-00', USUARIO: 1002, secret: 'otra' }))
    expect(mala.status).toBe(401)
    const ausente = await manejarGeLogin(pedidoLegacy({ CUE: '1800554-00', USUARIO: 1002 }))
    expect(ausente.status).toBe(401)
    expect(await usuarioPorEmail('ge-1002@ge-sso.invalid')).toBeUndefined()
  })

  it('responde 400 si falta USUARIO o el CUE no tiene formato válido', async () => {
    const sinUsuario = await manejarGeLogin(pedidoLegacy({ CUE: '1800554-00', secret: API_KEY }))
    expect(sinUsuario.status).toBe(400)
    const cueMalo = await manejarGeLogin(pedidoLegacy({ CUE: 'abc', USUARIO: 1005, secret: API_KEY }))
    expect(cueMalo.status).toBe(400)
  })

  it('acepta USUARIO como cadena numérica', async () => {
    const res = await manejarGeLogin(pedidoLegacy({ CUE: '1800554-00', USUARIO: '1003', secret: API_KEY }))
    expect(res.status).toBe(200)
    const usuario = await usuarioPorEmail('ge-1003@ge-sso.invalid')
    expect(usuario.name).toBe('Usuario GE 1003')
  })

  it('un segundo login con el mismo USUARIO actualiza el CUE sin duplicar el usuario', async () => {
    await manejarGeLogin(pedidoLegacy({ CUE: '1800554-00', USUARIO: 1004, secret: API_KEY }))
    const primero = await usuarioPorEmail('ge-1004@ge-sso.invalid')

    const res = await manejarGeLogin(pedidoLegacy({ CUE: '1800554-01', USUARIO: 1004, secret: API_KEY }))
    expect(res.status).toBe(200)
    const segundo = await usuarioPorEmail('ge-1004@ge-sso.invalid')
    expect(segundo.id).toBe(primero.id)
    expect(segundo.geCueAnexo).toBe('1800554-01')
  })
})

describe('Reenvío a staging para operador_establecimiento', () => {
  it('evalúa correctamente la vigencia del reenvío según variables de entorno', () => {
    expect(esStagingForwardActivo({ url: null })).toBe(false)
    expect(esStagingForwardActivo({ url: 'https://staging.example', enabled: 'false' })).toBe(false)
    // Expirado
    expect(
      esStagingForwardActivo(
        { url: 'https://staging.example', until: '2026-10-18T00:00:00Z' },
        Date.parse('2026-10-19T00:00:00Z'),
      ),
    ).toBe(false)
    // Vigente (dentro de los 2 días)
    expect(
      esStagingForwardActivo(
        { url: 'https://staging.example', until: '2026-10-21T23:59:59Z' },
        Date.parse('2026-10-19T20:00:00Z'),
      ),
    ).toBe(true)
  })

  it('reenvía login moderno de operador_establecimiento a staging y audita reenviado_staging', async () => {
    process.env.GE_SSO_STAGING_FORWARD_URL = 'https://staging.example'
    const OPERADOR_STAGING = {
      email: 'operador.staging@ejemplo.gob.ar',
      nombre: 'Marta',
      apellido: 'Gómez',
      rol: 'operador_establecimiento',
      cue: '1800554-00',
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ redirectUrl: 'https://staging.example/auth/ge-callback?token=tk-stag' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const res = await manejarGeLogin(pedidoLogin(OPERADOR_STAGING))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toEqual({ redirectUrl: 'https://staging.example/auth/ge-callback?token=tk-stag' })
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGEN)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [llamadaUrl, llamadaInit] = fetchSpy.mock.calls[0]
    expect(llamadaUrl).toBe('https://staging.example/api/auth/ge-login')
    expect(llamadaInit?.method).toBe('POST')
    expect((llamadaInit?.headers as Record<string, string>)?.['x-ge-sso-forwarded']).toBe('true')
    expect((llamadaInit?.headers as Record<string, string>)?.Origin).toBe(ORIGEN)

    // No se crea usuario en la base de prod
    expect(await usuarioPorEmail(OPERADOR_STAGING.email)).toBeUndefined()

    // Se registró auditoría en prod
    const eventos = await getDb()
      .select()
      .from(geSsoEvento)
      .where(eq(geSsoEvento.email, OPERADOR_STAGING.email))
    expect(eventos.map((e) => e.resultado)).toContain('reenviado_staging')
  })

  it('reenvía login legacy (asistencias) a staging', async () => {
    process.env.GE_SSO_STAGING_FORWARD_URL = 'https://staging.example'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://staging.example/auth/ge-callback?token=tk-leg' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const res = await manejarGeLogin(pedidoLegacy({ CUE: '1800554-00', USUARIO: 8888, secret: API_KEY }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ url: 'https://staging.example/auth/ge-callback?token=tk-leg' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('https://staging.example/api/auth/ge-login')

    expect(await usuarioPorEmail('ge-8888@ge-sso.invalid')).toBeUndefined()

    const eventos = await getDb()
      .select()
      .from(geSsoEvento)
      .where(eq(geSsoEvento.email, 'ge-8888@ge-sso.invalid'))
    expect(eventos.map((e) => e.resultado)).toContain('reenviado_staging')
  })

  it('NO reenvía login de director_nivel ni administrador a staging', async () => {
    process.env.GE_SSO_STAGING_FORWARD_URL = 'https://staging.example'
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const nivelId = await nivelValido()
    const directorNivel = {
      email: 'director.nivel@ejemplo.gob.ar',
      nombre: 'Carlos',
      apellido: 'Nivel',
      rol: 'director_nivel',
      nivelJurisdiccionalId: nivelId,
    }
    const res = await manejarGeLogin(pedidoLogin(directorNivel))
    expect(res.status).toBe(201)
    const json = (await res.json()) as { redirectUrl: string }
    expect(json.redirectUrl).toContain(BASE)

    // El fetch a staging nunca debió llamarse
    expect(fetchSpy).not.toHaveBeenCalled()
    // Se creó en la DB local (prod)
    expect(await usuarioPorEmail(directorNivel.email)).toBeDefined()
  })

  it('responde 502 con CORS si la comunicación con staging falla', async () => {
    process.env.GE_SSO_STAGING_FORWARD_URL = 'https://staging.example'
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

    const OPERADOR_FALLO = {
      email: 'operador.fallo@ejemplo.gob.ar',
      nombre: 'Pedro',
      apellido: 'Fallo',
      rol: 'operador_establecimiento',
      cue: '1800554-00',
    }
    const res = await manejarGeLogin(pedidoLogin(OPERADOR_FALLO))
    expect(res.status).toBe(502)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGEN)
    const json = await res.json()
    expect(json).toHaveProperty('error')

    const eventos = await getDb()
      .select()
      .from(geSsoEvento)
      .where(eq(geSsoEvento.email, OPERADOR_FALLO.email))
    expect(eventos.map((e) => e.resultado)).toContain('fallo_red_reenvio_staging')
  })

  it('no reenvía si la petición ya tiene cabecera x-ge-sso-forwarded', async () => {
    process.env.GE_SSO_STAGING_FORWARD_URL = 'https://staging.example'
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const OPERADOR_LOCAL = {
      email: 'operador.local@ejemplo.gob.ar',
      nombre: 'Local',
      apellido: 'Local',
      rol: 'operador_establecimiento',
      cue: '1800554-00',
    }
    const req = pedidoLogin(OPERADOR_LOCAL)
    req.headers.set('x-ge-sso-forwarded', 'true')
    const res = await manejarGeLogin(req)
    expect(res.status).toBe(201)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await usuarioPorEmail(OPERADOR_LOCAL.email)).toBeDefined()
  })
})

describe('log estructurado ge-sso-login', () => {
  function capturarLog() {
    const lineas: string[] = []
    const guardar = (...args: unknown[]) => {
      const texto = args.map(String).join(' ')
      if (texto.startsWith('ge-sso-login ')) lineas.push(texto)
    }
    vi.spyOn(console, 'info').mockImplementation(guardar)
    vi.spyOn(console, 'warn').mockImplementation(guardar)
    vi.spyOn(console, 'error').mockImplementation(guardar)
    return {
      lineas,
      unica(): Record<string, unknown> {
        expect(lineas).toHaveLength(1)
        return JSON.parse(lineas[0].slice('ge-sso-login '.length))
      },
    }
  }

  function sinSecretos(linea: string, ...secretos: string[]) {
    for (const secreto of [API_KEY, 'api_key', 'secret', 'token', ...secretos]) {
      expect(linea).not.toContain(secreto)
    }
  }

  it('loguea un ingreso ok con CUE, usuario, request id y sin secretos', async () => {
    const log = capturarLog()
    const pedido = pedidoLegacy({ CUE: '9000001', USUARIO: 21324, secret: API_KEY })
    pedido.headers.set('x-request-id', 'req-abc-1')
    const res = await manejarGeLogin(pedido)
    expect(res.status).toBe(200)
    const { url } = (await res.json()) as { url: string }
    const ticket = new URL(url).searchParams.get('token')!

    const linea = log.unica()
    expect(linea).toMatchObject({
      evento: 'ge-sso-login',
      requestId: 'req-abc-1',
      cueRecibido: '9000001',
      usuarioGe: 'ge-21324',
      resultado: 'ok',
      status: 200,
      motivo: 'ok',
      reenviadoStaging: false,
    })
    expect(linea.cueNormalizado).toEqual(expect.any(String))
    expect(Number.isNaN(Date.parse(String(linea.timestamp)))).toBe(false)
    sinSecretos(log.lineas[0], ticket)
  })

  it('loguea 400 cue_invalido con el CUE tal cual llegó', async () => {
    const log = capturarLog()
    const res = await manejarGeLogin(pedidoLegacy({ CUE: 'no-es-cue', USUARIO: 77, secret: API_KEY }))
    expect(res.status).toBe(400)
    expect(log.unica()).toMatchObject({
      cueRecibido: 'no-es-cue',
      cueNormalizado: null,
      usuarioGe: 'ge-77',
      resultado: '400',
      motivo: 'cue_invalido',
    })
    expect(log.unica().requestId).toEqual(expect.any(String))
    sinSecretos(log.lineas[0])
  })

  it('loguea 403 usuario_bloqueado', async () => {
    const email = 'bloqueado-log@ejemplo.gob.ar'
    await loginOk({ ...OPERADOR, email })
    await getDb().update(user).set({ banned: true }).where(eq(user.email, email))
    const log = capturarLog()
    const res = await manejarGeLogin(pedidoLogin({ ...OPERADOR, email }))
    expect(res.status).toBe(403)
    expect(log.unica()).toMatchObject({
      usuarioGe: email,
      cueRecibido: '9000001',
      resultado: '403',
      motivo: 'usuario_bloqueado',
    })
    sinSecretos(log.lineas[0])
  })

  it('loguea 5xx error_interno y no cambia el error que sale del handler', async () => {
    vi.spyOn(provision, 'provisionarUsuarioGe').mockRejectedValue(new Error('db caída'))
    const log = capturarLog()
    await expect(manejarGeLogin(pedidoLogin({ ...OPERADOR, email: 'interno@ejemplo.gob.ar' }))).rejects.toThrow(
      'db caída',
    )
    expect(log.unica()).toMatchObject({ resultado: '5xx', status: 500, motivo: 'error_interno' })
    sinSecretos(log.lineas[0], 'db caída')
  })

  it('marca reenviadoStaging cuando el login va a staging', async () => {
    process.env.GE_SSO_STAGING_FORWARD_ENABLED = 'true'
    process.env.GE_SSO_STAGING_FORWARD_URL = 'https://staging.test'
    process.env.GE_SSO_STAGING_FORWARD_UNTIL = '2999-01-01T00:00:00Z'
    expect(esStagingForwardActivo()).toBe(true)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://staging.test/auth/ge-callback?token=t' }), { status: 200 }),
    )
    const log = capturarLog()
    const res = await manejarGeLogin(pedidoLegacy({ CUE: '9000001', USUARIO: 5, secret: API_KEY }))
    expect(res.status).toBe(200)
    expect(log.unica()).toMatchObject({ reenviadoStaging: true, resultado: 'ok' })
  })
})
