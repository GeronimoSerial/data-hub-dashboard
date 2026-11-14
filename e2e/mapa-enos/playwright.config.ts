import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Paths resolve against this file's directory (CJS: the project has no "type": "module").
const here = __dirname
const serveScript = path.join(here, 'serve.mjs')

// run.mjs picks free ports and passes them through the environment.
const mainPort = process.env.MAPA_E2E_PORT ?? '3201'
const sinRadarPort = process.env.MAPA_E2E_SIN_RADAR_PORT ?? '3202'
const mainURL = `http://127.0.0.1:${mainPort}`
const sinRadarURL = `http://127.0.0.1:${sinRadarPort}`
const pausaPort = process.env.MAPA_E2E_PAUSA_PORT ?? '3203'
const pausaURL = `http://127.0.0.1:${pausaPort}`

export default defineConfig({
  testDir: here,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(here, '.results', 'html'), open: 'never' }],
  ],
  outputDir: path.join(here, '.results', 'artifacts'),
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: 'setup/*.setup.ts',
      use: { baseURL: mainURL },
    },
    {
      name: 'chromium',
      testMatch: ['specs/**/*.spec.ts', 'contratos/**/*.spec.ts'],
      testIgnore: '**/*.mobile.spec.ts',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], baseURL: mainURL },
    },
    {
      name: 'mobile',
      // controles-movil.spec.ts corre aquí su bloque móvil; el de escritorio se omite por proyecto.
      testMatch: ['specs/**/*.mobile.spec.ts', 'specs/controles-movil.spec.ts'],
      dependencies: ['setup'],
      // iPhone 13 defaults to WebKit; run it on the bundled Chromium instead.
      use: { ...devices['iPhone 13'], browserName: 'chromium', baseURL: mainURL },
    },
    {
      // Escrituras del parte: corren después de "chromium", así ninguna prueba de lectura ve el estado escrito.
      name: 'chromium-escritura',
      testMatch: 'specs-escritura/**/*.spec.ts',
      dependencies: ['chromium'],
      use: { ...devices['Desktop Chrome'], baseURL: mainURL },
    },
    {
      name: 'chromium-sin-radar',
      testMatch: 'specs-sin-radar/**/*.spec.ts',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], baseURL: sinRadarURL },
    },
    {
      // Escenarios del Centro de Situación (plan 9.4). Corren después de las lecturas y las escrituras.
      name: 'chromium-situacion',
      testMatch: 'specs-situacion/**/*.spec.ts',
      dependencies: ['chromium-escritura'],
      use: { ...devices['Desktop Chrome'], baseURL: mainURL },
    },
    {
      // Servidor con ENOS_JOBS_ENABLED=false (pausa operativa, I8).
      name: 'chromium-pausa',
      testMatch: 'specs-pausa/**/*.spec.ts',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], baseURL: pausaURL },
    },
  ],
  webServer: [
    {
      command: `node ${serveScript}`,
      url: mainURL,
      env: { ...process.env, MAPA_E2E_PORT: mainPort },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node ${serveScript}`,
      url: sinRadarURL,
      env: { ...process.env, MAPA_E2E_PORT: sinRadarPort, MAPA_E2E_SIN_RADAR: '1' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node ${serveScript}`,
      url: pausaURL,
      env: { ...process.env, MAPA_E2E_PORT: pausaPort, MAPA_E2E_PAUSA: '1' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
