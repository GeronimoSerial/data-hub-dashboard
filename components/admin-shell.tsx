'use client'

import Link from 'next/link'
import { ArrowLeft, FolderKanban, Tags, Users, Layers3, ListTree } from 'lucide-react'
import type { Role } from '@/lib/acl'

const sections = [
  { label: 'Contenido', items: [{ label: 'Recursos', href: '/admin#recursos', icon: FolderKanban }] },
  { label: 'Organización', items: [
    { label: 'Categorías', href: '/admin#categorias', icon: Tags },
    { label: 'Tags', href: '/admin#tags', icon: ListTree },
    { label: 'Niveles', href: '/admin#niveles', icon: Layers3 },
    { label: 'Tipos', href: '/admin#tipos', icon: ListTree },
  ] },
  { label: 'Accesos', items: [{ label: 'Usuarios', href: '/admin#usuarios', icon: Users }] },
]

export function AdminShell({ children, role }: { children: React.ReactNode; role: Role }) {
  const visibleSections = role === 'admin' ? sections : sections.filter((section) => section.label === 'Contenido')
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
        <Link className="admin-sidebar__back" href="/"><ArrowLeft size={16} /> Volver al Hub</Link>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  )
}
