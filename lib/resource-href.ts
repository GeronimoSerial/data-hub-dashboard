import { isAllowedRuta } from '@/lib/recurso-write'
import { RECURSO_ENOS_MANAOS_ID } from '@/lib/infraestructura/rutas-hub'
import { esRutaExterna } from '@/lib/ruta-externa'

export function resourceCardTarget(recurso: {
  id: string
  storageKey?: string | null
  ruta?: string | null
}): string | null {
  if (recurso.storageKey) return `/recursos/${encodeURIComponent(recurso.id)}`
  const ruta = recurso.ruta?.trim()
  if (!ruta) return null
  // Allowlist por id: sólo la card del despliegue de Manaos admite URL externa.
  if (recurso.id === RECURSO_ENOS_MANAOS_ID && esRutaExterna(ruta)) return ruta
  if (!isAllowedRuta(ruta)) return null
  return ruta
}

export function resourceCardHref(
  target: string | null,
  session: { isPending: boolean; hasUser: boolean },
): string | null {
  if (!target) return null
  if (session.isPending || session.hasUser) return target
  return `/login?callbackUrl=${encodeURIComponent(target)}`
}
