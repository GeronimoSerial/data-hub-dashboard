// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import type { EnvioInmutable } from '../reportes-offline-contratos'
import { abrirAlmacenParte, type TrabajoEnvioLocal } from './almacen-indexeddb'
import { crearColaTrabajosEnvio } from './cola-trabajos-envio'

const almacenNuevo = () => abrirAlmacenParte(`cola-${crypto.randomUUID()}`)

function envio(cuerpo: Record<string, unknown> = { respuesta: 'ok' }): EnvioInmutable {
  return {
    version: 1,
    idempotencyKey: 'envio-1',
    draftId: 'borrador-1',
    baseRevision: 2,
    cuerpo,
    cuerpoHash: 'hash-1',
  }
}

describe('submission job queue', () => {
  it('persists a detached immutable submission before it can be claimed', async () => {
    const almacen = await almacenNuevo()
    const cola = crearColaTrabajosEnvio(almacen)
    const datos = { respuesta: 'original' }

    await cola.guardarEnvio(envio(datos))
    datos.respuesta = 'mutated after enqueue'

    expect(await almacen.obtenerTrabajosEnvio()).toMatchObject([
      { idempotencyKey: 'envio-1', tipo: 'reporte_final', cuerpo: { respuesta: 'original' }, estado: 'pendiente' },
    ])
    expect(await cola.reclamarSiguiente()).toMatchObject({
      idempotencyKey: 'envio-1', cuerpo: { respuesta: 'original' }, estado: 'enviando',
    })
    almacen.cerrar()
  })

  it('keeps the first body for an idempotency key and rejects a changed retry', async () => {
    const almacen = await almacenNuevo()
    const cola = crearColaTrabajosEnvio(almacen)
    await cola.guardarEnvio(envio())

    await expect(cola.guardarEnvio(envio({ respuesta: 'different' }))).rejects.toThrow(/immutable/i)
    expect(await almacen.obtenerTrabajosEnvio()).toMatchObject([{ cuerpo: { respuesta: 'ok' } }])
    almacen.cerrar()
  })

  it('does not let concurrent submissions replace the body for the same key', async () => {
    const almacen = await almacenNuevo()
    const cola = crearColaTrabajosEnvio(almacen)
    const resultados = await Promise.allSettled([
      cola.guardarEnvio(envio({ respuesta: 'first' })),
      cola.guardarEnvio(envio({ respuesta: 'second' })),
    ])

    expect(resultados.filter((resultado) => resultado.status === 'fulfilled')).toHaveLength(1)
    expect(resultados.filter((resultado) => resultado.status === 'rejected')).toHaveLength(1)
    expect(await almacen.obtenerTrabajosEnvio()).toHaveLength(1)
    almacen.cerrar()
  })

  it('claims final reports before draft sync and photo work', async () => {
    const almacen = await almacenNuevo()
    const cola = crearColaTrabajosEnvio(almacen)
    await cola.encolar({ tipo: 'foto', idempotencyKey: 'photo', cuerpo: { fileId: 'p1' } })
    await cola.encolar({ tipo: 'sincronizacion_borrador', idempotencyKey: 'draft', cuerpo: { revision: 1 } })
    await cola.guardarEnvio(envio())

    expect((await cola.reclamarSiguiente())?.idempotencyKey).toBe('envio-1')
    expect((await cola.reclamarSiguiente())?.idempotencyKey).toBe('draft')
    expect((await cola.reclamarSiguiente())?.idempotencyKey).toBe('photo')
    almacen.cerrar()
  })

  it('recovers interrupted work and keeps the original key and body', async () => {
    const almacen = await almacenNuevo()
    const cola = crearColaTrabajosEnvio(almacen)
    await cola.guardarEnvio(envio())
    await almacen.guardarTrabajoEnvio({
      ...(await almacen.obtenerTrabajosEnvio())[0],
      estado: 'enviando',
    } as TrabajoEnvioLocal)

    expect(await cola.recuperar()).toMatchObject([
      { idempotencyKey: 'envio-1', cuerpo: { respuesta: 'ok' }, estado: 'pendiente' },
    ])
    almacen.cerrar()
  })

  it('recovers interrupted work as soon as the queue opens', async () => {
    const almacen = await almacenNuevo()
    await almacen.guardarTrabajoEnvio({
      idempotencyKey: 'interrupted-at-open',
      cuerpo: { respuesta: 'ok' },
      cuerpoHash: 'hash',
      estado: 'enviando',
      version: 1,
      tipo: 'reporte_final',
    })

    const cola = crearColaTrabajosEnvio(almacen)
    await cola.lista

    expect(await almacen.obtenerTrabajosEnvio()).toMatchObject([
      { idempotencyKey: 'interrupted-at-open', estado: 'pendiente' },
    ])
    almacen.cerrar()
  })

  it('serializes page queue users through a shared fallback lock', async () => {
    const almacen = await almacenNuevo()
    const primera = crearColaTrabajosEnvio(almacen)
    const segunda = crearColaTrabajosEnvio(almacen)
    const orden: string[] = []
    let liberarPrimera!: () => void
    let inicioPrimera!: () => void
    const bloqueoPrimera = new Promise<void>((resolve) => { liberarPrimera = resolve })
    const primeraIniciada = new Promise<void>((resolve) => { inicioPrimera = resolve })
    const tareaPrimera = primera.conBloqueo(async () => {
      orden.push('first-start')
      inicioPrimera()
      await bloqueoPrimera
      orden.push('first-end')
    })
    await primeraIniciada
    const tareaSegunda = segunda.conBloqueo(async () => { orden.push('second') })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(orden).toEqual(['first-start'])
    liberarPrimera()
    await Promise.all([tareaPrimera, tareaSegunda])
    expect(orden).toEqual(['first-start', 'first-end', 'second'])
    almacen.cerrar()
  })

  it('uses Web Locks when available', async () => {
    const almacen = await almacenNuevo()
    const request = vi.fn(async (_name: string, tarea: () => Promise<string>) => tarea())
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
    const cola = crearColaTrabajosEnvio(almacen)

    await expect(cola.conBloqueo(async () => 'locked')).resolves.toBe('locked')

    expect(request).toHaveBeenCalledWith('parte:submission-final', expect.any(Function))
    Reflect.deleteProperty(navigator, 'locks')
    almacen.cerrar()
  })

  it('persists the movement confirmation before removing the pending job', async () => {
    const almacen = await almacenNuevo()
    const escrituras: string[] = []
    const observado = new Proxy(almacen, {
      get(target, propiedad, receiver) {
        if (propiedad === 'guardarConfirmacion') return async (...args: Parameters<typeof target.guardarConfirmacion>) => {
          await target.guardarConfirmacion(...args)
          escrituras.push('confirmation')
        }
        if (propiedad === 'eliminarTrabajoEnvio') return async (...args: Parameters<typeof target.eliminarTrabajoEnvio>) => {
          expect(await target.obtenerConfirmacion(args[0])).toMatchObject({ movimientoId: 'mov-1' })
          escrituras.push('remove')
          await target.eliminarTrabajoEnvio(...args)
        }
        return Reflect.get(target, propiedad, receiver)
      },
    })
    const cola = crearColaTrabajosEnvio(observado)
    await cola.guardarEnvio(envio())

    await cola.confirmar('envio-1', { movimientoId: 'mov-1', rigeDesde: '2026-10-15', cierreDraft: 'enviado' })

    expect(escrituras).toEqual(['confirmation', 'remove'])
    expect(await almacen.obtenerConfirmacion('envio-1')).toMatchObject({ movimientoId: 'mov-1' })
    expect(await almacen.obtenerTrabajosEnvio()).toEqual([])
    almacen.cerrar()
  })

  it('removes a leftover confirmed job during recovery without claiming it again', async () => {
    const almacen = await almacenNuevo()
    const cola = crearColaTrabajosEnvio(almacen)
    await cola.guardarEnvio(envio())
    await almacen.guardarConfirmacion({
      idempotencyKey: 'envio-1', movimientoId: 'mov-1', rigeDesde: '2026-10-15', cierreDraft: 'enviado', version: 1,
    })

    expect(await cola.recuperar()).toEqual([])
    expect(await cola.reclamarSiguiente()).toBeNull()
    expect(await almacen.obtenerTrabajosEnvio()).toEqual([])
    almacen.cerrar()
  })
})
