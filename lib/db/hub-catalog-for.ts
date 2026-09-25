import { isStaff, marcarAcceso, type SessionUser } from '@/lib/acl'
import { loadHubCatalog } from '@/lib/db/hub'

/** Catálogo + `acceso` calculado, compartido entre /api/hub, /api/hub/admin
 *  y el render inicial del layout del hub, para que los tres coincidan. */
export async function buildCatalogResponse(
  user: SessionUser | null,
  opts: { publishedOnly: boolean },
) {
  const catalog = await loadHubCatalog(opts)
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
