import { redirect, notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import { puedeAbrir } from '@/lib/acl'
import { loadRecursoAccess } from '@/lib/db/recurso-access'
import { loadHubCatalog } from '@/lib/db/hub'
import { ResourceExperience } from '@/components/resource-experience'
import { normalizeResourceReturnTo } from '@/lib/resource-href'

export const runtime = 'nodejs'

export default async function RecursoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  await ensureSeeded()
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const rawReturnTo = resolvedSearchParams.returnTo
  const returnTo = normalizeResourceReturnTo(
    Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo,
  )
  const fichaHref = `/recursos/${encodeURIComponent(id)}`
  const [row] = await getDb().select().from(recursos).where(eq(recursos.id, id))
  if (!row) notFound()
  const user = await getSessionUser()
  if (!user) {
    const callback = rawReturnTo === undefined
      ? fichaHref
      : `${fichaHref}?returnTo=${encodeURIComponent(returnTo)}`
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`)
  }
  const access = await loadRecursoAccess(id)
  if (!access || !puedeAbrir(user, access)) redirect('/forbidden')
  const catalog = await loadHubCatalog({ publishedOnly: false })
  const recurso = catalog.recursos.find((item) => item.id === id)
  if (!recurso) notFound()
  return (
    <ResourceExperience
      recurso={recurso}
      categorias={catalog.categorias}
      niveles={catalog.niveles}
      tipos={catalog.tipos}
      related={catalog.recursos}
      returnTo={returnTo}
    />
  )
}
