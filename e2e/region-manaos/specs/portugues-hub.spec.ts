import { expect, test, type Cookie, type Page } from '@playwright/test'
import { captura, conPagina, cookiesDeSesion } from './sesion'

// M2 shell and public pages with REGION=manaos and an empty database: hub header/nav, login form, parte header.
// Literals are copied from lib/i18n/diccionarios/grupos/shellHub.pt.ts (shell, login, meta) and
// grupos/parteResto.pt.ts (encabezado). No '@/' import: the e2e project does not resolve the app aliases.

const ESPANOL_CABECERA = ['Inicio', 'Buscar', 'Navegación principal', 'Usar tema oscuro', 'Usar tema claro', 'Administración']
const ESPANOL_LOGIN = ['Iniciar sesión', 'Correo', 'Contraseña', 'Ingrese con la cuenta asignada']
const ESPANOL_PARTE = [
  'Registro de Incidencias',
  'Oscilación del Sur',
  'Manuales y cuadernillos',
  'Este formulario requiere',
  'Contraseña',
  'Ingresar',
]

test.describe.configure({ mode: 'serial' })

let cookies: Cookie[] = []

test.beforeAll(async ({ browser, baseURL }) => {
  cookies = await cookiesDeSesion(browser, baseURL!)
})

async function marcadoresEn(page: Page, marcadores: string[]): Promise<string[]> {
  const texto = await page.locator('body').innerText()
  return marcadores.filter((marcador) => texto.includes(marcador))
}
test('(a) hub header and nav on /explorar are Portuguese', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto('/explorar')
    const cabecera = page.getByRole('banner')
    await expect(cabecera.getByText('Hub de Dados', { exact: true })).toBeVisible()

    // shell.navInicio, shell.ariaNavegacion, shell.ariaBuscarRecursos, shell.ariaTemaOscuro / ariaTemaClaro
    const navegacion = cabecera.getByRole('navigation', { name: 'Navegação principal' })
    await expect(navegacion.getByRole('link', { name: 'Início', exact: true })).toBeVisible()
    await expect(cabecera.getByRole('link', { name: 'Pesquisar recursos', exact: true })).toBeVisible()
    await expect(cabecera.getByRole('button', { name: /^Usar (tema escuro|o tema claro)$/ })).toBeVisible()

    const textoCabecera = await cabecera.innerText()
    expect(
      ESPANOL_CABECERA.filter((marcador) => textoCabecera.includes(marcador)),
      'Spanish markers in the hub header',
    ).toEqual([])
    await captura(page, 'manaos-cabecera-pt')
  })
})

test('(b) login page shows the Portuguese form texts when unauthenticated', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, [], async (page) => {
    await page.goto('/login')
    // shellHub.pt.ts login.titulo, login.intro, login.correo, login.contrasena, login.ingresar
    await expect(page.getByRole('heading', { name: 'Iniciar sessão', level: 1 })).toBeVisible()
    await expect(page.getByText('Entre com a conta atribuída pela administração.', { exact: true })).toBeVisible()
    await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Senha', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Iniciar sessão', exact: true })).toBeVisible()

    expect(await marcadoresEn(page, ESPANOL_LOGIN), 'Spanish markers on /login').toEqual([])
    await captura(page, 'manaos-login-pt')
  })
})

test('(c1) /problematicas/parte header is Portuguese', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto('/problematicas/parte')
    // parteResto.pt.ts encabezado.programa, glosa, materiales; EncabezadoParte renders them on every branch.
    await expect(page.getByRole('heading', { name: 'Registro de Incidências ENOS 2026/2027', level: 1 })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('El Niño – Oscilação do Sul', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Manuais e cadernos/ })).toBeVisible()

    expect(await marcadoresEn(page, ESPANOL_PARTE), 'Spanish markers on /problematicas/parte').toEqual([])
    await captura(page, 'manaos-parte-pt')
  })
})

test('(c2) /problematicas/parte/nuevo header is Portuguese', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto('/problematicas/parte/nuevo')
    await expect(page.getByRole('heading', { name: 'Registro de Incidências ENOS 2026/2027', level: 1 })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('link', { name: /^Manuais e cadernos/ })).toBeVisible()

    expect(await marcadoresEn(page, ESPANOL_PARTE), 'Spanish markers on /problematicas/parte/nuevo').toEqual([])
  })
})

test('(d) document lang is pt-BR and the title does not name Corrientes', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto('/explorar')
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
    await expect(page).not.toHaveTitle(/Corrientes/)
  })
  await conPagina(browser, baseURL!, [], async (page) => {
    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
    await expect(page).not.toHaveTitle(/Corrientes/)
  })
})
