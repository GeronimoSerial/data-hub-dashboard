import { spawnSync } from 'node:child_process'
import { cp, mkdir, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const workspace = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), 'cuadernillos-t8-')))
const project = path.join(workspace, 'project')
const data = path.join(workspace, 'data')
const port = process.env.T8_E2E_PORT ?? '3118'
const baseURL = `http://127.0.0.1:${port}`
const env = {
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? os.homedir(),
  LANG: process.env.LANG ?? 'C.UTF-8',
  CI: '1',
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  // Keep the isolated build offline; the layout's production Google Fonts are
  // replaced with a local font fixture by Next's documented test hook.
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.join(project, 'e2e/cuadernillos/font-responses.cjs'),
  T8_E2E_MOCK_FONT_PATH: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  // Next defaults to one static worker per host CPU. Concurrent workers open
  // the same persisted PGlite fixture during prerender; serialize that build.
  CIRCLE_NODE_TOTAL: '2',
  DATA_DIR: data,
  DATABASE_URL: '',
  BETTER_AUTH_URL: baseURL,
  BETTER_AUTH_SECRET: `t8-isolated-${crypto.randomUUID()}-${crypto.randomUUID()}`,
  T8_E2E_RUNTIME_ROOT: project,
  T8_E2E_PORT: port,
  T8_E2E_BASE_URL: baseURL,
  T8_PLANNING_PASSWORD: `Planning-${crypto.randomUUID()}-Aa9!`,
  T8_CABECERA_PASSWORD: `Cabecera-${crypto.randomUUID()}-Aa9!`,
  T8_SUPERVISOR_PASSWORD: `Supervisor-${crypto.randomUUID()}-Aa9!`,
  OBS_BUCKET: '', OBS_REGION: '', OBS_ENDPOINT: '', OBS_ACCESS_KEY_ID: '', OBS_SECRET_ACCESS_KEY: '',
  AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', GE_SSO_SHARED_SECRET: '', GE_SSO_SHARED_KEY: '',
}

function explicitPostgresTarget(value) {
  let target
  try { target = new URL(value) } catch {
    throw new Error('T8_E2E_PG_URL must be an explicit local Unix-socket PostgreSQL URI')
  }
  const database = decodeURIComponent(target.pathname.slice(1))
  const socket = target.searchParams.get('host')
  const allowedSocketRoots = [
    path.resolve(os.tmpdir(), 'cuadernillos-pg-proof-'),
    path.resolve(os.tmpdir(), 'cuadernillos-pg-e2e.'),
  ]
  const socketRelativePath = socket ? path.relative(os.tmpdir(), socket) : ''
  const socketRoot = allowedSocketRoots.find((root) => socket?.startsWith(root))
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || target.hostname !== 'localhost'
    || target.password !== ''
    || database !== 'cuadernillos_e2e'
    || !socketRoot
    || socketRelativePath.startsWith('..')
    || !socketRelativePath.split(path.sep)[0]?.startsWith(path.basename(socketRoot))
    || path.resolve(socket) !== socket
    || !/^\d+$/.test(target.searchParams.get('port') ?? '')
    || [...target.searchParams.keys()].some((key) => !['host', 'port'].includes(key))) {
    throw new Error('T8_E2E_PG_URL must target the disposable cuadernillos_e2e database through its /tmp Unix socket')
  }
  return socket
}

const postgresUrl = process.env.T8_E2E_PG_URL ?? ''
const postgresSocket = postgresUrl ? explicitPostgresTarget(postgresUrl) : null

function run(command, args, cwd, extraEnv = env) {
  const result = spawnSync(command, args, { cwd, env: extraEnv, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.error}`)
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
      return !segments.some((part) => part.startsWith('.env'))
    },
  })
  await symlink(path.join(root, 'node_modules'), path.join(project, 'node_modules'), 'dir')

  console.log(`T8 isolated project: ${project}; throwaway data: ${data}; base URL: ${baseURL}`)
  run(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], project)
  await mkdir(path.join(project, '.next/standalone/.next/static'), { recursive: true })
  await cp(path.join(project, '.next/static'), path.join(project, '.next/standalone/.next/static'), { recursive: true })
  await cp(path.join(project, 'public'), path.join(project, '.next/standalone/public'), { recursive: true })
  // Drizzle resolves migrations relative to the standalone server's cwd; the
  // file tracer cannot see the runtime-selected migrationsFolder string.
  await cp(path.join(project, 'drizzle'), path.join(project, '.next/standalone/drizzle'), { recursive: true })
  run(process.execPath, ['e2e/cuadernillos/seed.mjs'], project)
  run(process.execPath, [
    path.join(root, 'node_modules/@playwright/test/cli.js'), 'test',
    '--config=e2e/cuadernillos/playwright.config.mjs', '--grep', '@pglite-smoke',
  ], project)

  if (postgresUrl) {
    const postgresEnv = {
      ...env,
      DATABASE_URL: postgresUrl,
      T8_E2E_PG_SOCKET: postgresSocket ?? '',
    }
    run(process.execPath, ['e2e/cuadernillos/seed.mjs'], project, postgresEnv)
    run(process.execPath, [
      path.join(root, 'node_modules/@playwright/test/cli.js'), 'test',
      '--config=e2e/cuadernillos/playwright.config.mjs', '--grep', '@postgres-workflow',
    ], project, postgresEnv)
  }
} finally {
  if (process.env.T8_E2E_KEEP_DIR) {
    await cp(path.join(project, 'e2e/cuadernillos/.results'), process.env.T8_E2E_KEEP_DIR, { recursive: true, force: true })
      .catch((error) => console.error(`keep results failed: ${error.message}`))
  }
  await rm(workspace, { recursive: true, force: true })
}
