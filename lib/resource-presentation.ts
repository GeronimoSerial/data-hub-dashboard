import type { Recurso } from '@/lib/model'
import { FORMATOS, formatearFecha } from '@/lib/model'
import { resourceCardTarget } from '@/lib/resource-href'

export type ResourceAccessState = 'public' | 'sign-in' | 'restricted'

export type ResourceAccessAuth = {
  isPending?: boolean
  hasUser: boolean
}

export const RESOURCE_ACCESS_LABEL: Record<ResourceAccessState, string> = {
  public: 'Público',
  'sign-in': 'Ingresar para consultar',
  restricted: 'Acceso restringido',
}

export type ResourcePresentation = {
  title: string
  description: string
  formatLabel: string
  topicLabel: string
  levelLabel: string
  typeLabel: string
  updatedLabel: string
  accessState: ResourceAccessState
  accessLabel: string
  primaryAction: string
  target: string | null
  breadcrumbs: { label: string; href?: string }[]
}

/**
 * Access states mirror the batch spec wording. "Publicado" resources that can
 * be opened by any signed-in user are "Público" once authenticated; while the
 * session is still resolving they are "Ingresar para consultar"; an explicit
 * audience makes the resource "Acceso restringido". The server keeps the real
 * ACL decision; this only informs the UI before the click.
 */
export function resourceAccessState(
  recurso: Pick<Recurso, 'audienciaNivelIds' | 'audienciaUserIds'>,
  auth: ResourceAccessAuth = { hasUser: false },
): ResourceAccessState {
  const audienceLocked =
    Boolean(recurso.audienciaNivelIds?.length) ||
    Boolean(recurso.audienciaUserIds?.length)
  if (audienceLocked) return 'restricted'
  return auth.isPending ? 'sign-in' : auth.hasUser ? 'public' : 'sign-in'
}

export function resourcePrimaryAction(recurso: Pick<Recurso, 'formato' | 'storageKey' | 'ruta'>) {
  if (recurso.formato === 'mapa') return 'Abrir mapa'
  if (recurso.formato === 'tablero') return 'Abrir tablero'
  return recurso.storageKey ? 'Ver reporte' : 'Abrir recurso'
}

export function presentResource(
  recurso: Recurso,
  taxonomies: { categorias: { id: string; nombre: string }[]; niveles: { id: string; nombre: string }[]; tipos: { id: string; nombre: string }[] },
  auth: ResourceAccessAuth = { hasUser: false },
): ResourcePresentation {
  const topic = taxonomies.categorias.find((item) => item.id === recurso.categoriaId)
  const formatLabel = FORMATOS[recurso.formato].label
  const accessState = resourceAccessState(recurso, auth)
  return {
    title: recurso.titulo,
    description: recurso.descripcion,
    formatLabel,
    topicLabel: topic?.nombre ?? 'Sin tema',
    levelLabel: taxonomies.niveles.find((item) => item.id === recurso.nivelId)?.nombre ?? '—',
    typeLabel: taxonomies.tipos.find((item) => item.id === recurso.tipoId)?.nombre ?? '—',
    updatedLabel: formatearFecha(recurso.actualizado),
    accessState,
    accessLabel: RESOURCE_ACCESS_LABEL[accessState],
    primaryAction: resourcePrimaryAction(recurso),
    target: resourceCardTarget(recurso),
    breadcrumbs: [
      { label: 'Explorar', href: '/explorar' },
      { label: topic?.nombre ?? 'Recursos', href: `/explorar?tema=${encodeURIComponent(recurso.categoriaId)}` },
      { label: recurso.titulo },
    ],
  }
}

export function relatedResources(current: Recurso, resources: Recurso[], limit = 3) {
  const currentTags = new Set(current.tagIds)
  return resources
    .filter((item) => item.id !== current.id && item.estado === 'publicado')
    .map((item) => {
      const sameCategory = item.categoriaId === current.categoriaId ? 4 : 0
      const sharedTags = item.tagIds.filter((tag) => currentTags.has(tag)).length
      const sameLevel = item.nivelId === current.nivelId ? 2 : 0
      return { item, score: sameCategory + sharedTags + sameLevel }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.item.actualizado.localeCompare(a.item.actualizado) || a.item.id.localeCompare(b.item.id))
    .slice(0, limit)
    .map(({ item }) => item)
}