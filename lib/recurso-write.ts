import type { Formato, Recurso } from '@/lib/model'
import { isAllowedServedMime } from '@/lib/upload'

export function rutaStorageKeyConflict(
  ruta?: string | null,
  storageKey?: string | null,
) {
  return Boolean(ruta?.trim()) && Boolean(storageKey?.trim())
}

export function deferPublishUntilFile(
  estado: Recurso['estado'],
  storageKey?: string | null,
  hasFile?: boolean,
) {
  return Boolean(hasFile) && estado === 'publicado' && !storageKey?.trim()
}

export function publicadoXorInvalid(
  estado: Recurso['estado'],
  ruta?: string | null,
  storageKey?: string | null,
) {
  if (estado !== 'publicado') return false
  const hasRuta = Boolean(ruta?.trim())
  const hasFile = Boolean(storageKey?.trim())
  return hasRuta === hasFile
}

export function isAllowedRuta(ruta: string) {
  if (!ruta.startsWith('/') || ruta.startsWith('//')) return false
  const path = ruta.split(/[?#]/, 1)[0] || '/'
  if (path.startsWith('/mapas/') && path.length > '/mapas/'.length) return true
  if (path === '/tablero' || path.startsWith('/tablero/')) return true
  if (path.startsWith('/recursos/') && path.length > '/recursos/'.length)
    return true
  if (/^\/mapa_[A-Za-z0-9_]+(\/.*)?$/.test(path)) return true
  return false
}

const FORMATOS: Formato[] = ['reporte', 'tablero', 'mapa']

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function parseRecursoBody(body: unknown): Recurso | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.id !== 'string' || !b.id.trim()) return null
  if (typeof b.titulo !== 'string') return null
  if (typeof b.descripcion !== 'string') return null
  if (typeof b.formato !== 'string' || !FORMATOS.includes(b.formato as Formato))
    return null
  if (typeof b.nivelId !== 'string') return null
  if (typeof b.tipoId !== 'string') return null
  if (typeof b.categoriaId !== 'string') return null
  if (typeof b.area !== 'string') return null
  if (typeof b.actualizado !== 'string') return null
  if (b.estado !== 'publicado' && b.estado !== 'borrador') return null

  const size =
    typeof b.size === 'number' && Number.isFinite(b.size) ? b.size : undefined

  let parsedRuta: string | undefined
  if (typeof b.ruta === 'string') {
    const trimmed = b.ruta.trim()
    if (trimmed) {
      if (!isAllowedRuta(trimmed)) return null
      parsedRuta = trimmed
    }
  }

  let parsedMime: string | undefined
  if (typeof b.mime === 'string') {
    const trimmed = b.mime.trim()
    if (trimmed) {
      if (!isAllowedServedMime(trimmed)) return null
      parsedMime = trimmed
    }
  }

  return {
    id: b.id,
    titulo: b.titulo,
    descripcion: b.descripcion,
    formato: b.formato as Formato,
    nivelId: b.nivelId,
    tipoId: b.tipoId,
    categoriaId: b.categoriaId,
    tagIds: asStringArray(b.tagIds),
    area: b.area,
    actualizado: b.actualizado,
    estado: b.estado,
    ruta: parsedRuta,
    storageKey: typeof b.storageKey === 'string' ? b.storageKey : undefined,
    mime: parsedMime,
    nombreOriginal:
      typeof b.nombreOriginal === 'string' ? b.nombreOriginal : undefined,
    size,
    audienciaNivelIds: asStringArray(b.audienciaNivelIds),
    audienciaUserIds: asStringArray(b.audienciaUserIds),
  }
}
