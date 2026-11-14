import type { Page } from '@playwright/test'

export type Who = 'planning' | 'cabecera' | 'supervisor' | 'admin' | 'operator' | 'operatorOther'

const PATH_BY_ROLE: Record<Who, RegExp> = {
  planning: /\/cuadernillos(?:\?|$)/,
  cabecera: /\/cuadernillos(?:\?|$)/,
  supervisor: /\/cuadernillos(?:\?|$)/,
  admin: /\/cuadernillos(?:\?|$)/,
  // School operators sign in through the GE SSO in production; the harness gives them a
  // credential account with the same role and ge_cue_anexo, so the session is the same shape.
  operator: /\/cuadernillos\/recepcion(?:\?|$)/,
  operatorOther: /\/cuadernillos\/recepcion(?:\?|$)/,
}

export async function login(page: Page, who: Who) {
  const email = `t8-fixture-${who.toLowerCase()}@example.test`
  const password = process.env[`T8_${who.toUpperCase()}_PASSWORD`]
  if (!password) throw new Error(`Missing isolated credential for ${who}`)
  const callback = who.startsWith('operator') ? '%2Fcuadernillos%2Frecepcion' : '%2Fcuadernillos'
  await page.goto(`/login?callbackUrl=${callback}`)
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse((response) => response.url().includes('/api/auth/sign-in') && response.request().method() === 'POST', { timeout: 15_000 }).catch(() => null)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    const response = await responsePromise
    if (!response || response.status() !== 429) break
    await page.waitForTimeout(10_500)
  }
  await page.waitForURL(PATH_BY_ROLE[who], { timeout: 15_000 })
}
