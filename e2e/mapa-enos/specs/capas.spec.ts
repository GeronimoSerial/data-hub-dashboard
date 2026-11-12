import type { Page } from '@playwright/test'
import { CLAVE_CAPAS_VISIBLES, type CapasVisibles } from '@/lib/infraestructura/mapa/capas'
import { ESPERADOS } from '../seed/esperados'
import { cuentaPorClave } from '../cuentas-qa'
import { esperarMapaListo, expect, test } from '../fixtures/base'

test.use({ storageState: cuentaPorClave('admin').storageStatePath })

// Etiquetas de los interruptores de PanelCapas (components/mapas/panel-capas.tsx).
const ETIQUETA: Record<keyof CapasVisibles, string> = {
  estacionesRio: 'Estaciones de Prefectura (altura de ríos)',
  lluviaObservada: 'Lluvia observada (satélite IMERG)',
  limitesDepartamentos: 'Límites de los departamentos',
  nombresDepartamentos: 'Nombres de los departamentos',
  rutaAcceso: 'Ruta de acceso de la escuela seleccionada',
  crucesAgua: 'Cruces de agua de la ruta',
  escuelasAisladas: 'Escuelas aisladas',
  escuelasEnRiesgo: 'Escuelas en riesgo hoy (moderado o más)',
}

// Conteos esperados de features dibujadas por capa, con la escuela 1800893-00 seleccionada
// cuando la capa necesita una (ruta y cruces). Cada número sale del manifiesto o del seed:
//  - estacionesRio: 3 estaciones de Prefectura (ESPERADOS.hidrometria).
//  - lluviaObservada: 3 celdas IMERG en la ventana de 72 h por defecto (ESPERADOS.radar).
//  - limitesDepartamentos: 4 departamentos únicos (el gancho deduplica teselas).
//  - nombresDepartamentos: 2 etiquetas dibujadas en el encuadre por defecto, con las estaciones
//    encendidas. MapLibre descarta etiquetas que chocan con los símbolos de estación: con las
//    estaciones apagadas se dibujan las 4 (observado). Es un valor del encuadre, no del total de
//    departamentos.
//  - escuelasAisladas: 2 escuelas. El seed tiene 3 aisladas (ESPERADOS.radar.aisladas) con
//    índices 3, 2 y 1, pero el mapa dibuja solo aislamiento Alto (3) y Medio (2)
//    (lib/infraestructura/mapa/planificacion.ts, nivelesLeyendaPlanificacion).
//  - escuelasEnRiesgo: moderado, alto y muy alto del manifiesto (ESPERADOS.riesgo.porNivel).
// Escuela aislada 1800893-00 (seed/escuelas.ts: lat -29.30617, lon -59.19734): tiene ruta y 2 cruces de agua.
const ESCUELA_CON_CRUCES = { lon: -59.19734, lat: -29.30617 }
const CUENTA_CONTEOS = {
  estacionesRio: ESPERADOS.hidrometria.estaciones.total,
  lluviaObservada: ESPERADOS.radar.lluviaObservada.celdas,
  limitesDepartamentos: Object.keys(ESPERADOS.escuelas.porDepartamento).length,
  nombresDepartamentos: 2,
  rutaAcceso: 1,
  crucesAgua: 2,
  escuelasAisladas: 2,
  escuelasEnRiesgo: ESPERADOS.riesgo.porNivel.moderado + ESPERADOS.riesgo.porNivel.alto + ESPERADOS.riesgo.porNivel.muy_alto,
} as const satisfies Record<keyof CapasVisibles, number>

// Valores por defecto escritos a mano (no importados de capas.ts): si alguien cambia el default,
// la prueba falla y obliga a decidir si el cambio es intencional.
const POR_DEFECTO: CapasVisibles = {
  estacionesRio: true,
  lluviaObservada: true,
  limitesDepartamentos: true,
  nombresDepartamentos: true,
  rutaAcceso: true,
  crucesAgua: true,
  escuelasAisladas: false,
  escuelasEnRiesgo: false,
}

