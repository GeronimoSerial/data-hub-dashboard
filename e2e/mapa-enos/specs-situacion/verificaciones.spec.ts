import { cuentaPorClave } from '../cuentas-qa'
import { expect, test } from '../contratos/base'
import { ESCUELAS } from '../seed/escuelas'
import { limpiarVerificacion, sembrarVerificacionPendiente, vencerEnlace } from '../seed/escenarios-verificaciones'

// I10: el estado de cada verificación en la cola de /admin/verificaciones tiene que decir si el enlace
// venció, y la respuesta asistida no puede guardarse sin observación. Cada escenario usa su propia
// escuela y limpia su fila en afterEach (cancelación por la app, o borrado si ya fue respondida).
test.use({ storageState: cuentaPorClave('admin').storageStatePath })

test.describe('Verificaciones: enlace vencido y respuesta asistida', () => {
  const creadas: string[] = []

  test.afterEach(async () => {
    for (const id of creadas.splice(0)) await limpiarVerificacion(id)
  })

  test('pendiente con enlace vencido: la cola muestra "Enlace vencido" en su fila', async ({ page }) => {
    const cue = ESCUELAS[1].cueAnexo
    const id = await sembrarVerificacionPendiente(cue)
    creadas.push(id)
    await vencerEnlace(id)

    await page.goto('/admin/verificaciones')

    const fila = page.getByRole('row').filter({ hasText: cue })
    await expect(fila).toContainText('Enlace vencido')
  })

  test('pendiente con enlace vigente: la cola muestra "Pendiente" y no "Enlace vencido"', async ({ page }) => {
    const cue = ESCUELAS[2].cueAnexo
    const id = await sembrarVerificacionPendiente(cue)
    creadas.push(id)

    await page.goto('/admin/verificaciones')

    const fila = page.getByRole('row').filter({ hasText: cue })
    await expect(fila).toContainText('Pendiente')
    await expect(fila).not.toContainText('Enlace vencido')
  })

  test('responder-asistida sin campo observacion: HTTP 400 con "La observación es obligatoria"', async ({ apiAdmin }) => {
    const cue = ESCUELAS[3].cueAnexo
    const id = await sembrarVerificacionPendiente(cue)
    creadas.push(id)

    const respuesta = await apiAdmin.post(`/api/infraestructura/verificaciones/${id}/responder-asistida`, {
      data: { canal: 'telefono', resultado: 'sin_afectacion' },
    })

    expect(respuesta.status()).toBe(400)
    expect(await respuesta.json()).toEqual({ error: 'La observación es obligatoria' })
  })

  test('responder-asistida con observacion en blanco: HTTP 400 con "La observación es obligatoria"', async ({ apiAdmin }) => {
    const cue = ESCUELAS[4].cueAnexo
    const id = await sembrarVerificacionPendiente(cue)
    creadas.push(id)

    const respuesta = await apiAdmin.post(`/api/infraestructura/verificaciones/${id}/responder-asistida`, {
      data: { canal: 'telefono', resultado: 'sin_afectacion', observacion: '   ' },
    })

    expect(respuesta.status()).toBe(400)
    expect(await respuesta.json()).toEqual({ error: 'La observación es obligatoria' })
  })

  test('responder-asistida con observacion: HTTP 200 y la observación queda guardada', async ({ apiAdmin }) => {
    const cue = ESCUELAS[5].cueAnexo
    const observacion = 'Confirmó por teléfono que no hay afectación'
    const id = await sembrarVerificacionPendiente(cue)
    creadas.push(id)

    const respuesta = await apiAdmin.post(`/api/infraestructura/verificaciones/${id}/responder-asistida`, {
      data: { canal: 'telefono', resultado: 'sin_afectacion', observacion },
    })
    expect(respuesta.status()).toBe(200)

    const listado = await apiAdmin.get(`/api/infraestructura/verificaciones?cueAnexo=${encodeURIComponent(cue)}`)
    expect(listado.status()).toBe(200)
    const cuerpo = (await listado.json()) as { verificaciones: Array<{ id: string; estado: string; observacion: string | null }> }
    const fila = cuerpo.verificaciones.find((v) => v.id === id)
    expect(fila?.estado).toBe('respondida')
    expect(fila?.observacion).toBe(observacion)
  })
})
