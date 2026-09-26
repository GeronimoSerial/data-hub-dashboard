// Endpoint público del enlace de verificación escolar (batch E1, protocolo
// ENOS). Valida la credencial de un solo uso SIN consumirla y sin sesión: la
// única credencial es el token que viaja en el body.
//
// Excepción deliberada al criterio "GET sin efectos": esto es una LECTURA
// transportada por POST. El token NUNCA puede ir en la query string de un GET
// porque quedaría registrado en los logs de acceso del servidor (y en
// cualquier proxy intermedio). El cuerpo de un POST no se loguea por defecto.
import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { getClientIp, ipExcedeLimite } from '@/lib/infraestructura/limites'
import { validarCredencial, type VerificacionRow } from '@/lib/infraestructura/verificaciones'

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

  return Response.json(
    { ok: true, verificacion: sinTokenHash(resultado.verificacion) },
    { status: 200, headers: CACHE_HEADERS },
  )
}