const CLAVES = Object.keys(ETIQUETA) as Array<keyof CapasVisibles>
const NECESITA_SELECCION: ReadonlyArray<keyof CapasVisibles> = ['rutaAcceso', 'crucesAgua']

type Gancho = {
  capasVisibles(): Array<keyof CapasVisibles>
  featuresRenderizadas(capa: string): number
}

async function conteo(page: Page, capa: keyof CapasVisibles): Promise<number> {
  return page.evaluate((clave) => (window as unknown as { __mapaE2E: Gancho }).__mapaE2E.featuresRenderizadas(clave), capa)
}

async function capasDibujadas(page: Page): Promise<string[]> {
  const lista = await page.evaluate(() => (window as unknown as { __mapaE2E: Gancho }).__mapaE2E.capasVisibles())
  return [...lista].sort()
}

async function abrirMapa(page: Page): Promise<void> {
  await page.goto('/mapas/infraestructura')
  await esperarMapaListo(page)
}

async function irACapas(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Capas' }).click()
  await expect(page.getByRole('switch', { name: ETIQUETA.estacionesRio })).toBeVisible()
}

async function abrirCapas(page: Page): Promise<void> {
  await abrirMapa(page)
  await irACapas(page)
}

// El clic en el mapa se hace en "Situación actual": ahí se abre la ficha. Después se cambia a Capas,
// donde la selección sigue vigente (ruta y cruces se dibujan) y la ficha no reemplaza el panel.
async function seleccionarEscuela(page: Page): Promise<void> {
  const punto = await page.evaluate(
    ([lon, lat]) => (window as unknown as { __mapaE2E: { proyectar(lon: number, lat: number): { x: number; y: number } } }).__mapaE2E.proyectar(lon, lat),
    [ESCUELA_CON_CRUCES.lon, ESCUELA_CON_CRUCES.lat],
  )
  await page.mouse.click(punto.x, punto.y)
  // Espera a que la ruta de la escuela se dibuje (condición del mapa, no una pausa fija).
  await expect.poll(() => conteo(page, 'rutaAcceso')).toBe(CUENTA_CONTEOS.rutaAcceso)
}

function interruptor(page: Page, capa: keyof CapasVisibles) {
  return page.getByRole('switch', { name: ETIQUETA[capa] })
}

test('valores por defecto: 6 capas encendidas y 2 apagadas en la interfaz', async ({ page }) => {
  await abrirCapas(page)

  for (const capa of CLAVES) {
    await expect(interruptor(page, capa)).toHaveAttribute('aria-checked', String(POR_DEFECTO[capa]))
  }
  // Sin escuela seleccionada, ruta y cruces no tienen geometría: se dibujan 4 de las 6 encendidas.
  expect(await capasDibujadas(page)).toEqual(
    ['estacionesRio', 'limitesDepartamentos', 'lluviaObservada', 'nombresDepartamentos'].sort(),
  )
})

// PENDIENTE (fixme): en el encuadre por defecto, el clic en el canvas sobre la escuela 1800893-00
// no la selecciona (no abre la ficha, ruta y cruces siguen en 0). La búsqueda por CUE no existe en
// el mapa de infraestructura (SearchBox solo se usa en natalidad). Hace falta otra forma de
// seleccionar una escuela desde la interfaz pública para estas tres pruebas.
test.fixme('con una escuela seleccionada se dibujan las 6 capas encendidas por defecto', async ({ page }) => {
  await abrirMapa(page)
  await seleccionarEscuela(page)
  await irACapas(page)

  const encendidas = CLAVES.filter((capa) => POR_DEFECTO[capa])
  await expect.poll(() => capasDibujadas(page)).toEqual([...encendidas].sort())
  await expect(interruptor(page, 'rutaAcceso')).toHaveAttribute('aria-checked', 'true')
  await expect(interruptor(page, 'crucesAgua')).toHaveAttribute('aria-checked', 'true')
})

