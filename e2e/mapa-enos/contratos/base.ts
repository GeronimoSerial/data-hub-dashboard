import { cuentaPorClave } from '../cuentas-qa'
import { type APIRequestContext } from '@playwright/test'
import { expect, test as base } from '../fixtures/base'

// Playwright test with one APIRequestContext per QA account. Each context carries that account's
// storageState, so a request runs with the same session a browser user would have.
// Contexts are disposed after their test.
//
// Usage:
//   import { expect, test } from '../contratos/base'
//   test('...', async ({ apiAdmin }) => {
//     const respuesta = await apiAdmin.get('/api/mapas/infraestructura/escuelas')
//     expect(respuesta.status()).toBe(200)
//   })

type FixturesContrato = {
  apiAdmin: APIRequestContext
  apiDirector: APIRequestContext
  apiConsultaInfra: APIRequestContext
  apiOperador: APIRequestContext
  apiAnonimo: APIRequestContext
}

export const test = base.extend<FixturesContrato>({
  apiAdmin: async ({ playwright }, usar, testInfo) => {
    await usarContexto(playwright, testInfo.project.use.baseURL, cuentaPorClave('admin').storageStatePath, usar)
  },
  apiDirector: async ({ playwright }, usar, testInfo) => {
    await usarContexto(playwright, testInfo.project.use.baseURL, cuentaPorClave('director-nivel').storageStatePath, usar)
  },
  apiConsultaInfra: async ({ playwright }, usar, testInfo) => {
    await usarContexto(playwright, testInfo.project.use.baseURL, cuentaPorClave('consulta-infra').storageStatePath, usar)
  },
  apiOperador: async ({ playwright }, usar, testInfo) => {
    await usarContexto(playwright, testInfo.project.use.baseURL, cuentaPorClave('operador').storageStatePath, usar)
  },
  apiAnonimo: async ({ playwright }, usar, testInfo) => {
    await usarContexto(playwright, testInfo.project.use.baseURL, undefined, usar)
  },
})

async function usarContexto(
  playwright: { request: { newContext(opciones: { baseURL: string; storageState?: string }): Promise<APIRequestContext> } },
  baseURL: string | undefined,
  storageState: string | undefined,
  usar: (contexto: APIRequestContext) => Promise<void>,
): Promise<void> {
  if (!baseURL) throw new Error('The Playwright project does not define baseURL')
  const contexto = await playwright.request.newContext(storageState ? { baseURL, storageState } : { baseURL })
  try {
    await usar(contexto)
  } finally {
    await contexto.dispose()
  }
}

export { expect }
