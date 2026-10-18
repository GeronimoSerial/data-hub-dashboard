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

/** The school has no report yet, so there is no movement to attach photos to. */
export class SinParteError extends Error {
  constructor() {
    super('La escuela todavía no tiene un parte al que asociar fotos.')
    this.name = 'SinParteError'
  }
}

export async function declararFotosFormulario({
  draftId,
  movimientoBaseId,
  cue,
  idempotencyKey,
  fotos,
}: {
  draftId: string
  /** Movement to document; without it the server resolves the latest one for `cue`. */
  movimientoBaseId?: string
  cue?: string
  idempotencyKey: string
  fotos: readonly FotoPreparada[]
}): Promise<void> {
  if (fotos.length === 0) return
  const response = await fetch('/api/problematicas/parte/evidencia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      movimientoBaseId,
      cue,
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
  if (response.status === 404) {
    const cuerpo = (await response.json().catch(() => null)) as { code?: string } | null
    if (cuerpo?.code === 'sin_parte') throw new SinParteError()
  }
  if (!response.ok) throw new Error('No se pudieron asociar las fotos; se conservaron en este dispositivo.')
  const result = await response.json() as { movimientoId?: string }
  if (!result.movimientoId) throw new Error('El servidor no confirmó la evidencia fotográfica.')
  await confirmarSubidasFotos(draftId, result.movimientoId, fotos.map((foto) => foto.attachmentId))
}
