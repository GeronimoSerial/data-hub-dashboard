export type AdminSectionSlug =
  | 'recursos'
  | 'categorias'
  | 'etiquetas'
  | 'niveles'
  | 'tipos'
  | 'motivos'
  | 'direcciones'
  | 'usuarios'
  | 'nominal'

export type AdminSectionMeta = {
  slug: AdminSectionSlug
  label: string
  title: string
  intro: string
  adminOnly: boolean
  group: AdminGroup
}

export type AdminGroup = 'Contenido' | 'Organización' | 'Accesos'

export const ADMIN_SECTIONS: AdminSectionMeta[] = [
  { slug: 'recursos', label: 'Recursos', title: 'Recursos', intro: 'Reportes, tableros y mapas publicados en el Hub.', adminOnly: false, group: 'Contenido' },
  { slug: 'categorias', label: 'Categorías', title: 'Categorías', intro: 'Agrupan los recursos y definen el color de su etiqueta visible.', adminOnly: true, group: 'Organización' },
  { slug: 'etiquetas', label: 'Etiquetas', title: 'Etiquetas', intro: 'Palabras clave para buscar y filtrar recursos.', adminOnly: true, group: 'Organización' },
  { slug: 'niveles', label: 'Niveles', title: 'Niveles', intro: 'Niveles educativos y su orden de presentación.', adminOnly: true, group: 'Organización' },
  { slug: 'tipos', label: 'Tipos', title: 'Tipos', intro: 'Tipos de recurso y los formatos de contenido que admiten.', adminOnly: true, group: 'Organización' },
  { slug: 'motivos', label: 'Motivos', title: 'Motivos', intro: 'Motivos de afectación disponibles en los partes de infraestructura.', adminOnly: true, group: 'Organización' },
  { slug: 'direcciones', label: 'Direcciones (GE)', title: 'Direcciones de Gestión Educativa', intro: 'Catálogo de solo lectura sincronizado desde Gestión Educativa.', adminOnly: true, group: 'Organización' },
  { slug: 'usuarios', label: 'Usuarios', title: 'Usuarios', intro: 'Cuentas, roles, secciones habilitadas y destino inicial.', adminOnly: true, group: 'Accesos' },
  { slug: 'nominal', label: 'Acceso nominal', title: 'Acceso nominal', intro: 'Permisos por establecimiento para la carga de partes.', adminOnly: true, group: 'Accesos' },
]

/** Legacy `/admin#<hash>` anchors mapped to section slugs. */
export const LEGACY_HASHES: Record<string, AdminSectionSlug> = { tags: 'etiquetas' }

export function adminSection(slug: string): AdminSectionMeta | undefined {
  return ADMIN_SECTIONS.find((s) => s.slug === slug)
}

export function adminSectionHref(slug: AdminSectionSlug) {
  return `/admin/${slug}`
}
