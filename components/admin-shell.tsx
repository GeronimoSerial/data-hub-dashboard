'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Role } from '@/lib/acl'
import {
  adminSectionFromHash,
  adminSectionHref,
  adminSectionsForRole,
  normalizeAdminSection,
  type AdminSectionId,
} from '@/lib/admin-navigation'
import { ArrowLeft } from 'lucide-react'

type AdminSectionContextValue = {
  section: AdminSectionId
  navigate: (section: AdminSectionId) => void
}

const AdminSectionContext = React.createContext<AdminSectionContextValue | null>(null)

export function useAdminSection() {
  const context = React.useContext(AdminSectionContext)
  if (!context) throw new Error('useAdminSection must be used within AdminShell')
  return context
}

export function AdminShell({ children, role }: { children: React.ReactNode; role: Role }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hashSection = typeof window === 'undefined' ? null : adminSectionFromHash(window.location.hash)
  const section = normalizeAdminSection(searchParams.get('section') ?? hashSection, role)
  const visibleSections = adminSectionsForRole(role)

  React.useEffect(() => {
    const hasCanonicalQuery = searchParams.toString() === `section=${section}`
    const hasHash = typeof window !== 'undefined' && Boolean(window.location.hash)
    if (!hasCanonicalQuery || hasHash) router.replace(adminSectionHref(section))
  }, [pathname, router, searchParams, section])

  const navigate = React.useCallback((next: AdminSectionId) => {
    if (next !== section) router.push(adminSectionHref(next))
  }, [router, section])
  const grouped = visibleSections.reduce<Record<string, typeof visibleSections>>((groups, item) => {
    const current = groups[item.group] ?? []
    current.push(item)
    groups[item.group] = current
    return groups
  }, {})

  return (
    <AdminSectionContext.Provider value={{ section, navigate }}>
      <div className="admin-layout">
        <aside className="admin-sidebar" aria-label="Navegación de administración">
          <div className="admin-sidebar__title">Administración</div>
          {Object.entries(grouped).map(([group, items]) => (
            <div className="admin-sidebar__section" key={group}>
              <span className="eyebrow">{group}</span>
              {items.map(({ id, label, icon: Icon }) => (
                <Link href={adminSectionHref(id)} key={id} aria-current={section === id ? 'page' : undefined}>
                  <Icon size={16} /> {label}
                </Link>
              ))}
            </div>
          ))}
          <Link className="admin-sidebar__back" href="/"><ArrowLeft size={16} /> Volver al Hub</Link>
        </aside>
        <nav className="admin-mobile-nav" aria-label="Secciones de administración">
          {visibleSections.map(({ id, label, icon: Icon }) => (
            <Link href={adminSectionHref(id)} key={id} aria-current={section === id ? 'page' : undefined}>
              <Icon size={15} /> {label}
            </Link>
          ))}
        </nav>
        <div className="admin-main">{children}</div>
      </div>
    </AdminSectionContext.Provider>
  )
}
