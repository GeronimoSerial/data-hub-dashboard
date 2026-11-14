import { expect, test, type Cookie, type Page } from '@playwright/test'
import { captura, conPagina, cookiesDeSesion } from './sesion'

// CA1 of M1: with REGION=manaos and an empty database, every visible UI string is Portuguese.
// Literals are copied from lib/i18n/diccionarios (pt.ts, grupos/situacion.pt.ts, grupos/controlesCapas.pt.ts,
// grupos/estadisticas.pt.ts). No '@/' import: the e2e project does not resolve the app aliases.
const MAPA = '/mapas/infraestructura'

// Spanish markers that must not appear anywhere on the page. Each one differs from its Portuguese text
// (e.g. 'Estadísticas' vs 'Estatísticas', 'Planificación' vs 'Planejamento', 'Capas' vs 'Camadas').
// 'Exportar' is deliberately absent: the Portuguese export panel title 'Exportar escolas' contains it.
const MARCADORES_ES = [
  'SITUACIÓN ACTUAL',
  'Ver provincia',
  'Pantalla completa',
  'Ninguna escuela',
  'Veredicto diario',
  'Cargando',
  'Sin datos',
  'Estadísticas',
  'Planificación',
  'Capas',
]

test.describe.configure({ mode: 'serial' })

let cookies: Cookie[] = []

test.beforeAll(async ({ browser, baseURL }) => {
  cookies = await cookiesDeSesion(browser, baseURL!)
})

async function marcadoresEspanol(page: Page): Promise<string[]> {
  const texto = await page.locator('body').innerText()
  return MARCADORES_ES.filter((marcador) => texto.includes(marcador))
}

test('(1) map tabs render Portuguese panels with no Spanish markers', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto(MAPA)
    await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible({ timeout: 60_000 })

    // Tab testid -> Portuguese label from pt.ts `modos`, and the panel title the tab shows.
    // Radar's panel title is the hardcoded literal 'Radar' in panel-lateral.tsx.
    const pestanas: Array<{ testid: string; etiqueta: string; titulo: string }> = [
      { testid: 'tab-actual', etiqueta: 'Situação atual', titulo: 'Situação atual' },
      // modos.radar in pt.ts; the panel heading is the literal 'Radar' in panel-lateral.tsx.
      { testid: 'tab-radar', etiqueta: 'Radar de risco', titulo: 'Radar' },
      { testid: 'tab-planificacion', etiqueta: 'Planejamento', titulo: 'Planejamento' },
      { testid: 'tab-estadisticas', etiqueta: 'Estatísticas', titulo: 'Estatísticas' },
      { testid: 'tab-exportar', etiqueta: 'Exportação', titulo: 'Exportação' },
    ]

    for (const pestana of pestanas) {
      const tab = page.getByTestId(pestana.testid)
      await expect(tab).toHaveText(pestana.etiqueta)
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      if (pestana.testid !== 'tab-estadisticas' && pestana.testid !== 'tab-exportar') {
        await expect(page.getByTestId('panel-lateral')).toContainText(pestana.titulo)
      }
      if (pestana.testid === 'tab-radar') {
        await expect(page.getByTestId('panel-lateral').getByRole('heading', { name: 'Radar', exact: true })).toBeVisible()
        await expect(page.getByText(/This page couldn.t load/i)).toHaveCount(0)
      }
      expect(await marcadoresEspanol(page), `Spanish markers on tab ${pestana.etiqueta}`).toEqual([])
    }
  })
})

test('(2) Camadas (legend) panel renders Portuguese with no Spanish markers', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto(MAPA)
    await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible({ timeout: 60_000 })
    const capas = page.getByTestId('tab-capas')
    await capas.click()
    await expect(capas).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('panel-lateral')).toContainText('Camadas')
    expect(await marcadoresEspanol(page)).toEqual([])
    await captura(page, 'manaos-capas-pt')
  })
})

test('(3) /situacion heading and empty state are Portuguese', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto('/situacion')
    // situacion.pt.ts centroTitulo
    await expect(page.getByRole('heading', { name: 'Centro de Situação', level: 1 })).toBeVisible({ timeout: 60_000 })
    // estadoDatos.titulo in grupos/situacion.pt.ts is 'Estado dos dados' (not 'Estado de los datos').
    await expect(page.getByText('Estado dos dados', { exact: true })).toBeVisible()
    // situacion.pt.ts motivos.nuncaCorrio ('Nunca rodou'); empty-DB jobs never ran.
    await expect(page.getByText('Nunca rodou').first()).toBeVisible()
    // Page content only: the hub shell (menu, skip link) is outside M1 and still Spanish.
    const texto = await page.locator('main').innerText()
    for (const espanol of ['Centro de Situación', 'Estado de los datos', 'Nunca corrió.']) {
      expect(texto, `Spanish text "${espanol}" on /situacion`).not.toContain(espanol)
    }
    await expect(page.getByTestId('situacion-cadena-verificada')).toHaveCount(0)
    await captura(page, 'manaos-situacion-pt')
  })
})

test('(4) /admin/operacion heading, intro and table headers are Portuguese', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto('/admin/operacion')
    // situacion.pt.ts operacion.titulo / intro / colIntento / colFilas / colActualizada / colError / colUltimaCorrida
    await expect(page.getByRole('heading', { name: 'Saúde', level: 1 })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Flags, jobs, fontes de ameaças e cotas do motor de risco.', { exact: true })).toBeVisible()
    // Section headings rendered with an empty database (table headers only exist when rows do).
    for (const seccion of ['Fontes de ameaças', 'Avanço da climatologia (cursor retomável de cota)', 'Cota Open-Meteo']) {
      await expect(page.getByRole('heading', { name: seccion, level: 2, exact: true })).toBeVisible()
    }
    await captura(page, 'manaos-operacion-pt')
  })
})
