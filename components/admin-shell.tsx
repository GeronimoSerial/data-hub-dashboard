'use client'

import Link from 'next/link'
import { ArrowLeft, Activity, FolderKanban, Tags, Users, Layers3, ListTree, ShieldAlert, Waves, ClipboardCheck } from 'lucide-react'
import { isStaff, type Role } from '@/lib/acl'
import { canUseLanding, effectiveSections, type SectionPolicy } from '@/lib/hub-sections'

type AdminFlags = {
  riskEngineEnabled: boolean
  episodiosDerivadosEnabled: boolean
}

type AdminLink = { label: string; href: string; icon: typeof FolderKanban }

const EMPTY_FLAGS: AdminFlags = { riskEngineEnabled: false, episodiosDerivadosEnabled: false }

function buildSections(role: Role, flags: AdminFlags) {
  const sections: { label: string; items: AdminLink[] }[] = [
    { label: 'Contenido', items: [{ label: 'Recursos', href: '/admin#recursos', icon: FolderKanban }] },
    { label: 'Organización', items: [
      { label: 'Categorías', href: '/admin#categorias', icon: Tags },
      { label: 'Etiquetas', href: '/admin#tags', icon: ListTree },
      { label: 'Niveles', href: '/admin#niveles', icon: Layers3 },
      { label: 'Tipos', href: '/admin#tipos', icon: ListTree },
      ...(role === 'admin' ? [{ label: 'Motivos', href: '/admin#motivos', icon: Tags }] : []),
    ] },
    { label: 'Accesos', items: [
      { label: 'Usuarios', href: '/admin#usuarios', icon: Users },
      ...(role === 'admin' ? [{ label: 'Acceso nominal', href: '/admin#nominal', icon: Users }] : []),
    ] },
  ]
  const operacion: AdminLink[] = isStaff(role)
    ? [{ label: 'Verificaciones', href: '/admin/verificaciones', icon: ClipboardCheck }]
    : []
  if (flags.riskEngineEnabled) operacion.push({ label: 'Motor de riesgo', href: '/admin/riesgo', icon: ShieldAlert })
  if (flags.episodiosDerivadosEnabled) operacion.push({ label: 'Episodios derivados', href: '/admin/episodios-derivados', icon: Waves })
  if (role === 'admin') {
    operacion.push({ label: 'Salud', href: '/admin/operacion', icon: Activity })
  }
  sections.push({ label: 'Operación', items: operacion })
  return role === 'admin' ? sections : sections.filter((section) => section.label === 'Contenido' || (isStaff(role) && section.label === 'Operación'))
}

export function AdminShell({ children, role, hubPolicy, flags = EMPTY_FLAGS }: { children: React.ReactNode; role: Role; hubPolicy: SectionPolicy; flags?: AdminFlags }) {
  const visibleSections = buildSections(role, flags).map((section) => ({
    ...section,
    items: section.label === 'Operación' && !effectiveSections(hubPolicy).has('infrastructure')
      ? []
      : section.items,
  })).filter((section) => section.items.length > 0)
  const landingAllowed = canUseLanding(hubPolicy)
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="Navegación de administración">
        <div className="admin-sidebar__title">Administración</div>
        {visibleSections.map((section) => (
          <div className="admin-sidebar__section" key={section.label}>
            <span className="eyebrow">{section.label}</span>
            {section.items.map(({ label, href, icon: Icon }) => <Link href={href} key={href}><Icon size={16} /> {label}</Link>)}
          </div>
        ))}
        {landingAllowed ? <Link className="admin-sidebar__back" href="/"><ArrowLeft size={16} /> Volver al Hub</Link> : null}
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  )
}
