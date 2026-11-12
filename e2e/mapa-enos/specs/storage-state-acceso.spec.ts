import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { CUENTAS_QA, cuentaPorClave, type ClaveCuentaQa, type CuentaQa } from '../cuentas-qa'

// Repository root: this file lives in <root>/e2e/mapa-enos/specs.
const RAIZ = path.resolve(__dirname, '..', '..', '..')
const RUTA_MAPA = '/mapas/infraestructura'

// Landing per account when it opens the map, observed against the app (run of 12/11/2026). Accounts without
// map access are redirected by the app: directors without levels go to /forbidden (map page guard), the
// consulta account without the infrastructure section goes to its hub destination, and the operador goes to
// its own parte form. Table 4.2 says "denied" for consulta and "parte, sin mapa" for the operador; these are
// the concrete URLs the app really produces.
const DESTINO_ESPERADO: Record<ClaveCuentaQa, string> = {
  admin: RUTA_MAPA,
  'admin-ge': RUTA_MAPA,
  'director-nivel': RUTA_MAPA,
  'consulta-infra': RUTA_MAPA,
  'director-sin-alcance': '/forbidden',
  'consulta-sin-infra': '/reportes',
  operador: '/problematicas/parte/nuevo',
}

function rutaStorageState(cuenta: CuentaQa): string {
  return path.resolve(RAIZ, cuenta.storageStatePath)
}

test('hay 7 storageState con cookie de sesion', () => {
  expect(CUENTAS_QA).toHaveLength(7)
  for (const cuenta of CUENTAS_QA) {
    const ruta = rutaStorageState(cuenta)
    expect(fs.existsSync(ruta), `archivo de sesion de ${cuenta.clave}`).toBe(true)
    const estado = JSON.parse(fs.readFileSync(ruta, 'utf8')) as { cookies: { name: string; value: string }[] }
    const tieneSesion = estado.cookies.some((cookie) => /session_token/.test(cookie.name) && cookie.value.length > 0)
    expect(tieneSesion, `cookie de sesion en ${cuenta.clave}`).toBe(true)
  }
})

for (const clave of Object.keys(DESTINO_ESPERADO) as ClaveCuentaQa[]) {
  const cuenta = cuentaPorClave(clave)
  test.describe(`acceso al mapa: ${clave}`, () => {
    test.use({ storageState: rutaStorageState(cuenta) })

    test(`${RUTA_MAPA} termina en ${DESTINO_ESPERADO[clave]}`, async ({ page }) => {
      await page.goto(RUTA_MAPA)
      const esperado = DESTINO_ESPERADO[clave]
      await expect(page).toHaveURL((url) => url.pathname === esperado)
    })
  })
}
