import { HubDataProvider } from '@/components/hub-data'
import { AppShell } from '@/components/app-shell'
import { loadCatalogFor } from '@/lib/db/hub-catalog-for'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, getShellUser } from '@/lib/session'

export default async function HubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await ensureSeeded()
  // getShellUser y getSessionUser pegan ambos a auth.api.getSession; no vale
  // la pena compartirlos acá (una llama a la sesión + campos de la tabla
  // `user`, la otra solo nombre/rol) así que se resuelven en paralelo.
  const [initialUser, sessionUser] = await Promise.all([
    getShellUser(),
    getSessionUser(),
  ])
  const initialCatalog = await loadCatalogFor(sessionUser)
  return (
    <HubDataProvider initialCatalog={initialCatalog}>
      <AppShell initialUser={initialUser}>{children}</AppShell>
    </HubDataProvider>
  )
}
