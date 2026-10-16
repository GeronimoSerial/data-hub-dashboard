import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const runtimeDir = await mkdtemp(path.join(tmpdir(), 'reportes-offline-e2e-'))
const outputDir = path.join(root, 'e2e/reportes-offline/.results')
const binDir = path.dirname(process.execPath)
const password = `e2e-only-${crypto.randomUUID()}-never-used-for-production`
const env = {
  ...process.env,
  PATH: `${binDir}:${process.env.PATH ?? ''}`,
  DATA_DIR: runtimeDir,
  DATABASE_URL: '',
  NODE_ENV: 'production',
  PROBLEMATICAS_ACCESO_PASSWORD: password,
  BETTER_AUTH_SECRET: `e2e-only-secret-${crypto.randomUUID()}`,
  BETTER_AUTH_URL: 'http://127.0.0.1:3000',
  OBS_BUCKET: '',
  OBS_REGION: '',
  OBS_ENDPOINT: '',
  OBS_ACCESS_KEY_ID: '',
  OBS_SECRET_ACCESS_KEY: '',
  E2E_REPORTES_DATA_DIR: runtimeDir,
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.error}`)
  return result.stdout ?? ''
}

try {
  await mkdir(outputDir, { recursive: true })
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })
  run('corepack', ['pnpm', 'build'])
  run(process.execPath, ['e2e/reportes-offline/seed.mjs'])
  await build({
    entryPoints: ['lib/infraestructura/fotos/procesador-imagen.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'ReportPhotoProcessor',
    platform: 'browser',
    target: ['es2022'],
    outfile: 'e2e/reportes-offline/.generated-photo-processor.js',
  })
  run('corepack', ['pnpm', 'exec', 'playwright', 'test'])
} finally {
  await rm(runtimeDir, { recursive: true, force: true })
  await rm(path.join(root, 'e2e/reportes-offline/.generated-photo-processor.js'), { force: true })
  await rm(outputDir, { recursive: true, force: true })
}
