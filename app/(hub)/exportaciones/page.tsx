import { redirect } from 'next/navigation'
import { PanelExportaciones } from '@/components/exportaciones/panel-exportaciones'
import { puedeAbrir } from '@/lib/acl'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { ensureSeeded } from '@/lib/db/seed'
import { alcanceMapa } from '@/lib/infraestructura/alcance-mapa'
import { getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mismo criterio que /mapas/infraestructura: las exportaciones usan su recurso
// y su alcance, así que quien no ve el mapa tampoco descarga sus listas.
export default async function ExportacionesPage() {
  await ensureSeeded()
  const user = await getSessionUser()
  if (!user) redirect('/login?callbackUrl=/exportaciones')
  const found = await loadRecursoAccessByRuta('/mapas/infraestructura')
  if (!found || !puedeAbrir(user, found.access) || alcanceMapa(user).tipo === 'ninguno') {
    redirect('/forbidden')
  }
  return <PanelExportaciones />
}
