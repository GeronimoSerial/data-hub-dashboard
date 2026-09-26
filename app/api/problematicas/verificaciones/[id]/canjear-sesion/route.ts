// Endpoint público del enlace de verificación escolar (batch E1, protocolo
// ENOS). Canjea la credencial de un solo uso por una sesión acotada por CUE:
// sin consumir el token (es sólo lectura, igual que validar-token), setea la
// cookie `verificacion_sesion` que habilita el formulario de parte
// (POST /api/problematicas/parte) SIN la contraseña compartida, y únicamente
// para el CUE exacto de esta verificación.
//
// Misma excepción deliberada que validar-token: es una LECTURA transportada
// por POST. El token nunca puede ir en la query string de un GET porque
// quedaría registrado en los logs de acceso del servidor.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { getClientIp, ipExcedeLimite } from '@/lib/infraestructura/limites'
import {
  NOMBRE_COOKIE_SESION_VERIFICACION,
  crearSesionVerificacion,
  opcionesCookieSesionVerificacion,
} from '@/lib/infraestructura/verificacion-sesion'
import {
  validarCredencial,
  verificacionHabilitaSesionEscritura,
  type VerificacionRow,
} from '@/lib/infraestructura/verificaciones'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Nunca cachear: la respuesta describe una credencial de un solo uso.
// Referrer-Policy evita que un recurso cargado por la página filtre el token
// en un Referer saliente.
const CACHE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
}

// Frases para mostrarle a un director, nunca el motivo técnico.
const MENSAJES: Record<string, string> = {
  credencial_invalida: 'El enlace no es válido.',
  credencial_revocada: 'Este enlace fue revocado.',
  credencial_vencida: 'Este enlace venció.',
  solicitud_cancelada: 'Esta solicitud fue cancelada.',
  no_existe: 'La solicitud no existe.',
}

function mensajeDeMotivo(motivo: string): string {
  return MENSAJES[motivo] ?? 'No se pudo validar el enlace.'
}

// El hash del token jamás sale en una respuesta JSON.
function sinTokenHash(verificacion: VerificacionRow): Omit<VerificacionRow, 'tokenHash'> {
  const { tokenHash: _tokenHash, ...resto } = verificacion
  return resto
}

const bodySchema = z.object({ token: z.string().trim().min(1) })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSeeded()

  const ip = getClientIp(request)
  if (ipExcedeLimite(ip)) {
    return Response.json(
      { error: 'Demasiadas solicitudes. Intente nuevamente más tarde.' },
      { status: 429, headers: CACHE_HEADERS },
    )
  }

  const { id } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: CACHE_HEADERS })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: CACHE_HEADERS })
  }

  const resultado = await validarCredencial({ verificacionId: id, token: parsed.data.token })
  if (!resultado.ok) {
    return Response.json(
      { error: mensajeDeMotivo(resultado.motivo) },
      { status: resultado.status, headers: CACHE_HEADERS },
    )
  }

  // Regla de N1: la credencial puede seguir siendo válida (validarCredencial
  // es de sólo lectura, para mostrar el comprobante) pero una verificación ya
  // respondida/cancelada o con el token revocado/vencido NO puede canjear una
  // sesión nueva. 409 y no 403/410: la credencial en sí está bien; lo que
  // cambió es el estado de la solicitud (esos otros casos ya los cubre
  // validarCredencial antes de llegar acá).
  if (!(await verificacionHabilitaSesionEscritura(id))) {
    return Response.json(
      { error: 'Esta solicitud ya fue respondida.' },
      { status: 409, headers: CACHE_HEADERS },
    )
  }

  // La sesión se acota al CUE de la verificación canjeada: nunca a otro.
  const { valorCookie, expiraEn } = crearSesionVerificacion(id, resultado.verificacion.cueAnexo)
  const respuesta = NextResponse.json(
    { ok: true, verificacion: sinTokenHash(resultado.verificacion) },
    { status: 200, headers: CACHE_HEADERS },
  )
  respuesta.cookies.set(
    NOMBRE_COOKIE_SESION_VERIFICACION,
    valorCookie,
    opcionesCookieSesionVerificacion(expiraEn),
  )
  return respuesta
}
