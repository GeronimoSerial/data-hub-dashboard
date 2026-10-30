import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { puedeAbrir } from '@/lib/acl'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { ensureSeeded } from '@/lib/db/seed'
import { ReorganizacionMapClient } from './map-client'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export const runtime = 'nodejs'

export default async function ReorganizacionMapRoute() {
  await requireServerHubPageAccess('/mapas/reorganizacion')
  await ensureSeeded()
  const user = await getSessionUser()
  if (!user) redirect('/login?callbackUrl=/mapas/reorganizacion')
  const found = await loadRecursoAccessByRuta('/mapas/reorganizacion')
  if (!found || !puedeAbrir(user, found.access)) redirect('/forbidden')
  return <ReorganizacionMapClient />
}
