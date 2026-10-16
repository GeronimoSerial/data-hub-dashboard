import { procesarFotoPersistida } from './pipeline'
import { encolarSubidasFotos, confirmarSubidasFotos, type NuevaSubidaFoto } from './subida-cola'

export type FotoElegida = { attachmentId: string; original: Blob }
export type FotoPreparada = {
  attachmentId: string
  bytesOptimizado: number
  bytesMiniatura: number
  optimizadaContentType: 'image/jpeg'
  miniaturaContentType: 'image/jpeg'
}

export async function prepararFotosFormulario(
  draftId: string,
  fotos: readonly FotoElegida[],
): Promise<{ preparadas: FotoPreparada[]; errores: string[] }> {
  const preparadas: FotoPreparada[] = []
  const errores: string[] = []
  for (const foto of fotos) {
    try {
      const resultado = await procesarFotoPersistida(foto.attachmentId, foto.original)
      const subida: NuevaSubidaFoto = {
        draftId,
        attachmentId: foto.attachmentId,
        optimizada: resultado.optimized,
        miniatura: resultado.thumbnail,
      }
      await encolarSubidasFotos([subida])
      preparadas.push({
        attachmentId: foto.attachmentId,
        bytesOptimizado: resultado.optimized.size,
        bytesMiniatura: resultado.thumbnail.size,
        optimizadaContentType: resultado.mime,
        miniaturaContentType: resultado.mime,
      })
    } catch (error) {
      errores.push(error instanceof Error ? error.message : 'No se pudo preparar una foto.')
    }
  }
  return { preparadas, errores }
}

export async function declararFotosFormulario({
  draftId,
  movimientoBaseId,
  idempotencyKey,
  fotos,
}: {
  draftId: string
  movimientoBaseId: string
  idempotencyKey: string
  fotos: readonly FotoPreparada[]
}): Promise<void> {
  if (fotos.length === 0) return
  const response = await fetch('/api/problematicas/parte/evidencia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      movimientoBaseId,
      idempotencyKey,
      fotos: fotos.map((foto) => ({
        attachmentId: foto.attachmentId,
        optimizadaSize: foto.bytesOptimizado,
        optimizadaContentType: foto.optimizadaContentType,
        miniaturaSize: foto.bytesMiniatura,
        miniaturaContentType: foto.miniaturaContentType,
      })),
    }),
  })
  if (!response.ok) throw new Error('No se pudieron asociar las fotos; se conservaron en este dispositivo.')
  const result = await response.json() as { movimientoId?: string }
  if (!result.movimientoId) throw new Error('El servidor no confirmó la evidencia fotográfica.')
  await confirmarSubidasFotos(draftId, result.movimientoId)
}
