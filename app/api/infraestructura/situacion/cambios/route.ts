import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { obtenerCambiosDesde } from '@/lib/infraestructura/riesgo/situacion/consulta'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const filtrosSchema = z.object({
  // Acepta 'Z' u offset explícito (mismo formato que produce toISOString()).
  desde: z.iso.datetime({ offset: true }),
  territorioTipo: z.literal('departamento').optional(),
  territorioId: z.string().min(1).optional(),
})

export async function GET(request: Request) {
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  await ensureSeeded()

  const { searchParams } = new URL(request.url)
  const parsed = filtrosSchema.safeParse({
    desde: searchParams.get('desde') ?? undefined,
    territorioTipo: searchParams.get('territorioTipo') ?? undefined,
    territorioId: searchParams.get('territorioId') ?? undefined,
  })
  if (!parsed.success) {
    return jsonError('Parámetro "desde" requerido (ISO-8601)', 400)
  }
  const { desde, territorioTipo, territorioId } = parsed.data
  if (territorioId && !territorioTipo) {
    return jsonError('territorioId requiere territorioTipo', 400)
  }

  // El selector "Cambios desde" de la UI define explícitamente que devuelve
  // AMBAS lecturas (registro y vigencia) en la misma respuesta: el cliente
  // alterna sin volver a pedir al servidor.
  const cambios = await obtenerCambiosDesde({
    desde: new Date(desde),
    territorioTipo,
    territorioId,
  })

  return jsonNoStore(cambios)
}
