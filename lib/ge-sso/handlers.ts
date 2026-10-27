import { auth } from '@/lib/auth'
import { provisionarUsuarioGe, nivelJurisdiccionalExiste } from './provision'
import { registrarEventoGeSso, type EventoGeSso } from './evento'
import {
  esFormatoLegacyGe,
  geLoginLegacySchema,
  geLoginSchema,
  type GeLoginBody,
  type UsuarioGeInput,
} from './roles'
import { emitirTicket } from './ticket'
import {
  apiKeyCoincide,
  cabecerasCors,
  geRateLimit,
  ipCliente,
  origenGePermitido,
} from './seguridad'
import { esStagingForwardActivo, reenviarGeLoginAStaging } from './staging-forward'
import { emitirLogLogin, identificarIntento, nuevaTrazaLoginGe, type TrazaLoginGe } from './login-log'

const CABECERAS_BASE = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CABECERAS_BASE, 'Content-Type': 'application/json', ...extra },
  })
}

/** Preflight CORS de `POST /api/auth/ge-login`. */
export function responderPreflightGe(request: Request): Response {
  const origin = request.headers.get('origin')
  if (!origenGePermitido(origin)) {
    return json({ error: 'Origen no permitido' }, 403)
  }
  return new Response(null, { status: 204, headers: { ...CABECERAS_BASE, ...cabecerasCors(origin!) } })
}

/**
 * `POST /api/auth/ge-login`: GE informa el usuario (desde el navegador del
 * usuario) y recibe la URL de callback con un ticket de 60 segundos.
 * Dos formatos en el mismo endpoint:
 * - actual: `{ email, nombre, apellido, rol, cue?, nivelJurisdiccionalId?, api_key }`
 *   -> `201 { redirectUrl }`.
 * - legacy ("asistencias"): `{ CUE, USUARIO, secret }` -> `200 { url }`.
 * Orden: origen -> rate limit -> clave -> body -> reglas de negocio.
 * Cada intento deja una línea `ge-sso-login` (ver login-log.ts), también si falla.
 */
export async function manejarGeLogin(request: Request): Promise<Response> {
  const traza = nuevaTrazaLoginGe(request)
  try {
    const response = await procesarGeLogin(request, traza)
    emitirLogLogin(traza, response.status)
    return response
  } catch (err) {
    traza.motivo = 'error_interno'
    emitirLogLogin(traza, 500)
    throw err
  }
}

/** Tells an invalid or missing CUE apart from any other invalid body. */
function motivoBodyInvalido(issues: { path: PropertyKey[] }[]): string {
  return issues.some((issue) => issue.path[0] === 'CUE' || issue.path[0] === 'cue')
    ? 'cue_invalido'
    : 'body_invalido'
}

async function conMotivoStaging(traza: TrazaLoginGe, envio: Promise<Response>): Promise<Response> {
  const response = await envio
  if (!response.ok) traza.motivo = 'error_reenvio_staging'
  return response
}

