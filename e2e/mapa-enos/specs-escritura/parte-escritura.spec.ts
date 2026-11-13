import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { APIRequestContext, Page, Response } from '@playwright/test'
import { expect, test } from '../contratos/base'
import { cuentaPorClave, type ClaveCuentaQa } from '../cuentas-qa'
import { CUE_ANEXO_OPERADOR } from '../seed/esperados'

// Raíz del repositorio: este archivo vive en <raiz>/e2e/mapa-enos/specs-escritura.
const RAIZ = path.resolve(__dirname, '..', '..', '..')

// Plan 5.6: el operador de la escuela actualiza el parte desde el recorrido de actualización.
// Este proyecto corre después de todas las pruebas de lectura (dependencia de "chromium"), así que
// ninguna prueba de lectura ve el estado escrito. La gravedad sembrada se restaura en afterEach
// reenviando por la API el mismo cuerpo que armó el recorrido, con solo la severidad invertida.

const RUTA_ACTUALIZAR = `/problematicas/parte/actualizar?cue=${CUE_ANEXO_OPERADOR}`
const RUTA_API_PARTE = '/api/mapas/infraestructura/parte'
const RUTA_API_HISTORIAL = '/api/mapas/infraestructura/historial'
const RUTA_POST_PARTE = '/api/problematicas/parte'

const MOTIVO_OPERADOR = 'Inundación'
const GRAVEDAD_SEMBRADA = 'Media'
const GRAVEDAD_CAMBIADA = 'Alta'

type Afectacion = { motivo: string; severidad: string }
type Movimiento = { id: string; tipo: string; severidad: string | null }
type EnvioCapturado = { url: string; cuerpo: string }

// Lo deja la prueba de escritura con el envío real del recorrido; la prueba de permisos lo reutiliza.
let envioGuardado: EnvioCapturado | undefined

async function gravedadActual(apiAdmin: APIRequestContext): Promise<string | undefined> {
  const respuesta = await apiAdmin.get(RUTA_API_PARTE, { params: { cue: CUE_ANEXO_OPERADOR } })
  expect(respuesta.status()).toBe(200)
  const cuerpo = (await respuesta.json()) as { afectaciones: Afectacion[] }
  return cuerpo.afectaciones.find((afectacion) => afectacion.motivo === MOTIVO_OPERADOR)?.severidad
}

