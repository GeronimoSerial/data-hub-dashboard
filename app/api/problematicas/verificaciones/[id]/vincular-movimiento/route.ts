// Endpoint público del enlace de verificación escolar (batch E1, protocolo
// ENOS). Segundo paso de la respuesta "con afectación": enlaza el movimiento
// real que creó POST /api/problematicas/parte con la verificación, y la marca
// 'respondida'. Sin sesión: la única credencial es el token del body.
//
// `responderPorEnlace` valida que `movimientoId` pertenezca al MISMO CUE que
// la verificación (movimientoPerteneceAlCue, en lib/infraestructura/
// verificaciones.ts): si no coincide, devuelve 409 'movimiento_cue_no_coincide'
// sin escribir nada. El cliente sigue siendo responsable de llamar primero a
// POST /api/problematicas/parte y usar el movimientoId que ese endpoint
// devolvió, pero este endpoint ya no confía ciegamente en ese valor.
import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { getClientIp, ipExcedeLimite } from '@/lib/infraestructura/limites'
import { responderPorEnlace, type VerificacionRow } from '@/lib/infraestructura/verificaciones'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  respuesta_contradictoria: 'Ya se registró una respuesta distinta para esta solicitud.',
}

function mensajeDeMotivo(motivo: string): string {
  return MENSAJES[motivo] ?? 'No se pudo registrar la respuesta.'
}

// El hash del token jamás sale en una respuesta JSON.
function sinTokenHash(verificacion: VerificacionRow): Omit<VerificacionRow, 'tokenHash'> {
  const { tokenHash: _tokenHash, ...resto } = verificacion
  return resto
}

const bodySchema = z.object({
  token: z.string().trim().min(1),
  movimientoId: z.string().trim().min(1),
})

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

  const resultado = await responderPorEnlace({
    verificacionId: id,
    token: parsed.data.token,
    resultado: 'con_afectacion',
    movimientoId: parsed.data.movimientoId,
  })
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
