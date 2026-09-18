import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import { puedeVerNominal } from '@/lib/infraestructura/permiso-nominal'
import { consultarYRegistrarAfectados } from '@/lib/infraestructura/identidad'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Verificación propia de esta ruta: no se hereda del mapa
// (/api/mapas/infraestructura usa verificarAccesoLectura, que gobierna un
// permiso distinto). puedeVerNominal() nunca mira el rol.
export async function GET(request: Request) {
  await ensureSeeded()

  const user = await getSessionUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const ahora = new Date()
  const autorizado = await puedeVerNominal(user, ahora)
  if (!autorizado) {
    return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const problematicaId = searchParams.get('problematica')
  if (!problematicaId) {
    return Response.json({ error: 'Falta el parámetro problematica' }, { status: 400 })
  }

  const client = getDb().$client
  const resultado = await consultarYRegistrarAfectados(client, user.id, problematicaId, ahora)
  if (!resultado) {
    return Response.json({ error: 'Problemática no encontrada' }, { status: 404 })
  }

  return Response.json(resultado, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
