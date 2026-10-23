import { isStaff, marcarAcceso, type SessionUser } from '@/lib/acl'
import { loadHubCatalog } from '@/lib/db/hub'
import { effectiveSections, resourceInSections } from '@/lib/hub-sections'

/** Remove disabled-section resources and taxonomies before any server payload is built. */
export function filterCatalogForSections(
  catalog: Awaited<ReturnType<typeof loadHubCatalog>>,
  user: SessionUser | null,
): Awaited<ReturnType<typeof loadHubCatalog>> {
  const enabled = effectiveSections(user?.hubPolicy ?? {})
  const recursos = catalog.recursos.filter((resource) => resourceInSections(resource, enabled))
  const ids = {
    niveles: new Set(recursos.map((resource) => resource.nivelId)),
    tipos: new Set(recursos.map((resource) => resource.tipoId)),
    categorias: new Set(recursos.map((resource) => resource.categoriaId)),
    tags: new Set(recursos.flatMap((resource) => resource.tagIds)),
  }
  return {
    ...catalog,
    recursos,
    niveles: catalog.niveles.filter((item) => ids.niveles.has(item.id)),
    tipos: catalog.tipos.filter((item) => ids.tipos.has(item.id)),
    categorias: catalog.categorias.filter((item) => ids.categorias.has(item.id)),
    tags: catalog.tags.filter((item) => ids.tags.has(item.id)),
  }
}

/** Catálogo + `acceso` calculado, compartido entre /api/hub, /api/hub/admin
 *  y el render inicial del layout del hub, para que los tres coincidan. */
export async function buildCatalogResponse(
  user: SessionUser | null,
  opts: { publishedOnly: boolean },
) {
  const catalog = filterCatalogForSections(await loadHubCatalog(opts), user)
  return {
    ...catalog,
    recursos: marcarAcceso(user, catalog.recursos),
  }
}

/** Catálogo inicial para SSR: espeja qué endpoint pegaría el cliente según
 *  el rol (`catalogPathForRole` en components/hub-data.tsx: staff ->
 *  /api/hub/admin con publishedOnly:false, resto -> /api/hub). */
export async function loadCatalogFor(user: SessionUser | null) {
  return buildCatalogResponse(user, { publishedOnly: !isStaff(user?.role) })
}
