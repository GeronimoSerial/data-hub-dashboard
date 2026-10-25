import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const workspace = await mkdtemp(path.join(os.tmpdir(), 'hub-access-t7b-'))
const project = path.join(workspace, 'project')
const data = path.join(workspace, 'data')
const port = process.env.HUB_E2E_PORT ?? '3101'
const baseURL = `http://127.0.0.1:${port}`
const env = {
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? os.homedir(),
  LANG: process.env.LANG ?? 'C.UTF-8',
  CI: '1',
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  DATA_DIR: data,
  DATABASE_URL: '',
  BETTER_AUTH_URL: baseURL,
  BETTER_AUTH_SECRET: `t7b-local-only-${crypto.randomUUID()}-${crypto.randomUUID()}`,
  PROBLEMATICAS_ACCESO_PASSWORD: `t7b-local-only-${crypto.randomUUID()}`,
  T7B_ADMIN_PASSWORD: `Admin-${crypto.randomUUID()}-Aa9!`,
  T7B_INFRA_PASSWORD: `Infra-${crypto.randomUUID()}-Aa9!`,
  T7B_CREATED_PASSWORD: `Assigned-${crypto.randomUUID()}-Aa9!`,
  T7B_MOBILE_PASSWORD: `Mobile-${crypto.randomUUID()}-Aa9!`,
  T7B_MAPS_PASSWORD: `Maps-${crypto.randomUUID()}-Aa9!`,
  T7B_REPORTS_PASSWORD: `Reports-${crypto.randomUUID()}-Aa9!`,
  T7B_DASHBOARDS_PASSWORD: `Dashboards-${crypto.randomUUID()}-Aa9!`,
  HUB_E2E_RUNTIME_ROOT: project,
  HUB_E2E_PORT: port,
  HUB_E2E_BASE_URL: baseURL,
  // No cloud, SMTP, or GE SSO integration is configured for this throwaway DB.
  OBS_BUCKET: '',
  OBS_REGION: '',
  OBS_ENDPOINT: '',
  OBS_ACCESS_KEY_ID: '',
  OBS_SECRET_ACCESS_KEY: '',
  AWS_ACCESS_KEY_ID: '',
  AWS_SECRET_ACCESS_KEY: '',
  GE_SSO_SHARED_SECRET: '',
  GE_SSO_SHARED_KEY: '',
}

function run(command, args, cwd, extraEnv = env) {
  const result = spawnSync(command, args, { cwd, env: extraEnv, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.error}`)
  }
}

try {
  await mkdir(project, { recursive: true })
  await mkdir(data, { recursive: true })
  await cp(root, project, {
    recursive: true,
    filter(source) {
      const relative = path.relative(root, source)
      if (!relative) return true
      const segments = relative.split(path.sep)
      if (segments.some((part) => ['.git', '.next', '.data', '.codegraph', 'node_modules', 'coverage', '.turbo', '.results'].includes(part))) return false
      if (segments.some((part) => part.startsWith('.env'))) return false
      return true
    },
  })
  await symlink(path.join(root, 'node_modules'), path.join(project, 'node_modules'), 'dir')

  console.log(`T7b isolated runtime: ${project}; database/data: ${data}; browser base: ${baseURL}`)
  run(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], project)
  run(process.execPath, ['e2e/reportes-offline/seed.mjs'], project)
  run(process.execPath, ['e2e/hub-access/seed.mjs'], project)
  await build({
    entryPoints: [path.join(project, 'lib/infraestructura/fotos/procesador-imagen.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'ReportPhotoProcessor',
    platform: 'browser',
    target: ['es2022'],
    outfile: path.join(project, 'e2e/reportes-offline/.generated-photo-processor.js'),
  })
  await mkdir(path.join(project, 'e2e/hub-access/.results'), { recursive: true })
  const testEnv = {
    ...env,
    // Playwright and the app use only these generated fixture credentials.
  }
  run(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=e2e/hub-access/playwright.config.mjs'], project, testEnv)
} finally {
  // Diagnostics: HUB_E2E_KEEP_DIR copies Playwright results out before the throwaway workspace is deleted.
  if (process.env.HUB_E2E_KEEP_DIR) {
    // Playwright resolves outputDir relative to the config file, so artifacts live under e2e/hub-access/e2e/hub-access/.results.
    await cp(path.join(project, 'e2e/hub-access'), process.env.HUB_E2E_KEEP_DIR, { recursive: true, force: true, filter: (source) => !source.includes(`${path.sep}node_modules`) }).catch((error) => console.error(`keep results failed: ${error.message}`))
  }
  await rm(workspace, { recursive: true, force: true })
}
