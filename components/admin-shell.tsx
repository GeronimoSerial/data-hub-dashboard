'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, Activity, FolderKanban, Tags, Users, Layers3, ListTree, ShieldAlert, Waves, ClipboardCheck, Building2, UserCheck } from 'lucide-react'
import { isStaff, type Role } from '@/lib/acl'
import { adminSection, adminSectionHref, type AdminSectionSlug } from '@/components/admin/sections'
import { canUseLanding, effectiveSections, type SectionPolicy } from '@/lib/hub-sections'

type AdminFlags = {
  riskEngineEnabled: boolean
  episodiosDerivadosEnabled: boolean
}

type AdminLink = { label: string; href: string; icon: typeof FolderKanban }

const EMPTY_FLAGS: AdminFlags = { riskEngineEnabled: false, episodiosDerivadosEnabled: false }

const GROUPS: { label: string; slugs: AdminSectionSlug[] }[] = [
  { label: 'Contenido', slugs: ['recursos'] },
  { label: 'Organización', slugs: ['categorias', 'etiquetas', 'niveles', 'tipos', 'motivos', 'direcciones'] },
  { label: 'Accesos', slugs: ['usuarios', 'nominal'] },
]

const ICONS: Record<AdminSectionSlug, typeof FolderKanban> = {
  recursos: FolderKanban,
  categorias: Tags,
  etiquetas: ListTree,
  niveles: Layers3,
  tipos: ListTree,
  motivos: Tags,
  direcciones: Building2,
  usuarios: Users,
  nominal: UserCheck,
}

function buildSections(role: Role, flags: AdminFlags) {
  const sections = GROUPS.map((group) => ({
    label: group.label,
    items: group.slugs
      .map((slug) => adminSection(slug)!)
      .filter((meta) => role === 'admin' || !meta.adminOnly)
      .map((meta) => ({ label: meta.label, href: adminSectionHref(meta.slug), icon: ICONS[meta.slug] })),
  }))
  const operacion: AdminLink[] = isStaff(role)
    ? [{ label: 'Verificaciones', href: '/admin/verificaciones', icon: ClipboardCheck }]
    : []
  if (isStaff(role) && flags.riskEngineEnabled) operacion.push({ label: 'Motor de riesgo', href: '/admin/riesgo', icon: ShieldAlert })
  if (isStaff(role) && flags.episodiosDerivadosEnabled) operacion.push({ label: 'Episodios derivados', href: '/admin/episodios-derivados', icon: Waves })
  if (role === 'admin') {
    operacion.push({ label: 'Salud', href: '/admin/operacion', icon: Activity })
  }
  sections.push({ label: 'Operación', items: operacion })
  return sections
}

export function AdminShell({ children, role, hubPolicy, flags = EMPTY_FLAGS }: { children: React.ReactNode; role: Role; hubPolicy: SectionPolicy; flags?: AdminFlags }) {
  const visibleSections = buildSections(role, flags).map((section) => ({
    ...section,
    items: section.label === 'Operación' && !effectiveSections(hubPolicy).has('infrastructure')
      ? []
      : section.items,
  })).filter((section) => section.items.length > 0)
  const pathname = usePathname()
  const sidebarRef = React.useRef<HTMLElement>(null)
  // On narrow screens the nav is a horizontal strip; keep the current section in view.
  React.useEffect(() => {
    sidebarRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [pathname])
  const landingAllowed = canUseLanding(hubPolicy)
  return (
    <div className="admin-layout">
      <aside ref={sidebarRef} className="admin-sidebar" aria-label="Navegación de administración">
        <div className="admin-sidebar__title">Administración</div>
        {visibleSections.map((section) => (
          <div className="admin-sidebar__section" key={section.label}>
            <span className="eyebrow">{section.label}</span>
            {section.items.map(({ label, href, icon: Icon }) => (
              <Link href={href} key={href} aria-current={pathname === href || pathname?.startsWith(`${href}/`) ? 'page' : undefined}>
                <Icon size={16} /> {label}
              </Link>
            ))}
          </div>
        ))}
        {landingAllowed ? <Link className="admin-sidebar__back" href="/"><ArrowLeft size={16} /> Volver al Hub</Link> : null}
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  )
}
