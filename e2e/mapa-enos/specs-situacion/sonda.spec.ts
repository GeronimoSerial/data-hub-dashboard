import { cuentaPorClave } from '../cuentas-qa'
import { expect, test } from '../fixtures/base'
import type { Restaurar } from '../seed/escenarios-falla'
import {
  correrSonda,
  ESCUELAS_TESTIGO_SANAS,
  ESTACIONES_TESTIGO_SANAS,
  registrarCorridasSonda,
  ultimaCorridaSonda,
} from '../seed/escenarios-sonda'

// ENOS B7: la sonda de la cadena de datos corre el job real y el Centro de Situación muestra el resultado.
// Sano: el encabezado dice "Cadena de datos verificada a las HH:MM" y la fila del panel lo repite.
// Falla: sin encabezado y la fila dice por qué. Cada escenario borra sus corridas en afterEach.
test.use({ storageState: cuentaPorClave('admin').storageStatePath })

const TESTIGOS_SANOS = {
  SONDA_ESCUELAS_TESTIGO: ESCUELAS_TESTIGO_SANAS.join(','),
  SONDA_ESTACIONES_TESTIGO: ESTACIONES_TESTIGO_SANAS.join(','),
}

// La hora sale del reloj de Buenos Aires, calculada acá desde la corrida guardada, no desde la app.
function horaBuenosAires(finalizadoEn: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(finalizadoEn))
}

test.describe('Centro de Situación: sonda de la cadena de datos', () => {
  let restaurar: Restaurar | undefined

  test.setTimeout(120_000)

  test.beforeEach(async () => {
    restaurar = await registrarCorridasSonda()
  })

  test.afterEach(async () => {
    await restaurar?.()
    restaurar = undefined
  })

  test('cadena sana: el encabezado y la fila del panel muestran la hora de la verificación', async ({ page }) => {
    expect(await correrSonda(TESTIGOS_SANOS)).toBe(0)
    const corrida = await ultimaCorridaSonda()
    if (corrida?.finalizadoEn == null) throw new Error('la sonda no guardó la hora de la corrida')
    const hora = horaBuenosAires(corrida.finalizadoEn)

    await page.goto('/situacion')

    await expect(page.getByTestId('situacion-cadena-verificada')).toHaveText(`Cadena de datos verificada a las ${hora}`)
    const fila = page.getByTestId('estado-datos-item').filter({ hasText: 'Cadena de datos (sonda)' })
    await expect(fila).toContainText(`Cadena de datos verificada a las ${hora}.`)
  })

  test('escuela testigo sin corrida vigente: la sonda falla, la fila lo dice y el encabezado no aparece', async ({ page }) => {
    const escuelas = ['0000000-00', ...ESCUELAS_TESTIGO_SANAS.slice(1)].join(',')

    expect(await correrSonda({ ...TESTIGOS_SANOS, SONDA_ESCUELAS_TESTIGO: escuelas })).toBe(1)

    await page.goto('/situacion')

    await expect(page.getByTestId('situacion-cadena-verificada')).toHaveCount(0)
    const fila = page.getByTestId('estado-datos-item').filter({ hasText: 'Cadena de datos (sonda)' })
    await expect(fila).toContainText('Falló')
    await expect(fila).toContainText('La cadena de datos falló: Escuela testigo sin corrida vigente: 0000000-00')
    await expect(page.getByTestId('estado-datos')).toHaveAttribute('data-problemas', 'true')
  })

  test('consumidor: la corrida no consulta Prefectura y lo guarda en los contadores', async () => {
    expect(await correrSonda(TESTIGOS_SANOS)).toBe(0)
    const corrida = await ultimaCorridaSonda()

    expect(corrida?.estado).toBe('completado')
    expect(corrida?.contadores?.prefecturaConsultada).toBe(0)
  })
})
