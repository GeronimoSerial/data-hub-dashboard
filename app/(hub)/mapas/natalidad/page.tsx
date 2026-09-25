import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { puedeAbrir } from '@/lib/acl'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { ensureSeeded } from '@/lib/db/seed'
import { NatalidadMapClient } from './map-client'

export const runtime = 'nodejs'

export default async function NatalidadMapRoute() {
  await ensureSeeded()
  const user = await getSessionUser()
  if (!user) redirect('/login?callbackUrl=/mapas/natalidad')
  const found = await loadRecursoAccessByRuta('/mapas/natalidad')
  if (!found || !puedeAbrir(user, found.access)) redirect('/forbidden')
  return <NatalidadMapClient />
}
