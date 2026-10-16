import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { abrirAlmacenParte } from '../parte/almacen-indexeddb'
import { confirmarFormulario, guardarClaveEnvioFormulario } from '../parte/borrador-formulario'
import { declararFotosFormulario } from './flujo-formulario'
import { drenarColaFotos, encolarSubidasFotos } from './subida-cola'

vi.mock('../parte/feature-flags-client', () => ({
  fetchReportesOfflineFeatures: vi.fn(async () => ({ fotos: true })),
}))

const DRAFT = 'draft-evidencia'
const ATTACHMENT = 'attachment-evidencia'
const PARTE_MOV = 'movimiento-parte'
const EVIDENCIA_MOV = 'movimiento-evidencia'

async function vaciarAlmacen() {
  const almacen = await abrirAlmacenParte()
  for (const job of await almacen.obtenerTrabajosEnvio()) await almacen.eliminarTrabajoEnvio(job.idempotencyKey)
  await almacen.eliminarArchivo(`${ATTACHMENT}:optimizada`)
  await almacen.eliminarArchivo(`${ATTACHMENT}:miniatura`)
  almacen.cerrar()
}

async function trabajoFoto() {
  const almacen = await abrirAlmacenParte()
  const job = (await almacen.obtenerTrabajosEnvio()).find((item) => item.tipo === 'foto')
  almacen.cerrar()
  return job
}

async function encolarFoto() {
  await encolarSubidasFotos([{
    draftId: DRAFT,
    attachmentId: ATTACHMENT,
    optimizada: new Blob(['optimized'], { type: 'image/jpeg' }),
    miniatura: new Blob(['thumbnail'], { type: 'image/jpeg' }),
  }])
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await vaciarAlmacen()
})

describe('photo jobs bind to the evidencia movement', () => {
  it('keeps the evidencia movement even when the parte confirmation lands first', async () => {
    await encolarFoto()
    await guardarClaveEnvioFormulario(DRAFT, 'envio-evidencia')
    await confirmarFormulario(DRAFT, PARTE_MOV)

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ movimientoId: EVIDENCIA_MOV }, { status: 201 })))
    await declararFotosFormulario({
      draftId: DRAFT,
      movimientoBaseId: PARTE_MOV,
      idempotencyKey: 'evidencia-1',
      fotos: [{
        attachmentId: ATTACHMENT,
        bytesOptimizado: 9,
        bytesMiniatura: 9,
        optimizadaContentType: 'image/jpeg',
        miniaturaContentType: 'image/jpeg',
      }],
    })

    expect((await trabajoFoto())?.cuerpo).toMatchObject({ movimientoId: EVIDENCIA_MOV })
  })

  it('rebinds a job stuck on the wrong movement when confirmation reports the real one', async () => {
    await encolarFoto()
    const almacen = await abrirAlmacenParte()
    const job = (await almacen.obtenerTrabajosEnvio()).find((item) => item.tipo === 'foto')!
    await almacen.guardarTrabajoEnvio({
      ...job,
      estado: 'error',
      cuerpo: { ...(job.cuerpo as object), movimientoId: PARTE_MOV, intentos: 6, reintentarDespues: Date.now() - 1 },
    })
    almacen.cerrar()

    const llamadas: { url: string; movimientoId?: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as { movimientoId?: string } : {}
      llamadas.push({ url, movimientoId: body.movimientoId })
      if (url.endsWith('/confirmacion')) {
        return body.movimientoId === EVIDENCIA_MOV
          ? Response.json({ estado: 'confirmed' }, { status: 200 })
          : Response.json({ code: 'not_found', movimientoId: EVIDENCIA_MOV }, { status: 404 })
      }
      return Response.json({}, { status: 500 })
    }))

    await drenarColaFotos()

    expect(llamadas.filter((call) => call.url.endsWith('/confirmacion')).map((call) => call.movimientoId))
      .toEqual([PARTE_MOV, EVIDENCIA_MOV])
    expect(await trabajoFoto()).toBeUndefined()
  })
})
