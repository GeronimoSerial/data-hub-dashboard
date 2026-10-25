import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { abrirAlmacenParte } from '../parte/almacen-indexeddb'
import { declararFotosFormulario } from './flujo-formulario'
import { encolarSubidasFotos, drenarColaFotos } from './subida-cola'
import { obtenerOperacionFotos } from './operaciones'

vi.mock('../parte/feature-flags-client', () => ({ fetchReportesOfflineFeatures: async () => ({ fotos: true }) }))
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()) })
afterEach(() => { vi.unstubAllGlobals() })

async function preparar(draftId: string, attachmentId = 'foto-1', bytes = 'optimized') {
  await encolarSubidasFotos([{ draftId, attachmentId,
    optimizada: new Blob([bytes], { type: 'image/jpeg' }),
    miniatura: new Blob(['thumbnail'], { type: 'image/jpeg' }),
  }])
  return { attachmentId, bytesOptimizado: bytes.length, bytesMiniatura: 9,
    optimizadaContentType: 'image/jpeg' as const, miniaturaContentType: 'image/jpeg' as const }
}

it('persists declaration identity and real hashes before POST and replays a lost response', async () => {
  const foto = await preparar('lost-response')
  const bodies: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const almacen = await abrirAlmacenParte()
    const operation = await almacen.obtenerContexto<{ idempotencyKey: string; fotos: unknown[] }>('fotos-operacion:lost-response')
    almacen.cerrar()
    expect(operation?.idempotencyKey).toBe('key-original')
    bodies.push(JSON.parse(String(init.body)))
    if (bodies.length === 1) throw new Error('Lost response')
    return Response.json({ movimientoId: 'evidence', documentaMovimientoId: 'base', attachmentIds: ['foto-1'] })
  }))
  const input = { draftId: 'lost-response', movimientoBaseId: 'base', idempotencyKey: 'key-original', fotos: [foto] }
  await expect(declararFotosFormulario(input)).rejects.toThrow()
  await declararFotosFormulario({ ...input, idempotencyKey: 'new-mount-key' })
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).toEqual(bodies[0])
  expect(bodies[0]).toMatchObject({ fotos: [{ optimizadaSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }] })
})

it('does not redeclare an already accepted batch after remount', async () => {
  const foto = await preparar('accepted')
  const fetchMock = vi.fn(async () => Response.json({ movimientoId: 'evidence', attachmentIds: ['foto-1'] }))
  vi.stubGlobal('fetch', fetchMock)
  const input = { draftId: 'accepted', movimientoBaseId: 'base', idempotencyKey: 'first-key', fotos: [foto] }
  await declararFotosFormulario(input)
  await declararFotosFormulario({ ...input, idempotencyKey: 'remount-key' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('rejects changed bytes of the same size under an existing attachment identity', async () => {
  await preparar('same-size')
  await expect(preparar('same-size', 'foto-1', 'different')).rejects.toThrow(/different photo data/)
})

it('maps a content-deduplicated response to the existing server attachment', async () => {
  const foto = await preparar('remap')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ movimientoId: 'existing', attachmentIds: ['existing-photo'] })))
  await declararFotosFormulario({ draftId: 'remap', movimientoBaseId: 'base', idempotencyKey: 'dedup', fotos: [foto] })
  const almacen = await abrirAlmacenParte()
  const jobs = await almacen.obtenerTrabajosEnvio()
  expect(jobs).toHaveLength(1)
  expect(jobs[0].cuerpo).toMatchObject({ attachmentId: 'existing-photo', movimientoId: 'existing' })
  expect(await almacen.obtenerArchivo('existing-photo:optimizada')).toBeInstanceOf(Blob)
  almacen.cerrar()
})

it('recovers an unlinked declaration after reload and confirms only when uploads finish', async () => {
  const foto = await preparar('reload')
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
  await expect(declararFotosFormulario({ draftId: 'reload', movimientoBaseId: 'base', idempotencyKey: 'persisted', fotos: [foto] })).rejects.toThrow()
  const almacen = await abrirAlmacenParte()
  const saved = await obtenerOperacionFotos('reload')
  await almacen.guardarContexto({ ...saved!, reintentarDespues: 0 })
  almacen.cerrar()
  const bodies: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)))
    return url.endsWith('/evidencia')
      ? Response.json({ movimientoId: 'recovered', attachmentIds: ['foto-1'] })
      : Response.json({ estado: 'confirmed' })
  }))
  await drenarColaFotos()
  expect(bodies[0]).toMatchObject({ idempotencyKey: 'persisted' })
  expect(await obtenerOperacionFotos('reload')).toMatchObject({ estado: 'confirmada', movimientoId: 'recovered' })
  const reopened = await abrirAlmacenParte()
  expect(await reopened.obtenerTrabajosEnvio()).toHaveLength(0)
  reopened.cerrar()
})

it('reuses identical content selected with fresh UUIDs and removes unused local jobs', async () => {
  const foto = await preparar('fresh-uuids')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ movimientoId: 'existing', attachmentIds: ['foto-1'] })))
  const input = { draftId: 'fresh-uuids', movimientoBaseId: 'base', idempotencyKey: 'original', fotos: [foto] }
  await declararFotosFormulario(input)
  const nueva = await preparar('fresh-uuids', 'new-id')
  await declararFotosFormulario({ ...input, idempotencyKey: 'new-key', fotos: [nueva] })
  const almacen = await abrirAlmacenParte()
  expect((await almacen.obtenerTrabajosEnvio()).map((job) => job.idempotencyKey)).toEqual(['foto:foto-1'])
  expect(await almacen.obtenerArchivo('new-id:optimizada')).toBeNull()
  almacen.cerrar()
})

it('keeps the first durable identity across simultaneous submit attempts', async () => {
  const foto = await preparar('double-click')
  const keys: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    keys.push(JSON.parse(String(init.body)).idempotencyKey)
    return Response.json({ movimientoId: 'once', attachmentIds: ['foto-1'] })
  }))
  const input = { draftId: 'double-click', movimientoBaseId: 'base', idempotencyKey: 'first', fotos: [foto] }
  await Promise.all([declararFotosFormulario(input), declararFotosFormulario({ ...input, idempotencyKey: 'second' })])
  expect(keys).toEqual(['first'])
})

it('recovers a durable mapping whose queue linkage was interrupted by reload', async () => {
  const foto = await preparar('crash-before-link')
  const almacen = await abrirAlmacenParte()
  await almacen.guardarContexto({
    draftId: 'fotos-operacion:crash-before-link', origenDraftId: 'crash-before-link',
    movimientoBaseId: 'base', idempotencyKey: 'first', fotos: [foto], creadaEn: Date.now(),
    estado: 'subiendo', movimientoId: 'evidence', attachmentIds: [foto.attachmentId], vinculada: true,
  })
  almacen.cerrar()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ estado: 'confirmed' })))
  await drenarColaFotos()
  const reopened = await abrirAlmacenParte()
  expect(await reopened.obtenerTrabajosEnvio()).toHaveLength(0)
  expect(await obtenerOperacionFotos('crash-before-link')).toMatchObject({ estado: 'confirmada' })
  reopened.cerrar()
})
