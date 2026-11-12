import type { Page } from '@playwright/test'
import { cuentaPorClave } from '../cuentas-qa'
import { expect, test } from '../fixtures/base'

test.use({ storageState: cuentaPorClave('admin').storageStatePath })

// Manifiesto de riesgo (seed/riesgo.ts, ESPERADOS_RIESGO). Las 8 escuelas con nivel moderado o más
// son las que la lista de "Riesgo hoy" muestra; las 4 de nivel bajo no aparecen.
// Nombre y departamento salen de seed/escuelas.ts; el nivel de la fila es el del snapshot
// (clasificarNivel del score), y la línea de clima sale de nivelAmenaza (ETIQUETA_NIVEL_CLIMA).
const EN_RIESGO = [
  { cue: '1800953-00', nombre: 'ESCUELA Nº 270 "DR. EDUARDO CONI MOLINA"', departamento: 'Goya', nivel: 'muy alto', clima: 'muy fuerte' },
  { cue: '1801039-00', nombre: 'ESCUELA Nº 590', departamento: 'Paso de los Libres', nivel: 'muy alto', clima: 'muy fuerte' },
  { cue: '1801477-00', nombre: 'INSTITUTO SUPERIOR DE INFORMÁTICA Y ADMINISTRACIÓN LT-7', departamento: 'Capital', nivel: 'alto', clima: 'fuerte' },
  { cue: '1800887-00', nombre: 'ESCUELA Nº 875 "GRANADEROS DE SAN MARTIN"', departamento: 'Paso de los Libres', nivel: 'alto', clima: 'fuerte' },
  { cue: '1800653-00', nombre: 'ESCUELA TECNICA DE SANTO TOME', departamento: 'Santo Tomé', nivel: 'alto', clima: 'fuerte' },
  { cue: '1800554-00', nombre: 'ESCUELA NORMAL "DR.JUAN GREGORIO PUJOL"', departamento: 'Capital', nivel: 'moderado', clima: 'moderado' },
  { cue: '1801016-00', nombre: 'COLEGIO SECUNDARIO DE COLONIA CAROLINA', departamento: 'Goya', nivel: 'moderado', clima: 'moderado' },
  { cue: '1801101-00', nombre: 'ESCUELA Nº 561 "CTTE. GREGORIO A. PORTILLO"', departamento: 'Santo Tomé', nivel: 'moderado', clima: 'moderado' },
] as const

// Escuelas de nivel bajo en el manifiesto: no entran en la lista de riesgo.
const RIESGO_BAJO = ['1801899-00', '1801533-00', '1800405-00', '1801475-00'] as const

// Escuelas aisladas del seed (seed/radar.ts, ESPERADOS_RADAR.aisladas). Índice 3 = Alto, 2 = Medio,
// 1 = Bajo. La vista Aislamiento lista solo Medio y Alto (planificacion.ts, nivelPlanificacion),
// así que la escuela de índice 1 no aparece.
const AISLADAS_LISTADAS = [
  { cue: '1800893-00', nombre: 'ESCUELA Nº 678', departamento: 'Goya', nivel: 'Alto' },
  { cue: '1800953-00', nombre: 'ESCUELA Nº 270 "DR. EDUARDO CONI MOLINA"', departamento: 'Goya', nivel: 'Medio' },
] as const
const AISLADA_BAJA = '1800939-00'

async function abrirPlanificacion(page: Page): Promise<void> {
  await page.goto('/mapas/infraestructura#planificacion')
  await expect(page.getByTestId('panel-planificacion')).toBeVisible({ timeout: 30_000 })
}

async function vistaAislamiento(page: Page): Promise<void> {
  await abrirPlanificacion(page)
  await page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: 'Aislamiento' }).click()
  await expect(page.getByTestId('escuelas-aisladas')).toBeVisible()
}

test('riesgo hoy: 8 escuelas en riesgo con desglose 2 muy alto, 3 alto, 3 moderado', async ({ page }) => {
  await abrirPlanificacion(page)

  await expect(page.getByTestId('escuelas-en-riesgo')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('escuelas-en-riesgo-total')).toHaveText('8')
  await expect(page.getByTestId('escuelas-en-riesgo-desglose')).toHaveText('2 muy alto · 3 alto · 3 moderado')
})

test('riesgo hoy: la lista muestra 3 filas y "Ver más" despliega las 8 con nombre, departamento, nivel y clima', async ({ page }) => {
  await abrirPlanificacion(page)
  await expect(page.getByTestId('escuelas-en-riesgo')).toBeVisible({ timeout: 30_000 })

  await expect(page.locator('[data-testid^="escuela-en-riesgo-"]')).toHaveCount(3)
  await page.getByRole('button', { name: 'Ver más (5)' }).click()
  await expect(page.locator('[data-testid^="escuela-en-riesgo-"]')).toHaveCount(8)

  for (const escuela of EN_RIESGO) {
    const fila = page.getByTestId(`escuela-en-riesgo-${escuela.cue}`)
    await expect(fila).toHaveAccessibleName(`${escuela.nombre}, ${escuela.departamento}`)
    await expect(fila).toContainText(`Riesgo ${escuela.nivel}`)
    await expect(fila).toContainText(`Clima: ${escuela.clima}`)
  }
})

test('riesgo hoy: las escuelas de nivel bajo no aparecen en la lista', async ({ page }) => {
  await abrirPlanificacion(page)
  await expect(page.getByTestId('escuelas-en-riesgo-total')).toHaveText('8', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Ver más (5)' }).click()

  for (const cue of RIESGO_BAJO) {
    await expect(page.getByTestId(`escuela-en-riesgo-${cue}`)).toHaveCount(0)
  }
})

test('aislamiento: 2 escuelas aisladas (Alto y Medio) con su nivel y el resumen de sin alternativa', async ({ page }) => {
  await vistaAislamiento(page)

  await expect(page.getByTestId('escuelas-aisladas-total')).toHaveText('2')
  await expect(
    page.getByRole('list', { name: 'Resumen de aislamiento' }).getByRole('listitem').filter({ hasText: 'Sin camino alternativo' }).locator('strong'),
  ).toHaveText('1')

  for (const escuela of AISLADAS_LISTADAS) {
    const fila = page.getByTestId(`escuela-aislada-${escuela.cue}`)
    await expect(fila).toHaveAccessibleName(`${escuela.nombre}, ${escuela.departamento}`)
    await expect(fila).toContainText(escuela.nivel)
  }
  // La escuela de índice 3 (Alto) no tiene alternativa sin cruce; la de índice 2 sí.
  await expect(page.getByTestId('escuela-aislada-1800893-00')).toContainText('sin alternativa')
  await expect(page.getByTestId(`escuela-aislada-${AISLADA_BAJA}`)).toHaveCount(0)
})