// Recorrido de actualización hasta la pantalla "Confirmar": "Cambió" → gravedad → Continuar →
// "¿Hay algo nuevo?" No → asistencia pedagógica con el valor vigente ("No").
async function llegarAConfirmar(page: Page, severidad: string) {
  await page.goto(RUTA_ACTUALIZAR)
  await page.getByRole('button', { name: 'Actualizar el parte' }).click()
  await page.getByText('Cambió', { exact: true }).click()
  await page.getByText('La gravedad', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.locator('label.opcion--severidad', { has: page.locator(`input[value="${severidad}"]`) }).click()
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByText('No', { exact: true }).click()
  // enviar() en recorrido-actualizacion.tsx exige responder la asistencia pedagógica aunque no cambie.
  await page.getByRole('group', { name: '¿Se brinda asistencia pedagógica?' }).getByText('No', { exact: true }).click()
}

// Guarda por el recorrido real y devuelve el envío que armó la app junto con la respuesta del servidor.
async function actualizarGravedad(page: Page, severidad: string): Promise<{ envio: EnvioCapturado; respuesta: Response }> {
  await llegarAConfirmar(page, severidad)
  const [peticion, respuesta] = await Promise.all([
    page.waitForRequest((r) => r.url().includes(RUTA_POST_PARTE) && r.method() === 'POST'),
    page.waitForResponse((r) => r.url().includes(RUTA_POST_PARTE) && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Guardar actualización' }).click(),
  ])
  const cuerpo = peticion.postData()
  if (!cuerpo) throw new Error('El envío del recorrido no tiene cuerpo')
  return { envio: { url: peticion.url(), cuerpo }, respuesta }
}

// Copia el envío del recorrido cambiando solo la severidad nueva. Recorre el cuerpo sin asumir su forma:
// exige exactamente un objeto con severidad en gravedad cambiada, y lo informa si no coincide.
function invertirGravedad(cuerpo: string): string {
  const datos: unknown = JSON.parse(cuerpo)
  const coincidencias: Array<Record<string, unknown>> = []
  const recorrer = (nodo: unknown): void => {
    if (Array.isArray(nodo)) return nodo.forEach(recorrer)
    if (nodo && typeof nodo === 'object') {
      const registro = nodo as Record<string, unknown>
      if (registro.severidad === GRAVEDAD_CAMBIADA) coincidencias.push(registro)
      Object.values(registro).forEach(recorrer)
    }
  }
  recorrer(datos)
  if (coincidencias.length !== 1) {
    const claves = datos && typeof datos === 'object' ? Object.keys(datos).join(', ') : ''
    throw new Error(`Se esperaba un objeto con severidad ${GRAVEDAD_CAMBIADA} y hubo ${coincidencias.length}. Claves del envío: ${claves}`)
  }
  coincidencias[0].severidad = GRAVEDAD_SEMBRADA
  // Una clave de idempotencia nueva: si se reenvía la del envío original, el servidor responde 200 con el movimiento previo y no escribe.
  if (datos && typeof datos === 'object') {
    const registro = datos as Record<string, unknown>
    if ('rigeDesde' in registro) registro.rigeDesde = new Date().toISOString()
    if ('idempotencyKey' in registro) registro.idempotencyKey = randomUUID()
  }
  return JSON.stringify(datos)
}

test.describe.serial('parte del operador: escritura', () => {
  test.use({ storageState: path.resolve(RAIZ, cuentaPorClave('operador').storageStatePath) })

  test.afterEach(async ({ apiAdmin, apiOperador }) => {
    // Restaura la gravedad sembrada si una prueba la cambió (también si falló a mitad de camino).
    if ((await gravedadActual(apiAdmin)) === GRAVEDAD_SEMBRADA) return
    if (!envioGuardado) throw new Error('No hay envío del recorrido para restaurar la gravedad sembrada')
    const respuesta = await apiOperador.post(envioGuardado.url, {
      headers: { 'content-type': 'application/json' },
      data: invertirGravedad(envioGuardado.cuerpo),
    })
    expect(respuesta.status(), 'restaurar la gravedad sembrada').toBe(201)
    expect(await gravedadActual(apiAdmin)).toBe(GRAVEDAD_SEMBRADA)
  })

  test(`cambiar ${MOTIVO_OPERADOR} de ${GRAVEDAD_SEMBRADA} a ${GRAVEDAD_CAMBIADA} persiste en el parte y en el historial`, async ({ page, apiAdmin }) => {
    const historialAntes = await apiAdmin.get(RUTA_API_HISTORIAL, { params: { cue: CUE_ANEXO_OPERADOR } })
    const cantidadAntes = ((await historialAntes.json()) as { movimientos: Movimiento[] }).movimientos.length

    const { envio, respuesta } = await actualizarGravedad(page, GRAVEDAD_CAMBIADA)
    envioGuardado = envio
    expect(respuesta.status()).toBe(201)
    const cuerpo = (await respuesta.json()) as { ok: boolean; movimientoId: string }
    expect(cuerpo).toMatchObject({ ok: true, movimientoId: expect.any(String) })

    expect(await gravedadActual(apiAdmin)).toBe(GRAVEDAD_CAMBIADA)

    const historial = await apiAdmin.get(RUTA_API_HISTORIAL, { params: { cue: CUE_ANEXO_OPERADOR } })
    const movimientos = ((await historial.json()) as { movimientos: Movimiento[] }).movimientos
    expect(movimientos).toHaveLength(cantidadAntes + 1)
    expect(movimientos[0]).toMatchObject({ id: cuerpo.movimientoId, tipo: 'actualizacion', severidad: GRAVEDAD_CAMBIADA })
  })

  test('una cuenta de consulta o un director sin alcance no puede escribir el parte de la escuela', async ({ page, playwright, baseURL }) => {
    // Captura su propio envío del recorrido (el operador sí puede escribir); afterEach restaura la gravedad sembrada.
    const { envio } = await actualizarGravedad(page, GRAVEDAD_CAMBIADA)
    envioGuardado = envio
    const esperadas: Array<{ clave: ClaveCuentaQa; status: number }> = [
      { clave: 'consulta-infra', status: 401 },
      { clave: 'director-sin-alcance', status: 403 },
    ]

    for (const { clave, status } of esperadas) {
      const contexto = await playwright.request.newContext({
        baseURL,
        storageState: path.resolve(RAIZ, cuentaPorClave(clave).storageStatePath),
      })
      try {
        const respuesta = await contexto.post(envioGuardado.url, { headers: { 'content-type': 'application/json' }, data: envioGuardado.cuerpo })
        expect(respuesta.status(), clave).toBe(status)
        expect(await respuesta.json(), clave).toEqual({ error: 'No autorizado' })
      } finally {
        await contexto.dispose()
      }
    }
  })
})
