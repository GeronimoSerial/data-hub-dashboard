import { HubDataProvider } from '@/components/hub-data'
import { AppShell } from '@/components/app-shell'
import { loadCatalogFor } from '@/lib/db/hub-catalog-for'
import { ensureSeeded } from '@/lib/db/seed'
import { migrarDb } from '@/lib/db'
import { getSessionUser, getShellUser } from '@/lib/session'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { situacionEnabled } from '@/lib/infraestructura/riesgo/flags'
import { resolveServerHubEntry, serverHubPathAllowedByExistingAcl, serverHubPathAllowedByPolicy } from '@/lib/hub-entry-server'
import { safeInternalReturnTo } from '@/lib/hub-entry'
import { sectionForPath } from '@/lib/hub-sections'

export default async function HubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await migrarDb()
  const sessionUser = await getSessionUser()
  const requestUrl = safeInternalReturnTo((await headers()).get('x-hub-request-url'))
  const requestedPath = requestUrl?.pathname ?? '/'
  if (!sessionUser) {
    const callback = requestUrl?.href ?? '/'
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`)
  }
  if (sessionUser.banned) redirect('/forbidden')

  // Unknown paths retain their existing page-specific guards (admin, uploads,
  // and future pages); registered hub sections are denied before catalog load.
  if (sectionForPath(requestedPath) && !await serverHubPathAllowedByPolicy(sessionUser, requestedPath)) {
    const destination = await resolveServerHubEntry(sessionUser, { currentPath: requestedPath })
    redirect(destination ?? '/forbidden')
  }

  if (requestedPath === '/situacion' && !await serverHubPathAllowedByExistingAcl(sessionUser, requestedPath)) {
    redirect('/forbidden')
  }

  await ensureSeeded()
  if (sectionForPath(requestedPath) && !await serverHubPathAllowedByExistingAcl(sessionUser, requestedPath)) {
    const destination = await resolveServerHubEntry(sessionUser, { currentPath: requestedPath })
    redirect(destination ?? '/forbidden')
  }
  const initialUser = await getShellUser()
  const initialCatalog = await loadCatalogFor(sessionUser)
  // /api/hub answers 403 without the explore section; skip the client refresh then.
  const canRefreshCatalog = await serverHubPathAllowedByPolicy(sessionUser, '/explorar')
  return (
    <HubDataProvider initialCatalog={initialCatalog} canRefreshCatalog={canRefreshCatalog}>
      <AppShell initialUser={initialUser} situacionEnabled={situacionEnabled()}>{children}</AppShell>
    </HubDataProvider>
  )
}
