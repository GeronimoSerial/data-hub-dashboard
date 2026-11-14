'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ChevronDown, Activity, FolderKanban, Tags, Users, Layers3, ListTree, ShieldAlert, Waves, ClipboardCheck, Building2, UserCheck } from 'lucide-react'
import { isStaff, type Role } from '@/lib/acl'
import { adminSection, adminSectionHref, type AdminSectionSlug } from '@/components/admin/sections'
import { canUseLanding, effectiveSections, type SectionPolicy } from '@/lib/hub-sections'
import { useTextos } from '@/lib/i18n/idioma-provider'

type AdminFlags = {
  riskEngineEnabled: boolean
  episodiosDerivadosEnabled: boolean
}

// `prefetch: false` keeps the audit viewer out of the automatic prefetch; other links keep Next's default.
type AdminLink = { label: string; href: string; icon: typeof FolderKanban; prefetch?: false }

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

function buildSections(role: Role, flags: AdminFlags, etiquetaAuditoria: string) {
  const sections = GROUPS.map((group) => ({
    label: group.label,
    items: group.slugs
      .map((slug) => adminSection(slug)!)
      .filter((meta) => role === 'admin' || !meta.adminOnly)
      .map((meta): AdminLink => ({ label: meta.label, href: adminSectionHref(meta.slug), icon: ICONS[meta.slug] })),
  }))
  const operacion: AdminLink[] = isStaff(role)
    ? [{ label: 'Verificaciones', href: '/admin/verificaciones', icon: ClipboardCheck }]
    : []
  if (isStaff(role) && flags.riskEngineEnabled) operacion.push({ label: 'Motor de riesgo', href: '/admin/riesgo', icon: ShieldAlert })
  if (isStaff(role) && flags.episodiosDerivadosEnabled) operacion.push({ label: 'Episodios derivados', href: '/admin/episodios-derivados', icon: Waves })
  if (role === 'admin') {
    operacion.push({ label: 'Salud', href: '/admin/operacion', icon: Activity })
    operacion.push({ label: etiquetaAuditoria, href: '/admin/auditoria', icon: ListTree, prefetch: false })
  }
  sections.push({ label: 'Operación', items: operacion })
  return sections
}

export function AdminShell({ children, role, hubPolicy, flags = EMPTY_FLAGS }: { children: React.ReactNode; role: Role; hubPolicy: SectionPolicy; flags?: AdminFlags }) {
  const t = useTextos()
  const visibleSections = buildSections(role, flags, t.auditoria.navegacion).map((section) => ({
    ...section,
    items: section.label === 'Operación' && !effectiveSections(hubPolicy).has('infrastructure')
      ? []
      : section.items,
  })).filter((section) => section.items.length > 0)
  const pathname = usePathname()
  // The menu remembers the path it was opened on, so navigating closes it.
  const [menuOpenAt, setMenuOpenAt] = React.useState<string | null>(null)
  const menuOpen = menuOpenAt !== null && menuOpenAt === pathname
  const isCurrent = (href: string) => pathname === href || Boolean(pathname?.startsWith(`${href}/`))
  const current = visibleSections.flatMap((section) => section.items).find((item) => isCurrent(item.href))
  React.useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpenAt(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])
  const landingAllowed = canUseLanding(hubPolicy)
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar" data-open={menuOpen || undefined} aria-label="Navegación de administración">
        <div className="admin-sidebar__head">
          <span className="admin-sidebar__title">Administración</span>
          <button
            type="button"
            className="admin-sidebar__toggle"
            aria-expanded={menuOpen}
            aria-controls="admin-sidebar-nav"
            onClick={() => setMenuOpenAt(menuOpen ? null : pathname)}
          >
            <span>{current?.label ?? 'Secciones'}</span>
            <ChevronDown size={16} aria-hidden />
          </button>
        </div>
        <nav id="admin-sidebar-nav" className="admin-sidebar__nav">
          {visibleSections.map((section) => (
            <div className="admin-sidebar__section" key={section.label}>
              <span className="admin-sidebar__group">{section.label}</span>
              {section.items.map(({ label, href, icon: Icon, prefetch }) => (
                <Link href={href} key={href} prefetch={prefetch} aria-current={isCurrent(href) ? 'page' : undefined}>
                  <Icon size={16} aria-hidden /> {label}
                </Link>
              ))}
            </div>
          ))}
          {landingAllowed ? <Link className="admin-sidebar__back" href="/"><ArrowLeft size={16} aria-hidden /> Volver al Hub</Link> : null}
        </nav>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  )
}
