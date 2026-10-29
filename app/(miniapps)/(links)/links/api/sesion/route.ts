import { z } from 'zod'
import { crearLimitador } from '@/lib/http/limitador'
import { ruta } from '@/lib/http/ruta'
import { COOKIE, COOKIE_PATH, DURACION_S, credencialesValidas, crearToken, leerCredenciales, origenPropio } from '@/miniapps/links/lib/sesion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// A brute-force guard on the only credential: 10 attempts per IP every 15 minutes.
const limitador = crearLimitador({ ventanaMs: 15 * 60_000, max: 10 })

const loginSchema = z.object({ usuario: z.string().max(200), clave: z.string().max(500) })

function cookie(valor: string, maxAge: number, request: Request) {
  const https = (request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol).startsWith('https')
  return `${COOKIE}=${valor}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${https ? '; Secure' : ''}`
}

async function handlePOST(request: Request) {
  if (!origenPropio(request)) return Response.json({ error: 'Origen no permitido' }, { status: 403, headers: NO_STORE })
  const cred = leerCredenciales()
  if (!cred) return Response.json({ error: 'El acceso de administración no está configurado.' }, { status: 503, headers: NO_STORE })

  const body = loginSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return Response.json({ error: 'Datos inválidos' }, { status: 400, headers: NO_STORE })
  if (!credencialesValidas(cred, body.data.usuario, body.data.clave)) {
    return Response.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401, headers: NO_STORE })
  }
  return Response.json({ ok: true }, { headers: { ...NO_STORE, 'Set-Cookie': cookie(crearToken(cred.secreto), DURACION_S, request) } })
}

async function handleDELETE(request: Request) {
  if (!origenPropio(request)) return Response.json({ error: 'Origen no permitido' }, { status: 403, headers: NO_STORE })
  return Response.json({ ok: true }, { headers: { ...NO_STORE, 'Set-Cookie': cookie('', 0, request) } })
}

export const POST = ruta('links.sesion.login', handlePOST, { limite: { limitador } })
export const DELETE = ruta('links.sesion.logout', handleDELETE)
