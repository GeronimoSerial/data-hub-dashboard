import { CuadernillosWorkspace } from '@/components/cuadernillos/workspace'
import { hasBookletCapability } from '@/lib/cuadernillos/permissions'
import type { BookletCapability } from '@/lib/cuadernillos/types'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CAPABILITIES: readonly BookletCapability[] = ['planning', 'cabecera', 'supervisor']

export default async function CuadernillosPage() {
  const actor = await requireServerHubPageAccess('/cuadernillos', 'cuadernillos')
  const access = await Promise.all(CAPABILITIES.map((capability) => hasBookletCapability(actor, capability)))
  const capabilities = CAPABILITIES.filter((_, index) => access[index])

  return <CuadernillosWorkspace capabilities={[...capabilities]} />
}
