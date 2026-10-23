import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { puedeAbrir } from '@/lib/acl'
import { alcanceMapa } from '@/lib/infraestructura/alcance-mapa'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { ensureSeeded } from '@/lib/db/seed'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function InfraestructuraMapRoute() {
  await requireServerHubPageAccess('/mapas/infraestructura')
  await ensureSeeded()
  const user = await getSessionUser()
  if (!user) redirect('/login?callbackUrl=/mapas/infraestructura')
  const found = await loadRecursoAccessByRuta('/mapas/infraestructura')
  // operador_establecimiento (y director sin niveles) no ve el mapa aunque el recurso esté abierto.
  if (!found || !puedeAbrir(user, found.access) || alcanceMapa(user).tipo === 'ninguno') {
    redirect('/forbidden')
  }
  return null
}
