import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { puedeAbrir } from '@/lib/acl'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { ensureSeeded } from '@/lib/db/seed'
import { MatriculaMapClient } from './map-client'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function MatriculaMapRoute() {
  await requireServerHubPageAccess('/mapas/matricula')
  await ensureSeeded()
  const user = await getSessionUser()
  if (!user) redirect('/login?callbackUrl=/mapas/matricula')
  const found = await loadRecursoAccessByRuta('/mapas/matricula')
  if (!found || !puedeAbrir(user, found.access)) redirect('/forbidden')
  return <MatriculaMapClient />
}
