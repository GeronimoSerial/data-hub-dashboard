import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { cerrarEpisodio, obtenerEpisodio } from '@/lib/infraestructura/episodios'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Por ahora la única transición soportada es el cierre del episodio.
const patchBodySchema = z.object({ accion: z.literal('cerrar') })

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) {
    return Response.json(
      { error: guard.error },
      { status: guard.status, headers: NO_STORE },
    )
  }

  const { id } = await ctx.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: NO_STORE })
  }

  const parsed = patchBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Cuerpo inválido' },
      { status: 400, headers: NO_STORE },
    )
  }

  const resultado = await cerrarEpisodio({ episodioId: id })
  if (!resultado.ok) {
    if (resultado.motivo === 'no_existe') {
      return Response.json(
        { error: 'El episodio no existe' },
        { status: 404, headers: NO_STORE },
      )
    }
    return Response.json(
      { error: 'El episodio ya estaba cerrado' },
      { status: 409, headers: NO_STORE },
    )
  }

  const episodio = await obtenerEpisodio(id)
  return Response.json({ ok: true, episodio }, { status: 200, headers: NO_STORE })
}
