import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { ruta } from '@/lib/http/ruta'
import { regionActiva } from '@/lib/infraestructura/region'
import { type Idioma } from '@/lib/i18n/idioma'
import { getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const cuerpo = z.object({ idioma: z.enum(['es', 'pt'] satisfies Idioma[]) })

// Saves the signed-in user's own language preference (D4). Languages the
// active region does not offer are rejected, so a stored value is always one
// the region can render.
async function handlePATCH(request: Request) {
  const sesion = await getSessionUser()
  if (!sesion) return Response.json({ error: 'No autenticado' }, { status: 401 })
  if (sesion.banned) return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const parsed = cuerpo.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Idioma inválido' }, { status: 400 })

  const { idioma } = parsed.data
  if (!regionActiva().idiomas.includes(idioma)) {
    return Response.json({ error: 'El idioma no está disponible en la región' }, { status: 400 })
  }

  await getDb().update(user).set({ idioma }).where(eq(user.id, sesion.id))
  return Response.json({ idioma })
}

export const PATCH = ruta('usuario.idioma.patch', handlePATCH)
