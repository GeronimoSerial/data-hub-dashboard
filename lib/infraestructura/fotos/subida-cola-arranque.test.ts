// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { abrirAlmacenParte } from '../parte/almacen-indexeddb'
import { confirmarFormulario, guardarClaveEnvioFormulario } from '../parte/borrador-formulario'
import { declararFotosFormulario } from './flujo-formulario'
import { drenarColaFotos, encolarSubidasFotos } from './subida-cola'

vi.mock('../parte/feature-flags-client', () => ({
  fetchReportesOfflineFeatures: vi.fn(async () => ({ fotos: true })),
}))

const DRAFT = 'draft-arranque'
const ATTACHMENT = 'attachment-arranque'

afterEach(async () => {
  vi.unstubAllGlobals()
  const almacen = await abrirAlmacenParte()
  for (const job of await almacen.obtenerTrabajosEnvio()) await almacen.eliminarTrabajoEnvio(job.idempotencyKey)
  almacen.cerrar()
})

describe('photo upload queue start', () => {
  it('drains a photo bound by the evidencia response even after an earlier drain found nothing ready', async () => {
    await encolarSubidasFotos([{
      draftId: DRAFT,
      attachmentId: ATTACHMENT,
      optimizada: new Blob(['optimized'], { type: 'image/jpeg' }),
      miniatura: new Blob(['thumbnail'], { type: 'image/jpeg' }),
    }])
    const confirmaciones: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/evidencia')) return Response.json({ ok: true, movimientoId: 'movimiento-evidencia' }, { status: 200 })
      if (url.endsWith('/confirmacion')) {
        confirmaciones.push(String(JSON.parse(String(init?.body)).movimientoId))
        return Response.json({ estado: 'confirmed' }, { status: 200 })
      }
      return Response.json({}, { status: 500 })
    }))

    // The parte confirmation lands first and starts the queue while the photo is still unbound.
    await guardarClaveEnvioFormulario(DRAFT, 'envio-arranque')
    await confirmarFormulario(DRAFT, 'movimiento-parte')
    await drenarColaFotos()
    expect(confirmaciones).toEqual([])
    await declararFotosFormulario({
      draftId: DRAFT,
      movimientoBaseId: 'movimiento-parte',
      idempotencyKey: 'evidencia-arranque',
      fotos: [{ attachmentId: ATTACHMENT, bytesOptimizado: 9, bytesMiniatura: 9, optimizadaContentType: 'image/jpeg', miniaturaContentType: 'image/jpeg' }],
    })

    await vi.waitFor(() => expect(confirmaciones).toEqual(['movimiento-evidencia']))
  })
})
