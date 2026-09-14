import type { Recurso } from '@/lib/model'
import { archivoSrc } from '@/lib/recurso-viewer'
import { isAllowedRuta } from '@/lib/recurso-write'
import { isTableroSeed } from '@/lib/resource-pilot'

export type ResourceContent =
  | { kind: 'stored'; src: string }
  | { kind: 'legacy-pilot'; src: string; fallbackHref: string }
  | { kind: 'react-route'; href: string }
  | { kind: 'legacy-route'; href: string }
  | { kind: 'missing' }

/**
 * Describes how a resource is presented without deciding whether it is
 * authorized. The server-side resource/file gates remain the only ACL.
 *
 * r2 is the seed copy of public/tablero/index.html. Its bytes are served by
 * the existing authenticated file route, while /tablero remains the direct
 * historical fallback URL.
 */
export function resourceContent(recurso: Pick<Recurso, 'id' | 'storageKey' | 'ruta' | 'mime'>): ResourceContent {
  const ruta = recurso.ruta?.trim()
  if (isTableroSeed(recurso.id, recurso.storageKey, recurso.mime)) {
    return { kind: 'legacy-pilot', src: archivoSrc(recurso.id), fallbackHref: '/tablero' }
  }
  if (recurso.storageKey?.trim()) return { kind: 'stored', src: archivoSrc(recurso.id) }
  if (!ruta || !isAllowedRuta(ruta)) return { kind: 'missing' }
  if (ruta.startsWith('/mapas/')) return { kind: 'react-route', href: ruta }
  return { kind: 'legacy-route', href: ruta }
}