// Una prueba por capa: se parte de los valores por defecto, la capa pasa de N a 0 al apagarla
// y vuelve a N al encenderla. Las capas de ruta y cruces necesitan una escuela seleccionada.
for (const capa of CLAVES) {
  const prueba = NECESITA_SELECCION.includes(capa) ? test.fixme : test
  prueba(`capa ${capa}: apagar deja 0 features y encender vuelve a ${CUENTA_CONTEOS[capa]}`, async ({ page }) => {
    await abrirMapa(page)
    if (NECESITA_SELECCION.includes(capa)) await seleccionarEscuela(page)
    await irACapas(page)

    const encendidaPorDefecto = POR_DEFECTO[capa]
    if (!encendidaPorDefecto) {
      await interruptor(page, capa).click()
      await expect(interruptor(page, capa)).toHaveAttribute('aria-checked', 'true')
    }
    await expect.poll(() => conteo(page, capa)).toBe(CUENTA_CONTEOS[capa])

    await interruptor(page, capa).click()
    await expect(interruptor(page, capa)).toHaveAttribute('aria-checked', 'false')
    await expect.poll(() => conteo(page, capa)).toBe(0)

    await interruptor(page, capa).click()
    await expect(interruptor(page, capa)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => conteo(page, capa)).toBe(CUENTA_CONTEOS[capa])
  })
}

test('persistencia: el estado de las capas sobrevive a una recarga', async ({ page }) => {
  await abrirCapas(page)
  await interruptor(page, 'estacionesRio').click()
  await interruptor(page, 'escuelasAisladas').click()
  await expect(interruptor(page, 'estacionesRio')).toHaveAttribute('aria-checked', 'false')
  await expect(interruptor(page, 'escuelasAisladas')).toHaveAttribute('aria-checked', 'true')

  const guardado = await page.evaluate((clave) => window.localStorage.getItem(clave), CLAVE_CAPAS_VISIBLES)
  expect(JSON.parse(guardado ?? 'null')).toEqual({ ...POR_DEFECTO, estacionesRio: false, escuelasAisladas: true })

  await page.reload()
  await esperarMapaListo(page)
  await page.getByRole('tab', { name: 'Capas' }).click()
  await expect(interruptor(page, 'estacionesRio')).toHaveAttribute('aria-checked', 'false')
  await expect(interruptor(page, 'escuelasAisladas')).toHaveAttribute('aria-checked', 'true')
  await expect(interruptor(page, 'lluviaObservada')).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => conteo(page, 'estacionesRio')).toBe(0)
  await expect.poll(() => conteo(page, 'escuelasAisladas')).toBe(CUENTA_CONTEOS.escuelasAisladas)
})

test('leyenda: refleja las capas encendidas y desaparece al apagarlas', async ({ page }) => {
  await abrirCapas(page)
  const leyenda = page.getByTestId('leyenda-mapa')
  const estaciones = leyenda.getByTestId('leyenda-estaciones')
  const riesgoHoy = leyenda.getByTestId('leyenda-riesgo-hoy')

  // Por defecto: estaciones y lluvia encendidas, riesgo hoy apagado.
  await expect(estaciones).toHaveCount(1)
  await expect(estaciones.locator('li')).toHaveCount(4)
  await expect(riesgoHoy).toHaveCount(0)

  await interruptor(page, 'estacionesRio').click()
  await expect(estaciones).toHaveCount(0)

  await interruptor(page, 'escuelasEnRiesgo').click()
  await expect(riesgoHoy).toHaveCount(1)
  await expect(riesgoHoy.locator('li')).toHaveCount(3)
  await expect(riesgoHoy.locator('li').nth(0)).toHaveText('Muy alto')
  await expect(riesgoHoy.locator('li').nth(1)).toHaveText('Alto')
  await expect(riesgoHoy.locator('li').nth(2)).toHaveText('Moderado')

  await interruptor(page, 'escuelasEnRiesgo').click()
  await expect(riesgoHoy).toHaveCount(0)
})
