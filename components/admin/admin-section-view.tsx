'use client'

import { NominalPermisosAdmin } from '@/components/infraestructura/nominal-permisos-admin'
import { AdminSection, TAXONOMY_NOTE } from '@/components/admin/admin-section'
import { DireccionesGeCatalogo } from '@/components/admin/direcciones'
import { MotivosAdmin } from '@/components/admin/motivos'
import { RecursosAdmin } from '@/components/admin/recursos'
import { CategoriasAdmin, EtiquetasAdmin, NivelesAdmin, TiposAdmin } from '@/components/admin/taxonomias'
import { UsersAdmin } from '@/components/admin/usuarios'
import { adminSection, type AdminSectionSlug } from '@/components/admin/sections'

const VIEWS: Record<AdminSectionSlug, () => React.ReactNode> = {
  recursos: RecursosAdmin,
  categorias: CategoriasAdmin,
  etiquetas: EtiquetasAdmin,
  niveles: NivelesAdmin,
  tipos: TiposAdmin,
  motivos: MotivosAdmin,
  direcciones: DireccionesGeCatalogo,
  usuarios: UsersAdmin,
  nominal: NominalPermisosAdmin,
}

const TAXONOMIES = new Set<AdminSectionSlug>(['categorias', 'etiquetas', 'niveles', 'tipos'])

export function AdminSectionView({ slug }: { slug: AdminSectionSlug }) {
  const meta = adminSection(slug)!
  const View = VIEWS[slug]
  return (
    <AdminSection title={meta.title} group={meta.group} intro={meta.intro} note={TAXONOMIES.has(slug) ? TAXONOMY_NOTE : undefined}>
      <View />
    </AdminSection>
  )
}
