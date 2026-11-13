import { z } from 'zod'
import { crearLimitador } from '@/lib/http/limitador'
import { COOKIE, DURACION_S, credencialesValidas, crearSesion, leerCredenciales, revocarSesion } from '@/miniapps/links/lib/sesion'
import { contextoPedido, leerJsonLimitado, NO_STORE, origenPropio, rutaLinks } from '@/miniapps/links/lib/pedido'
import { actorAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limitador = crearLimitador({ ventanaMs: 15 * 60_000, max: 10 })
const loginSchema = z.object({ usuario: z.string().max(200), clave: z.string().max(500) })

function cookie(valor: string, maxAge: number, request: Request) {
  const { protocolo, basePath } = contextoPedido(request)
  const secure = process.env.NODE_ENV === 'production' || protocolo === 'https:'
  return `${COOKIE}=${valor}; Path=${basePath}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`
}

// El evento registra solo la cuenta validada: nunca el usuario ni la clave intentados, ni el token.
export const POST = conAuditoria('links.sesion_iniciar', '/links/api/sesion', rutaLinks(async (request) => {
  const espera = limitador.consumir(contextoPedido(request).ip)
  if (espera !== null) return Response.json({ error: 'Demasiados intentos.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(espera) } })
  if (!origenPropio(request)) return Response.json({ error: 'Origen no permitido' }, { status: 403 })
  const cred = leerCredenciales()
  if (!cred) return Response.json({ error: 'El acceso de administración no está configurado.' }, { status: 503 })
  const body = loginSchema.safeParse(await leerJsonLimitado(request, 4096))
  if (!body.success) return Response.json({ error: 'Datos inválidos' }, { status: 400 })
  if (!credencialesValidas(cred, body.data.usuario, body.data.clave)) {
    return Response.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401 })
  }
  const usuario = body.data.usuario
  actorAuditoria({ actorTipo: 'compartido', actorId: usuario, actorRol: null, viaAcceso: 'sesion_links' })
  const token = await cambioAuditado(
    () => crearSesion(cred, usuario),
    () => ({ status: 200, objetoTipo: 'sesion_links', objetoId: null }),
  )
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie(token, DURACION_S, request) } })
}))

export const DELETE = conAuditoria('links.sesion_cerrar', '/links/api/sesion', rutaLinks(async (request) => {
  if (!origenPropio(request)) return Response.json({ error: 'Origen no permitido' }, { status: 403 })
  const token = request.headers.get('cookie')?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  actorAuditoria({ actorTipo: 'compartido', actorId: null, actorRol: null, viaAcceso: 'sesion_links' })
  await cambioAuditado(
    () => revocarSesion(token),
    () => ({ status: 200, objetoTipo: 'sesion_links', objetoId: null }),
  )
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie('', 0, request) } })
}))