async function procesarGeLogin(request: Request, traza: TrazaLoginGe): Promise<Response> {
  const origin = request.headers.get('origin')
  if (!origenGePermitido(origin)) {
    traza.motivo = 'origen_no_permitido'
    return json({ error: 'Origen no permitido' }, 403)
  }
  const cors = cabecerasCors(origin!)
  const ip = ipCliente(request)
  const rechazar = async (
    status: number,
    resultado: string,
    mensaje: string,
    parcial: Omit<EventoGeSso, 'resultado' | 'ip'> = {},
  ) => {
    traza.motivo ??= resultado
    await registrarEventoGeSso({ ...parcial, ip, resultado })
    return json({ error: mensaje }, status, cors)
  }

  if (!geRateLimit.permitir(ip)) {
    return rechazar(429, 'rate_limit', 'Demasiadas solicitudes')
  }

  const esperada = process.env.GE_SSO_API_KEY
  if (!esperada) {
    console.error('[ge-sso] GE_SSO_API_KEY no configurada: SSO deshabilitado')
    traza.motivo = 'sso_no_configurado'
    return json({ error: 'SSO de GE no configurado' }, 503, cors)
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return rechazar(400, 'json_invalido', 'JSON inválido')
  }
  identificarIntento(traza, raw)

  const legacy = esFormatoLegacyGe(raw)
  const campoClave = legacy ? 'secret' : 'api_key'
  const registro = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const valorClave = registro[campoClave]
  const recibida = typeof valorClave === 'string' ? valorClave : ''
  if (!recibida || !apiKeyCoincide(recibida, esperada)) {
    traza.motivo = 'firma_invalida'
    return rechazar(401, 'api_key_invalida', 'api_key inválida')
  }

  const esReenvioInterno = request.headers.get('x-ge-sso-forwarded') === 'true'
  if (!esReenvioInterno && esStagingForwardActivo()) {
    if (legacy) {
      const parsedLegacy = geLoginLegacySchema.safeParse(raw)
      if (parsedLegacy.success) {
        traza.reenviadoStaging = true
        return conMotivoStaging(traza, reenviarGeLoginAStaging({
          raw,
          origin: origin!,
          ip,
          cors,
          evento: {
            email: parsedLegacy.data.email,
            rol: parsedLegacy.data.rol,
            cue: parsedLegacy.data.cue ?? null,
          },
        }))
      }
    } else {
      const parsed = geLoginSchema.safeParse(raw)
      if (parsed.success && parsed.data.rol === 'operador_establecimiento') {
        traza.reenviadoStaging = true
        return conMotivoStaging(traza, reenviarGeLoginAStaging({
          raw,
          origin: origin!,
          ip,
          cors,
          evento: {
            email: parsed.data.email,
            rol: parsed.data.rol,
            cue: parsed.data.cue ?? null,
            nivelJurisdiccionalId: null,
          },
        }))
      }
    }
  }

  if (legacy) {
    return manejarGeLoginLegacy(raw, { ip, cors, rechazar, traza })
  }

  const parsed = geLoginSchema.safeParse(raw)
  if (!parsed.success) {
    traza.motivo = motivoBodyInvalido(parsed.error.issues)
    return rechazar(400, 'body_invalido', 'Body inválido')
  }
  const body: GeLoginBody = parsed.data
  const evento = {
    email: body.email,
    rol: body.rol,
    cue: body.cue ?? null,
    nivelJurisdiccionalId: body.nivelJurisdiccionalId ?? null,
  }

  if (
    body.rol === 'director_nivel' &&
    !(await nivelJurisdiccionalExiste(body.nivelJurisdiccionalId!))
  ) {
    return rechazar(400, 'nivel_inexistente', 'nivelJurisdiccionalId no existe en el catálogo', evento)
  }

  const base = process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, '')
  if (!base) {
    console.error('[ge-sso] BETTER_AUTH_URL no configurada')
    traza.motivo = 'sso_no_configurado'
    return json({ error: 'SSO de GE no configurado' }, 503, cors)
  }

  const provision = await provisionarUsuarioGe({
    email: body.email,
    nombre: `${body.nombre} ${body.apellido}`,
    rol: body.rol,
    cue: body.cue,
    nivelJurisdiccionalId: body.nivelJurisdiccionalId,
  })
  if (!provision.ok) {
    traza.motivo = 'usuario_bloqueado'
    return rechazar(403, 'bloqueado', 'Usuario bloqueado', evento)
  }

  const ticket = await emitirTicket(provision.userId)
  await registrarEventoGeSso({ ...evento, ip, resultado: 'ok' })
  return json({ redirectUrl: `${base}/auth/ge-callback?token=${ticket}` }, 201, cors)
}

type ContextoRechazo = {
  ip: string
  cors: Record<string, string>
  traza: TrazaLoginGe
  rechazar: (
    status: number,
    resultado: string,
    mensaje: string,
    parcial?: Omit<EventoGeSso, 'resultado' | 'ip'>,
  ) => Promise<Response>
}

/** Formato legacy ya autenticado por `secret`. Responde `200 { url }`. */
async function manejarGeLoginLegacy(raw: unknown, ctx: ContextoRechazo): Promise<Response> {
  const parsed = geLoginLegacySchema.safeParse(raw)
  if (!parsed.success) {
    ctx.traza.motivo = motivoBodyInvalido(parsed.error.issues)
    return ctx.rechazar(400, 'body_invalido', 'Body inválido')
  }
  const input: UsuarioGeInput = parsed.data
  const evento = { email: input.email, rol: input.rol, cue: input.cue ?? null }

  const base = process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, '')
  if (!base) {
    console.error('[ge-sso] BETTER_AUTH_URL no configurada')
    ctx.traza.motivo = 'sso_no_configurado'
    return json({ error: 'SSO de GE no configurado' }, 503, ctx.cors)
  }

  const provision = await provisionarUsuarioGe(input)
  if (!provision.ok) {
    ctx.traza.motivo = 'usuario_bloqueado'
    return ctx.rechazar(403, 'bloqueado', 'Usuario bloqueado', evento)
  }

  const ticket = await emitirTicket(provision.userId)
  await registrarEventoGeSso({ ...evento, ip: ctx.ip, resultado: 'ok' })
  return json({ url: `${base}/auth/ge-callback?token=${ticket}` }, 200, ctx.cors)
}

function redireccion(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ ...CABECERAS_BASE, Location: location })
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(null, { status: 302, headers })
}

const RUTA_ERROR = '/login?error=ge_sso'

/**
 * `GET /auth/ge-callback?token=`: canjea el ticket (un solo uso) por una sesión
 * de better-auth y redirige según el rol de la app.
 */
export async function manejarGeCallback(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const ip = ipCliente(request)
  if (!token) {
    await registrarEventoGeSso({ ip, resultado: 'ticket_ausente' })
    return redireccion(RUTA_ERROR)
  }
  try {
    const { headers, response } = await auth.api.geSsoConsume({
      body: { token },
      returnHeaders: true,
    })
    await registrarEventoGeSso({
      email: response.email,
      rol: response.rol,
      ip,
      resultado: 'sesion_iniciada',
    })
    return redireccion(response.destino, headers.getSetCookie())
  } catch {
    await registrarEventoGeSso({ ip, resultado: 'ticket_invalido' })
    return redireccion(RUTA_ERROR)
  }
}
