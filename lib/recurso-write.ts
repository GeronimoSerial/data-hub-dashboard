import type { Formato, Recurso } from '@/lib/model'

export function rutaStorageKeyConflict(
  ruta?: string | null,
  storageKey?: string | null,
) {
  return Boolean(ruta?.trim()) && Boolean(storageKey?.trim())
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
    ruta: typeof b.ruta === 'string' ? b.ruta : undefined,
    storageKey: typeof b.storageKey === 'string' ? b.storageKey : undefined,
    mime: typeof b.mime === 'string' ? b.mime : undefined,
    nombreOriginal:
      typeof b.nombreOriginal === 'string' ? b.nombreOriginal : undefined,
    size,
    audienciaNivelIds: asStringArray(b.audienciaNivelIds),
    audienciaUserIds: asStringArray(b.audienciaUserIds),
  }
}
