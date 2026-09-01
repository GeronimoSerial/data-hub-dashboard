import {
  FolderKanban,
  Layers3,
  ListTree,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/acl'

export type AdminSectionId =
  | 'recursos'
  | 'categorias'
  | 'tags'
  | 'niveles'
  | 'tipos'
  | 'usuarios'

export type AdminSectionConfig = {
  id: AdminSectionId
  label: string
  group: 'Contenido' | 'Organización' | 'Accesos'
  icon: LucideIcon
  roles: readonly Role[]
}

const STAFF: readonly Role[] = ['admin']
const EDITORIAL: readonly Role[] = ['admin', 'editor']

export const ADMIN_SECTIONS: readonly AdminSectionConfig[] = [
  { id: 'recursos', label: 'Recursos', group: 'Contenido', icon: FolderKanban, roles: EDITORIAL },
  { id: 'categorias', label: 'Categorías', group: 'Organización', icon: Tags, roles: STAFF },
  { id: 'tags', label: 'Tags', group: 'Organización', icon: ListTree, roles: STAFF },
  { id: 'niveles', label: 'Niveles', group: 'Organización', icon: Layers3, roles: STAFF },
  { id: 'tipos', label: 'Tipos', group: 'Organización', icon: ListTree, roles: STAFF },
  { id: 'usuarios', label: 'Usuarios', group: 'Accesos', icon: Users, roles: STAFF },
]

export function adminSectionsForRole(role: Role) {
  return ADMIN_SECTIONS.filter((section) => section.roles.includes(role))
}

export function adminSectionHref(section: AdminSectionId) {
  return `/admin?section=${section}`
}

export function adminSectionFromHash(hash: string | null | undefined) {
  const value = hash?.replace(/^#/, '').replace(/^\/+/, '')
  return ADMIN_SECTIONS.some((section) => section.id === value)
    ? value as AdminSectionId
    : null
}

export function normalizeAdminSection(
  raw: string | null | undefined,
  role: Role,
): AdminSectionId {
  const section = ADMIN_SECTIONS.find((item) => item.id === raw)
  return section?.roles.includes(role) ? section.id : 'recursos'
}
