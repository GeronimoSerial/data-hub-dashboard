export function resourceCardTarget(recurso: {
  id: string
  storageKey?: string | null
  ruta?: string | null
}): string | null {
  if (recurso.storageKey) return `/recursos/${recurso.id}`
  const ruta = recurso.ruta?.trim()
  return ruta || null
}

export function resourceCardHref(
  target: string | null,
  session: { isPending: boolean; hasUser: boolean },
): string | null {
  if (!target) return null
  if (session.isPending || session.hasUser) return target
  return `/login?callbackUrl=${encodeURIComponent(target)}`
}
