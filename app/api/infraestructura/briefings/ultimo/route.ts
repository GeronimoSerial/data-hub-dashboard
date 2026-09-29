import { ensureSeeded } from '@/lib/db/seed'
import { aDtoPublico } from '@/lib/infraestructura/briefing-ia/dto'
import { obtenerUltimoBriefing } from '@/lib/infraestructura/briefing-ia/repositorio'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request) {
  await ensureSeeded()

  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  const briefing = await obtenerUltimoBriefing()
  if (!briefing) {
    return Response.json(
      { error: 'No hay briefings generados todavía' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  return Response.json(aDtoPublico(briefing), {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
