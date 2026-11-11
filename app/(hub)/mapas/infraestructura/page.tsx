import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { puedeLeerMapaInfraestructura } from '@/lib/infraestructura/acceso-lectura'
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
  if (!puedeLeerMapaInfraestructura(user, found?.access ?? null)) {
    redirect('/forbidden')
  }
  return null
}
