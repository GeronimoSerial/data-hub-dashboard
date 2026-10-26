import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { sinTokenHash } from '@/lib/infraestructura/verificacion-route'
import {
  cancelarVerificacion,
} from '@/lib/infraestructura/verificaciones'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const cancelarVerificacionInputSchema = z.object({
  motivo: z.string().trim().min(1).optional(),
})

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

async function handlePOST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

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
    return jsonError(parsed.error.issues[0]?.message ?? 'Cuerpo inválido', 400, NO_STORE)
  }

  const resultado = await cancelarVerificacion({
    verificacionId: id,
    actorUserId: user!.id,
    motivo: parsed.data.motivo ?? null,
  })

  if (!resultado.ok) {
    return jsonError(mensajeMotivo(resultado.motivo), resultado.status, NO_STORE)
  }

  return jsonNoStore({ ok: true, verificacion: sinTokenHash(resultado.verificacion) })
}

export const POST = ruta('infraestructura.verificaciones.id.cancelar.post', handlePOST)
