import { z } from 'zod'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { crearEpisodio, listarEpisodios } from '@/lib/infraestructura/episodios'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Filtro opcional del listado. Sólo estos dos valores existen en el modelo.
const estadoQuerySchema = z.enum(['abierto', 'cerrado'])

const crearEpisodioBodySchema = z.object({
  periodoId: z.string().trim().min(1).optional(),
  nombre: z.string().trim().min(1, 'Nombre requerido'),
  descripcion: z.string().trim().min(1).optional(),
})

export async function GET(request: Request) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) {
    return Response.json(
      { error: guard.error },
      { status: guard.status, headers: NO_STORE },
    )
  }

  const rawEstado = new URL(request.url).searchParams.get('estado')
  const parsed = estadoQuerySchema.safeParse(rawEstado)
  if (rawEstado !== null && !parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Estado inválido' },
      { status: 400, headers: NO_STORE },
    )
  }

  const episodios = await listarEpisodios(parsed.success ? { estado: parsed.data } : undefined)
  return Response.json({ ok: true, episodios }, { status: 200, headers: NO_STORE })
}

export async function POST(request: Request) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) {
    return Response.json(
      { error: guard.error },
      { status: guard.status, headers: NO_STORE },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: NO_STORE })
  }

  const parsed = crearEpisodioBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Cuerpo inválido' },
      { status: 400, headers: NO_STORE },
    )
  }

  const episodio = await crearEpisodio({
    periodoId: parsed.data.periodoId ?? PERIODO_ENOS_2026_2027_ID,
    nombre: parsed.data.nombre,
    descripcion: parsed.data.descripcion ?? null,
  })

  return Response.json({ ok: true, episodio }, { status: 201, headers: NO_STORE })
}
