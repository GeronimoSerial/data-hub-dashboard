import { CuadernillosWorkspace } from '@/components/cuadernillos/workspace'
import { hasBookletCapability, isBookletAdminViewer } from '@/lib/cuadernillos/permissions'
import type { BookletCapability } from '@/lib/cuadernillos/types'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CAPABILITIES: readonly BookletCapability[] = ['planning', 'cabecera', 'supervisor']

export default async function CuadernillosPage() {
  const actor = await requireServerHubPageAccess('/cuadernillos', 'cuadernillos')
  const access = await Promise.all(CAPABILITIES.map((capability) => hasBookletCapability(actor, capability)))
  const memberships = CAPABILITIES.filter((_, index) => access[index])
  // Admin viewers see every tab read-only; writes stay gated by memberships on the server and in the UI.
  const adminViewer = await isBookletAdminViewer(actor)
  const visible = adminViewer ? [...CAPABILITIES] : memberships
  const readOnlyCapabilities = visible.filter((capability) => !memberships.includes(capability))

  return <CuadernillosWorkspace capabilities={visible} readOnlyCapabilities={readOnlyCapabilities} />
}
