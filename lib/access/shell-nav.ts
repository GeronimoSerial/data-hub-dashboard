import type { Role, SessionUser } from '@/lib/acl'
import type { SectionPolicy } from '@/lib/hub-sections'
import { can, type Capability } from './capabilities'

/** Capability behind each hub destination the app shell lists in its primary navigation. */
const SHELL_NAV_CAPABILITY: Readonly<Record<string, Capability>> = {
  '/': 'hub.landing',
  '/explorar': 'hub.explore',
}

/** Client-safe user for the shell, which only knows the role and the hub policy. */
export function shellUserFor(role: Role, hubPolicy: SectionPolicy | undefined): SessionUser {
  return { id: '', role, banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], hubPolicy }
}

/** Whether the shell may list this destination in its primary navigation for the user. */
export function shellNavAllowed(user: SessionUser | null, href: string): boolean {
  const capability = Object.hasOwn(SHELL_NAV_CAPABILITY, href) ? SHELL_NAV_CAPABILITY[href] : undefined
  return capability !== undefined && can(user, capability)
}
