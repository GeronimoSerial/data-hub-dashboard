import { abrirAlmacenParte } from '../parte/almacen-indexeddb'
import type { FotoPreparada } from './flujo-formulario'

export interface FotoRestaurada {
  id: string
  nombre: string
  /** Object URL of the local thumbnail; the caller revokes it. */
  vistaPrevia: string
  preparada: FotoPreparada
}

/**
 * Rebuilds the picker entries of photos already prepared on this device. Reads the variants that
 * `encolarSubidasFotos` stored; nothing is processed or uploaded again. Ids whose variants are gone
 * are returned as `faltantes`.
 */
export async function restaurarFotosPreparadas(
  attachmentIds: readonly string[],
): Promise<{ fotos: FotoRestaurada[]; faltantes: string[] }> {
  const almacen = await abrirAlmacenParte()
  try {
    const fotos: FotoRestaurada[] = []
    const faltantes: string[] = []
    for (const [indice, id] of attachmentIds.entries()) {
      const [optimizada, miniatura] = await Promise.all([
        almacen.obtenerArchivo(`${id}:optimizada`),
        almacen.obtenerArchivo(`${id}:miniatura`),
      ])
      if (!optimizada || !miniatura) {
        faltantes.push(id)
        continue
      }
      fotos.push({
        id,
        nombre: `Foto ${indice + 1}`,
        vistaPrevia: URL.createObjectURL(miniatura),
        preparada: {
          attachmentId: id,
          bytesOptimizado: optimizada.size,
          bytesMiniatura: miniatura.size,
          optimizadaContentType: 'image/jpeg',
          miniaturaContentType: 'image/jpeg',
        },
      })
    }
    return { fotos, faltantes }
  } finally {
    almacen.cerrar()
  }
}
