import { HubDataProvider } from '@/components/hub-data'
import { AppShell } from '@/components/app-shell'
import { getShellUser } from '@/lib/session'

export default async function HubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initialUser = await getShellUser()
  return (
    <HubDataProvider>
      <AppShell initialUser={initialUser}>{children}</AppShell>
    </HubDataProvider>
  )
}
