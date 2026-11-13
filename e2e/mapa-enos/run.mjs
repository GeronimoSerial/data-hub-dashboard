import { spawn, spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const keepDir = process.env.MAPA_E2E_KEEP_DIR
// Extra arguments go to Playwright: pnpm test:e2e:mapa -- --grep smoke
const playwrightArgs = process.argv.slice(2)
if (playwrightArgs[0] === '--') playwrightArgs.shift()

// SIGINT/SIGTERM must not skip cleanup. Each step is awaited against this promise, which rejects on a signal,
// so the finally block below still removes the container and the workspace. Running children get the signal too.
const children = new Set()
const interrupted = new Promise((_, reject) => {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    // `on` (not `once`): a repeated Ctrl-C must not cut the cleanup short.
    process.on(signal, () => {
      for (const child of children) child.kill(signal)
      const error = new Error(`interrupted by ${signal}`)
      error.signal = signal
      reject(error)
    })
  }
})
interrupted.catch(() => {})

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(String(port)))
    })
  })
}

function docker(args, options = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', ...options })
}

// Uses E2E_DATABASE_URL when set (CI service container); otherwise starts a throwaway container.
async function startDatabase(state) {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL

  const name = `mapa-enos-e2e-${crypto.randomUUID().slice(0, 8)}`
  const pgSecret = `pg-${crypto.randomUUID()}`
  const database = 'mapa_e2e'
  // Recorded before `docker run` so cleanup also covers a partially started container.
  state.container = name

  const run = docker(
    ['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD', '-e', `POSTGRES_DB=${database}`, '-p', '127.0.0.1::5432', 'postgres:16-alpine'],
    { env: { ...process.env, POSTGRES_PASSWORD: pgSecret }, stdio: ['ignore', 'pipe', 'inherit'] },
  )
  if (run.status !== 0) throw new Error(`docker run failed with ${run.status}`)

  const portLine = docker(['port', name, '5432']).stdout.split('\n')[0] ?? ''
  const hostPort = portLine.slice(portLine.lastIndexOf(':') + 1).trim()
  if (!hostPort) throw new Error(`could not read host port for ${name}`)

  // Probe over TCP: the image's temporary init server only listens on a unix socket.
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const ready = docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', database], { stdio: 'ignore' })
    if (ready.status === 0) return `postgres://postgres:${pgSecret}@127.0.0.1:${hostPort}/${database}`
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`PostgreSQL in ${name} was not ready after 90 s`)
}

function execute(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    children.add(child)
    child.once('error', (error) => {
      children.delete(child)
      reject(error)
    })
    child.once('exit', (status, signal) => {
      children.delete(child)
      resolve({ status, signal })
    })
  })
}

async function run(command, args, cwd, env) {
  const result = await Promise.race([execute(command, args, { cwd, env }), interrupted])
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.signal}`)
  }
}

const state = { container: null }
let workspace = null
let project = null
let exitCode = 1

try {
  // Unit tests of the seed run first: a failure aborts before the workspace, the build, or the database exist.
  await run(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'e2e/mapa-enos/vitest.config.ts'], root, process.env)
  workspace = await mkdtemp(path.join(os.tmpdir(), 'mapa-enos-e2e-'))
  project = path.join(workspace, 'project')
  const data = path.join(workspace, 'data')
  const port = process.env.MAPA_E2E_PORT ?? (await freePort())
  const sinRadarPort = process.env.MAPA_E2E_SIN_RADAR_PORT ?? (await freePort())
  const baseURL = `http://127.0.0.1:${port}`

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

  const databaseUrl = await startDatabase(state)

  const env = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? os.homedir(),
    LANG: process.env.LANG ?? 'C.UTF-8',
    CI: '1',
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    // Inlined by `next build`; the app exposes its E2E hooks only when true.
    NEXT_PUBLIC_E2E: 'true',
    DATA_DIR: data,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: baseURL,
    BETTER_AUTH_SECRET: `mapa-e2e-local-only-${crypto.randomUUID()}-${crypto.randomUUID()}`,
    MAPA_E2E_PORT: port,
    MAPA_E2E_SIN_RADAR_PORT: sinRadarPort,
    // Salt for the QA account passwords (cuentas-qa.ts). Seed, setup and specs all read it from this env.
    MAPA_E2E_QA_SAL: crypto.randomUUID(),
    // Set only by `pnpm test:e2e:mapa:snapshots`: specs rewrite contratos/snapshots in the workspace copy.
    ...(process.env.MAPA_E2E_ACTUALIZAR_SNAPSHOTS ? { MAPA_E2E_ACTUALIZAR_SNAPSHOTS: process.env.MAPA_E2E_ACTUALIZAR_SNAPSHOTS } : {}),
    // Feature flags for the map (see lib/infraestructura/riesgo/flags.ts).
    RISK_RADAR_ENABLED: 'true',
    HAZARD_CONTEXT_ENABLED: 'true',
    SEASONAL_ENABLED: 'true',
    SITUACION_ENABLED: 'true',
    RISK_ENGINE_ENABLED: 'true',
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

  console.log(`MAPA E2E isolated runtime: ${project}; data: ${data}; browser base: ${baseURL}; sin-radar: http://127.0.0.1:${sinRadarPort}`)
  await run(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], project, env)
  await run(process.execPath, ['e2e/mapa-enos/seed/index.mjs'], project, env)

  const playwright = await Promise.race([
    execute(
      process.execPath,
      [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=e2e/mapa-enos/playwright.config.ts', ...playwrightArgs],
      { cwd: project, env },
    ),
    interrupted,
  ])
  exitCode = playwright.status ?? 1
} catch (error) {
  console.error(`MAPA E2E failed: ${error.message}`)
  // 128 + signal number, the shell convention for a signal exit.
  exitCode = error.signal ? 128 + os.constants.signals[error.signal] : 1
} finally {
  // MAPA_E2E_KEEP_DIR copies Playwright output (html report, artifacts) before the workspace is deleted.
  if (keepDir && project) {
    await cp(path.join(project, 'e2e/mapa-enos'), keepDir, { recursive: true, force: true, filter: (source) => !source.includes(`${path.sep}node_modules`) })
      .catch((error) => console.error(`keep results failed: ${error.message}`))
  }
  // Explicit snapshot update: copy the rewritten snapshots back into the repository before the workspace is deleted.
  if (process.env.MAPA_E2E_ACTUALIZAR_SNAPSHOTS === '1' && project) {
    const origen = path.join(project, 'e2e/mapa-enos/contratos/snapshots')
    const destino = path.join(root, 'e2e/mapa-enos/contratos/snapshots')
    await mkdir(destino, { recursive: true })
    await cp(origen, destino, { recursive: true, force: true })
      .then(() => console.log(`MAPA E2E snapshots copied to ${destino}`))
      .catch((error) => {
        if (error.code === 'ENOENT') console.log('MAPA E2E: no snapshots were written; nothing copied')
        else console.error(`copy snapshots failed: ${error.message}`)
      })
  }
  if (state.container) docker(['rm', '-f', state.container], { stdio: 'ignore' })
  if (workspace) await rm(workspace, { recursive: true, force: true })
}

process.exitCode = exitCode
