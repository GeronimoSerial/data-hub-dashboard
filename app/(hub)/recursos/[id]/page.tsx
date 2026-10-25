import { redirect, notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import { puedeAbrir } from '@/lib/acl'
import { loadRecursoAccess } from '@/lib/db/recurso-access'
import { loadCatalogFor } from '@/lib/db/hub-catalog-for'
import { ResourceExperience } from '@/components/resource-experience'
import { isAllowedRuta } from '@/lib/recurso-write'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export const runtime = 'nodejs'

export default async function RecursoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireServerHubPageAccess(`/recursos/${encodeURIComponent(id)}`)
  await ensureSeeded()
  const [row] = await getDb().select().from(recursos).where(eq(recursos.id, id))
  if (!row) notFound()
  const user = await getSessionUser()
  if (!user) redirect(`/login?callbackUrl=/recursos/${id}`)
  const access = await loadRecursoAccess(id)
  if (!access || !puedeAbrir(user, access)) redirect('/forbidden')
  if (row.ruta && !row.storageKey) {
    if (!isAllowedRuta(row.ruta)) notFound()
    redirect(row.ruta)
  }
  const catalog = await loadCatalogFor(user)
  const recurso = catalog.recursos.find((item) => item.id === id)
  if (!recurso) notFound()
  return (
    <ResourceExperience
      recurso={recurso}
      categorias={catalog.categorias}
      niveles={catalog.niveles}
      tipos={catalog.tipos}
      related={catalog.recursos}
    />
  )
}
