import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

usarDbTemporal('ge-sso')

const ORIGEN = 'https://ge.mec.gob.ar'
const API_KEY = 'clave-de-prueba-ge'
const BASE = 'https://hub.test'

const ENV_PREVIA = {
  GE_SSO_API_KEY: process.env.GE_SSO_API_KEY,
  GE_SSO_ALLOWED_ORIGIN: process.env.GE_SSO_ALLOWED_ORIGIN,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
}

beforeEach(() => {
  process.env.GE_SSO_API_KEY = API_KEY
  delete process.env.GE_SSO_ALLOWED_ORIGIN
  process.env.BETTER_AUTH_URL = BASE
  geRateLimit.reset()
})

afterEach(() => {
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
    expect(admin.role).toBe('admin')
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
