import { HubDataProvider } from '@/components/hub-data'
import { AppShell } from '@/components/app-shell'

export default function HubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <HubDataProvider>
      <AppShell>{children}</AppShell>
    </HubDataProvider>
  )
}
