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
      testMatch: 'specs/**/*.spec.ts',
      testIgnore: '**/*.mobile.spec.ts',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], baseURL: mainURL },
    },
    {
      name: 'mobile',
      testMatch: 'specs/**/*.mobile.spec.ts',
      dependencies: ['setup'],
      // iPhone 13 defaults to WebKit; run it on the bundled Chromium instead.
      use: { ...devices['iPhone 13'], browserName: 'chromium', baseURL: mainURL },
    },
    {
      name: 'chromium-sin-radar',
      testMatch: 'specs-sin-radar/**/*.spec.ts',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], baseURL: sinRadarURL },
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
  ],
})
