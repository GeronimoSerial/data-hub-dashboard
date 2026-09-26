import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import {
  cancelarVerificacion,
  type VerificacionRow,
} from '@/lib/infraestructura/verificaciones'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const cancelarVerificacionInputSchema = z.object({
  motivo: z.string().trim().min(1).optional(),
})

// tokenHash NUNCA viaja al cliente (ver route.ts de la colección).
function sinTokenHash(v: VerificacionRow): Omit<VerificacionRow, 'tokenHash'> {
  const { tokenHash: _tokenHash, ...resto } = v
  return resto
}

// Los motivos del dominio son claves estables; acá se traducen a frases para
// que el operador entienda el conflicto sin ver la clave cruda.
const MOTIVO_A_MENSAJE: Record<string, string> = {
  no_existe: 'La verificación no existe',
  ya_cancelada: 'La verificación ya estaba cancelada',
  ya_respondida: 'La verificación ya fue respondida',
  respuesta_contradictoria: 'La verificación ya fue respondida con otro resultado',
  solicitud_cancelada: 'La solicitud ya estaba cancelada',
  credencial_invalida: 'La credencial es inválida',
  credencial_revocada: 'La credencial fue revocada',
  credencial_vencida: 'La credencial está vencida',
  conflicto_concurrente: 'La verificación cambió de estado; reintente',
}

function mensajeMotivo(motivo: string): string {
  return MOTIVO_A_MENSAJE[motivo] ?? 'No se pudo completar la operación'
}

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) {
    return Response.json({ error: guard.error }, { status: guard.status, headers: NO_STORE })
  }

  const { id } = await context.params

  // El body es opcional: {} y un body vacío son válidos (cancelar sin motivo).
  let body: unknown = {}
  const texto = await request.text()
  if (texto.trim()) {
    try {
      body = JSON.parse(texto)
    } catch {
      return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: NO_STORE })
    }
  }

  const parsed = cancelarVerificacionInputSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Cuerpo inválido' },
      { status: 400, headers: NO_STORE },
    )
  }

  const resultado = await cancelarVerificacion({
    verificacionId: id,
    actorUserId: user!.id,
    motivo: parsed.data.motivo ?? null,
  })

  if (!resultado.ok) {
    return Response.json(
      { error: mensajeMotivo(resultado.motivo) },
      { status: resultado.status, headers: NO_STORE },
    )
  }

  return Response.json(
    { ok: true, verificacion: sinTokenHash(resultado.verificacion) },
    { status: 200, headers: NO_STORE },
  )
}
