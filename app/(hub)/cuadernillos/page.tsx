import { CuadernillosWorkspace } from '@/components/cuadernillos/workspace'
import { hasBookletCapability, isBookletAdmin } from '@/lib/cuadernillos/permissions'
import { listViewAsCandidates, resolveViewAsActor } from '@/lib/cuadernillos/view-as'
import type { BookletCapability } from '@/lib/cuadernillos/types'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CAPABILITIES: readonly BookletCapability[] = ['planning', 'cabecera', 'supervisor']

export default async function CuadernillosPage({ searchParams }: { searchParams: Promise<{ viewAs?: string | string[] }> }) {
  const actor = await requireServerHubPageAccess('/cuadernillos', 'cuadernillos')
  const { viewAs: viewAsParam } = await searchParams
  const isAdmin = await isBookletAdmin(actor)
  const resolution = await resolveViewAsActor(actor, typeof viewAsParam === 'string' ? viewAsParam : null)
  const readActor = resolution.status === 'viewing' ? resolution.actor : actor
  const access = await Promise.all(CAPABILITIES.map((capability) => hasBookletCapability(readActor, capability)))
  const capabilities = CAPABILITIES.filter((_, index) => access[index])
  const viewAs = resolution.status === 'viewing' ? resolution.target : null
  const viewAsCandidates = isAdmin ? await listViewAsCandidates(actor) : []

  return (
    <CuadernillosWorkspace
      capabilities={[...capabilities]}
      isAdmin={isAdmin}
      viewAs={viewAs}
      viewAsUnavailable={resolution.status === 'unavailable'}
      viewAsCandidates={viewAsCandidates}
    />
  )
}
