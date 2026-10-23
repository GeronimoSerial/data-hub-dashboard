import { HubPage } from '@/components/hub-page'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export default async function Home() {
  await requireServerHubPageAccess('/')
  return <HubPage />
}
