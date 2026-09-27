import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { aDtoPublico } from '@/lib/infraestructura/briefing-ia/dto'
import { obtenerBriefingPorId } from '@/lib/infraestructura/briefing-ia/repositorio'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Next.js 16 App Router: params es una promesa (misma firma que
// app/api/infraestructura/episodios-derivados/[id]/route.ts).
type Ctx = { params: Promise<{ id: string }> }

const idSchema = z.string().min(1).max(100)

export async function GET(_request: Request, ctx: Ctx) {
  await ensureSeeded()

  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) {
    return Response.json(
      { error: guard.error },
      { status: guard.status, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const { id } = await ctx.params
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) {
    return Response.json(
      { error: 'id inválido' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const briefing = await obtenerBriefingPorId(parsed.data)

  // El 404 es intencionalmente idéntico al de "no existe" para no distinguir
  // entre un briefing inexistente y uno que no debería verse.
  if (!briefing) {
    return Response.json(
      { error: 'No encontrado' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  return Response.json(aDtoPublico(briefing), {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
