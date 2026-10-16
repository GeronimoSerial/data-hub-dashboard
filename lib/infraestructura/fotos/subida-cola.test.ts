import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { abrirAlmacenParte } from '../parte/almacen-indexeddb'
import { confirmarSubidasFotos, encolarSubidasFotos } from './subida-cola'

async function vaciarAlmacen() {
  const almacen = await abrirAlmacenParte()
  for (const job of await almacen.obtenerTrabajosEnvio()) await almacen.eliminarTrabajoEnvio(job.idempotencyKey)
  await almacen.eliminarArchivo('attachment-1:optimizada')
  await almacen.eliminarArchivo('attachment-1:miniatura')
  almacen.cerrar()
}

afterEach(vaciarAlmacen)

describe('durable photo upload queue', () => {
  it('persists variants and waits for the B2 movement confirmation', async () => {
    await encolarSubidasFotos([{
      draftId: 'draft-1',
      attachmentId: 'attachment-1',
      optimizada: new Blob(['optimized'], { type: 'image/jpeg' }),
      miniatura: new Blob(['thumbnail'], { type: 'image/jpeg' }),
    }])

    const reopened = await abrirAlmacenParte()
    let [job] = await reopened.obtenerTrabajosEnvio()
    expect(job).toMatchObject({ tipo: 'foto', estado: 'pendiente', draftId: 'draft-1' })
    expect(job.cuerpo).not.toHaveProperty('movimientoId')
    expect(await reopened.obtenerArchivo('attachment-1:optimizada')).toBeInstanceOf(Blob)
    expect(await reopened.obtenerArchivo('attachment-1:miniatura')).toBeInstanceOf(Blob)

    reopened.cerrar()
    await confirmarSubidasFotos('draft-1', 'movement-1')

    const confirmed = await abrirAlmacenParte()
    ;[job] = await confirmed.obtenerTrabajosEnvio()
    expect(job.cuerpo).toMatchObject({ attachmentId: 'attachment-1', movimientoId: 'movement-1' })
    confirmed.cerrar()
  })

  it('does not replace a durable photo job when enqueued again', async () => {
    const foto = {
      draftId: 'draft-1',
      attachmentId: 'attachment-1',
      optimizada: new Blob(['optimized'], { type: 'image/jpeg' }),
      miniatura: new Blob(['thumbnail'], { type: 'image/jpeg' }),
    }
    await encolarSubidasFotos([foto])
    await encolarSubidasFotos([foto])
    const almacen = await abrirAlmacenParte()
    expect((await almacen.obtenerTrabajosEnvio()).filter((job) => job.tipo === 'foto')).toHaveLength(1)
    almacen.cerrar()
  })
})
