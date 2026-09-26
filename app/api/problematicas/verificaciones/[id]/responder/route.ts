// Endpoint público del enlace de verificación escolar (batch E1, protocolo
// ENOS). Registra la respuesta del establecimiento SIN sesión: la única
// credencial es el token que viaja en el body.
//
// Este endpoint admite SOLO 'sin_afectacion' y 'no_disponible'. La respuesta
// 'con_afectacion' se resuelve reusando el formulario de parte existente
// (POST /api/problematicas/parte), que crea el movimiento real; un segundo
// paso (POST .../vincular-movimiento) enlaza ese movimiento con la
// verificación. El schema Zod rechaza 'con_afectacion' con 400 antes de
// llegar a la máquina de estados, así que no hace falta lógica extra.
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

// 'con_afectacion' NO está en el enum a propósito: ese camino reusa el
// formulario de parte y enlaza el movimiento en un endpoint aparte.
const bodySchema = z.object({
  token: z.string().trim().min(1),
  resultado: z.enum(['sin_afectacion', 'no_disponible']),
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
    resultado: parsed.data.resultado,
    movimientoId: null,
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
