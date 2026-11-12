import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Proof that ONE build runs Corrientes and an empty Manaos. Nothing here touches real Manaos infrastructure.
// Not part of CI yet. See e2e/region-manaos/README.md.
// REGION_PROOF_MODE=standalone (default): the same build artifact as the Dockerfile runner stage, run as plain Node processes.
// REGION_PROOF_MODE=docker: the repository Dockerfile image.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ATLANTIDA_EXIT_TIMEOUT_MS = 60_000
const BOOT_TIMEOUT_MS = 240_000
const SEED_TIMEOUT_MS = 300_000
const JOB_TIMEOUT_MS = 90_000
const BUILD_NODE_OPTIONS = '--max-old-space-size=6144'
const DATABASES = ['region_manaos', 'region_corrientes', 'region_atlantida']
// Empty database used only by the build's DATABASE_URL (standalone mode).
const BUILD_DATABASE = 'build'
// Real job from lib/infraestructura/riesgo/jobs-esperados.ts; it applies to corrientes and not to manaos (no Prefectura).
const JOB_PREFECTURA = 'sync-prefectura-alturas'
const PASS_THROUGH_ENV = ['PNPM_HOME', 'COREPACK_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME']
const COPY_SKIP = ['.git', '.next', '.data', '.codegraph', 'node_modules', 'coverage', '.turbo', '.results']
const MODE = process.env.REGION_PROOF_MODE ?? 'standalone'
const RUN_ID = randomBytes(4).toString('hex')
const PREFIX = `enos-region-${RUN_ID}`
// Extra arguments go to Playwright: pnpm test:e2e:region -- --grep health
const playwrightArgs = process.argv.slice(2)
if (playwrightArgs[0] === '--') playwrightArgs.shift()

if (!['standalone', 'docker'].includes(MODE)) {
  console.error(`region proof: REGION_PROOF_MODE must be "standalone" or "docker", got "${MODE}"`)
  process.exit(1)
}

class Fatal extends Error {}

const state = {
  image: null,
  imageBuilt: false,
  containers: [],
  network: null,
  tmp: null,
  child: null,
  procs: [],
  buildDir: null,
  buildOwned: false,
  runner: null,
}

const secret = () => randomBytes(24).toString('hex')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function docker(args, options = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', ...options })
}

function dockerOk(args, what) {
  const result = docker(args)
  if (result.status !== 0) throw new Error(`${what} failed: ${(result.stderr || '').trim()}`)
  return result.stdout.trim()
}

function logsOf(name) {
  const result = docker(['logs', name])
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

// Polls `check` until it returns true. A Fatal error aborts at once; any other error counts as "not ready yet".
async function waitFor(description, timeoutMs, check) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch (error) {
      if (error instanceof Fatal) throw error
      lastError = error
    }
    await sleep(1000)
  }
  const detail = lastError ? ` (last error: ${lastError.message})` : ''
  throw new Error(`${description}: not ready after ${Math.round(timeoutMs / 1000)} s${detail}`)
}

// Env files keep secrets out of `docker run` arguments and therefore out of the host process list.
function writeEnvFile(name, values) {
  const file = path.join(state.tmp, `${name}.env`)
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`)
  writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 })
  chmodSync(file, 0o600)
  return file
}

// SIGKILL to the whole group: Next forks workers that outlive their leader if only the leader is signalled.
function killProcessGroup(child) {
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // Group already gone.
  }
}

function removeEverything() {
  for (const name of state.containers) docker(['rm', '-f', name], { stdio: 'ignore' })
  if (state.network) docker(['network', 'rm', state.network], { stdio: 'ignore' })
  if (state.imageBuilt && process.env.REGION_PROOF_KEEP_IMAGE !== '1') {
    docker(['image', 'rm', '-f', state.image], { stdio: 'ignore' })
  }
  for (const proc of state.procs) killProcessGroup(proc.child)
  // A build dir this run copied and built is removed unless kept; a dir passed in REGION_PROOF_BUILD_DIR is never removed.
  if (state.buildOwned && process.env.REGION_PROOF_KEEP_BUILD !== '1') rmSync(state.buildDir, { recursive: true, force: true })
  if (state.tmp) rmSync(state.tmp, { recursive: true, force: true })
  state.containers = []
  state.network = null
  state.tmp = null
  state.imageBuilt = false
  state.procs = []
  state.buildDir = null
  state.buildOwned = false
  state.runner = null
}

// Signals must not skip cleanup: stop the Playwright child, remove the containers, network, image and temp dirs, then exit.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    state.child?.kill(signal)
    removeEverything()
    process.exit(128 + os.constants.signals[signal])
  })
}

function buildImage() {
  if (process.env.REGION_PROOF_IMAGE) {
    state.image = process.env.REGION_PROOF_IMAGE
    console.log(`region proof: reusing image ${state.image}`)
    return
  }
  state.image = `enos-region-proof:${RUN_ID}`
  state.imageBuilt = true
  console.log(`region proof: building ${state.image} from the repository Dockerfile`)
  const result = spawnSync('docker', ['build', '-t', state.image, '.'], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`docker build failed with ${result.status}`)
}

async function startPostgres() {
  const name = `${PREFIX}-pg`
  const password = secret()
  const envFile = writeEnvFile('postgres', { POSTGRES_PASSWORD: password })
  state.containers.push(name)
  dockerOk(['run', '-d', '--name', name, '--network', state.network, '--env-file', envFile, 'postgres:16'], 'docker run postgres')

  // TCP probe: the image's temporary init server listens on a unix socket only.
  await waitFor('PostgreSQL', 120_000, () => {
    return docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { stdio: 'ignore' }).status === 0
  })
  // The password is read from the container's own environment, so it never appears in host process arguments.
  for (const database of DATABASES) {
    const sql = `CREATE DATABASE ${database}`
    dockerOk(
      ['exec', name, 'sh', '-c', `PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -c "${sql}"`],
      `create database ${database}`,
    )
  }
  return { name, password }
}

function appEnv({ databaseUrl, port, admin, region }) {
  const values = {
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    BETTER_AUTH_SECRET: secret(),
    ADMIN_EMAIL: admin.email,
    ADMIN_PASSWORD: admin.password,
    // Same feature flags the mapa E2E sets, so the Situation Center and risk pages are reachable.
    RISK_RADAR_ENABLED: 'true',
    HAZARD_CONTEXT_ENABLED: 'true',
    SEASONAL_ENABLED: 'true',
    SITUACION_ENABLED: 'true',
    RISK_ENGINE_ENABLED: 'true',
  }
  // REGION unset must stay unset: the app's default (corrientes) is part of what is proven.
  if (region !== undefined) values.REGION = region
  return values
}

function startApp({ name, port, region, databaseName, postgres, admin, publish }) {
  const databaseUrl = `postgres://postgres:${postgres.password}@${postgres.name}:5432/${databaseName}`
  const envFile = writeEnvFile(name, appEnv({ databaseUrl, port, admin, region }))
  state.containers.push(name)
  const args = ['run', '-d', '--name', name, '--network', state.network, '--env-file', envFile]
  if (publish) args.push('-p', `127.0.0.1:${port}:3000`)
  args.push(state.image)
  dockerOk(args, `docker run ${name}`)
}

async function waitHealthy(name, port) {
  const base = `http://127.0.0.1:${port}`
  await waitFor(`${name} /api/health`, BOOT_TIMEOUT_MS, async () => {
    if (docker(['inspect', '-f', '{{.State.Running}}', name]).stdout.trim() !== 'true') {
      throw new Fatal(`${name} stopped during boot:\n${logsOf(name).slice(-2000)}`)
    }
    const response = await fetch(`${base}/api/health`).catch(() => null)
    if (!response?.ok) return false
    const body = await response.json().catch(() => null)
    return body?.ok === true
  })
}

// The first unauthenticated call to the map route runs ensureSeeded() before the ACL check (lib/infraestructura/mapa-ruta.ts).
// That creates the one admin from ADMIN_EMAIL/ADMIN_PASSWORD and the app's own catalog. It inserts no schools and no jobs.
async function warmSeed(name, port) {
  const url = `http://127.0.0.1:${port}/api/mapas/infraestructura`
  await waitFor(`${name} first-admin seed`, SEED_TIMEOUT_MS, async () => {
    const response = await fetch(url)
    return response.status < 500
  })
}

// Invalid REGION must stop the container before it serves traffic (instrumentation.ts -> regionActiva()).
function expectBootRefusal(name) {
  const started = Date.now()
  const wait = spawnSync('docker', ['wait', name], { encoding: 'utf8', timeout: ATLANTIDA_EXIT_TIMEOUT_MS })
  if (wait.error || wait.status !== 0) {
    throw new Error(`${name} did not exit within ${ATLANTIDA_EXIT_TIMEOUT_MS / 1000} s. Logs tail:\n${logsOf(name).slice(-2000)}`)
  }
  const exitCode = Number.parseInt(wait.stdout.trim(), 10)
  const logs = logsOf(name)
  if (exitCode === 0) throw new Error(`${name} exited with 0; an invalid REGION must fail boot`)
  if (!logs.includes('REGION desconocida')) {
    throw new Error(`${name} exited ${exitCode} without "REGION desconocida". Logs tail:\n${logs.slice(-2000)}`)
  }
  console.log(`region proof: ${name} refused boot with exit ${exitCode} in ${Date.now() - started} ms`)
}

function baseEnv() {
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? os.homedir(),
    LANG: process.env.LANG ?? 'C.UTF-8',
    TMPDIR: os.tmpdir(),
  }
  for (const name of PASS_THROUGH_ENV) if (process.env[name]) env[name] = process.env[name]
  return env
}

function tail(file) {
  return existsSync(file) ? readFileSync(file, 'utf8').slice(-2000) : '(no log)'
}

// ---- standalone mode: the Dockerfile runner stage as plain Node processes ----

// Copies the repo, installs and builds once. REGION_PROOF_BUILD_DIR reuses a previous build dir and skips both steps.
function prepareBuild(buildDatabaseUrl) {
  const reuse = process.env.REGION_PROOF_BUILD_DIR
  if (reuse) {
    if (!existsSync(path.join(reuse, '.next/standalone/server.js'))) {
      throw new Error(`REGION_PROOF_BUILD_DIR has no .next/standalone/server.js: ${reuse}`)
    }
    state.buildDir = reuse
    console.log(`region proof: reusing build ${reuse}`)
    return
  }

  const build = mkdtempSync(path.join(os.tmpdir(), 'region-proof-build-'))
  state.buildDir = build
  state.buildOwned = true
  console.log(`region proof: building in throwaway copy ${build}`)
  // No symlinked node_modules: Next's trace must find every runtime dependency inside the copy, as the image does.
  cpSync(root, build, {
    recursive: true,
    verbatimSymlinks: true,
    filter(source) {
      const relative = path.relative(root, source)
      if (!relative) return true
      const segments = relative.split(path.sep)
      return !segments.some((part) => COPY_SKIP.includes(part) || part.startsWith('.env'))
    },
  })

  const install = spawnSync('pnpm', ['install', '--frozen-lockfile'], {
    cwd: build,
    env: { ...baseEnv(), CI: '1' },
    stdio: 'inherit',
  })
  if (install.status !== 0) throw new Error(`pnpm install failed with ${install.status ?? install.signal}`)

  const built = spawnSync('pnpm', ['build'], {
    cwd: build,
    env: {
      ...baseEnv(),
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      DATABASE_URL: buildDatabaseUrl,
      // Throwaway values: the build logs a Better Auth default-secret error during static generation otherwise.
      BETTER_AUTH_SECRET: secret(),
      BETTER_AUTH_URL: 'http://127.0.0.1:3000',
      NODE_OPTIONS: BUILD_NODE_OPTIONS,
    },
    stdio: 'inherit',
  })
  if (built.status !== 0) throw new Error(`pnpm build failed with ${built.status ?? built.signal}`)
  if (!existsSync(path.join(build, '.next/standalone/server.js'))) throw new Error('pnpm build left no .next/standalone/server.js')
}

// Same set as the Dockerfile runner stage (lines 45-67). Nothing else from the repo is copied.
function assembleRunner(build, runner) {
  mkdirSync(runner, { recursive: true })
  const copy = (from, to = from) => {
    mkdirSync(path.dirname(path.join(runner, to)), { recursive: true })
    cpSync(path.join(build, from), path.join(runner, to), { recursive: true, verbatimSymlinks: true })
  }
  copy('public')
  for (const entry of readdirSync(path.join(build, '.next/standalone'))) {
    cpSync(path.join(build, '.next/standalone', entry), path.join(runner, entry), { recursive: true, verbatimSymlinks: true })
  }
  copy('.next/static')
  for (const entry of ['scripts', 'config', 'lib', 'tsconfig.json', 'drizzle', 'LICENSE', 'THIRD-PARTY-NOTICES.md']) copy(entry)

  // Dockerfile dbtools stage: operation scripts need these packages next to the runner, not the traced server bundle.
  const tools = path.join(runner, '.dbtools')
  mkdirSync(tools, { recursive: true })
  writeFileSync(path.join(tools, 'package.json'), JSON.stringify({ name: 'dbtools', version: '1.0.0', private: true }))
  const install = spawnSync(
    'npm',
    ['install', '--omit=dev', '--no-audit', '--no-fund', 'drizzle-orm@0.45.2', 'zod@4.4.3', '@electric-sql/pglite@0.5.8', 'h5wasm@0.10.3'],
    { cwd: tools, env: baseEnv(), stdio: 'inherit' },
  )
  if (install.status !== 0) throw new Error(`npm install of dbtools failed with ${install.status ?? install.signal}`)
  cpSync(path.join(tools, 'node_modules'), path.join(runner, 'node_modules'), { recursive: true, verbatimSymlinks: true })
  rmSync(tools, { recursive: true, force: true })
}

// Creates the given empty databases in a running container (password read from its own environment).
function createDatabases(name, databases) {
  for (const database of databases) {
    dockerOk(
      ['exec', name, 'sh', '-c', `PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${database}"`],
      `create database ${database}`,
    )
  }
}

// Started before the build: Next's static generation needs a DATABASE_URL, and PGlite (no URL) breaks with 27 workers.
async function startPostgresOnHostPort() {
  const name = `${PREFIX}-pg`
  const password = secret()
  const envFile = writeEnvFile('postgres', { POSTGRES_PASSWORD: password })
  state.containers.push(name)
  // No shared network: the host reaches the container through a published loopback port.
  dockerOk(['run', '-d', '--name', name, '-p', '127.0.0.1::5432', '--env-file', envFile, 'postgres:16'], 'docker run postgres')
  const portLine = dockerOk(['port', name, '5432']).split('\n')[0] ?? ''
  const port = portLine.slice(portLine.lastIndexOf(':') + 1).trim()
  if (!port) throw new Error(`could not read the host port of ${name}`)

  await waitFor('PostgreSQL', 120_000, () => {
    return docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { stdio: 'ignore' }).status === 0
  })
  createDatabases(name, [BUILD_DATABASE])
  return { name, password, port }
}

// Same env as the docker mode, from a clean base (no inherited REGION). Logs go to a file under the temp dir.
function spawnServer({ name, port, region, databaseName, postgres, admin, runner }) {
  const databaseUrl = `postgres://postgres:${postgres.password}@127.0.0.1:${postgres.port}/${databaseName}`
  const dataDir = path.join(state.tmp, 'data', name)
  mkdirSync(path.join(dataDir, 'uploads'), { recursive: true })
  // Server stdout and stderr go to the screenshots dir, which survives cleanup, so server-side errors can be read after the run.
  const logsDir = path.join(shots, 'logs')
  mkdirSync(logsDir, { recursive: true })
  const log = path.join(logsDir, `${name}.log`)
  const fd = openSync(log, 'w')
  const env = {
    ...baseEnv(),
    ...appEnv({ databaseUrl, port, admin, region }),
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    DATA_DIR: dataDir,
  }
  const child = spawn(process.execPath, ['server.js'], { cwd: runner, env, detached: true, stdio: ['ignore', fd, fd] })
  closeSync(fd)
  const proc = { name, child, log, port }
  state.procs.push(proc)
  return proc
}

async function waitHealthyProcess(proc) {
  await waitFor(`${proc.name} /api/health`, BOOT_TIMEOUT_MS, async () => {
    if (proc.child.exitCode !== null || proc.child.signalCode !== null) {
      throw new Fatal(`${proc.name} stopped during boot:\n${tail(proc.log)}`)
    }
    const response = await fetch(`http://127.0.0.1:${proc.port}/api/health`).catch(() => null)
    if (!response?.ok) return false
    const body = await response.json().catch(() => null)
    return body?.ok === true
  })
}

// Runs the real CLI from the runner dir: proves config/ is readable from the runner layout.
function runJob({ runner, region, databaseUrl }) {
  const env = { ...baseEnv(), NODE_ENV: 'production', DATABASE_URL: databaseUrl }
  if (region !== undefined) env.REGION = region
  return spawnSync(process.execPath, ['scripts/jobs.mjs', JOB_PREFECTURA], {
    cwd: runner,
    env,
    encoding: 'utf8',
    timeout: JOB_TIMEOUT_MS,
  })
}

function checkJobs({ runner, postgres }) {
  const manaosUrl = `postgres://postgres:${postgres.password}@127.0.0.1:${postgres.port}/region_manaos`
  const corrientesUrl = `postgres://postgres:${postgres.password}@127.0.0.1:${postgres.port}/region_corrientes`

  const manaos = runJob({ runner, region: 'manaos', databaseUrl: manaosUrl })
  if (manaos.error) throw new Error(`jobs.mjs (REGION=manaos) could not run: ${manaos.error.message}`)
  if (manaos.status !== 2 || !manaos.stderr.includes('does not apply to region manaos')) {
    throw new Error(`REGION=manaos ${JOB_PREFECTURA} must exit 2 with "does not apply to region manaos"; got ${manaos.status}:\n${manaos.stderr.slice(-2000)}`)
  }
  console.log(`region proof: ${JOB_PREFECTURA} with REGION=manaos exit 2 from the runner dir`)

  // REGION unset means corrientes: the job may still fail later (network, DB), but never on config lookup.
  const corrientes = runJob({ runner, region: undefined, databaseUrl: corrientesUrl })
  if (corrientes.error && corrientes.error.code !== 'ETIMEDOUT') {
    throw new Error(`jobs.mjs (REGION unset) could not run: ${corrientes.error.message}`)
  }
  const stderr = corrientes.stderr ?? ''
  if (stderr.includes('REGION desconocida') || stderr.includes('does not apply')) {
    throw new Error(`REGION unset ${JOB_PREFECTURA} failed on config lookup:\n${stderr.slice(-2000)}`)
  }
  console.log(
    `region proof: ${JOB_PREFECTURA} with REGION unset did not fail on config (status ${corrientes.status ?? 'timeout'}${corrientes.error ? ', timed out' : ''})`,
  )
}

function waitForExit(proc) {
  return new Promise((resolve) => {
    if (proc.child.exitCode !== null || proc.child.signalCode !== null) return resolve(true)
    const timer = setTimeout(() => resolve(false), ATLANTIDA_EXIT_TIMEOUT_MS)
    proc.child.once('exit', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

async function expectBootRefusalProcess(proc) {
  const started = Date.now()
  if (!(await waitForExit(proc))) {
    throw new Error(`${proc.name} did not exit within ${ATLANTIDA_EXIT_TIMEOUT_MS / 1000} s. Logs tail:\n${tail(proc.log)}`)
  }
  const exitCode = proc.child.exitCode
  const logs = readFileSync(proc.log, 'utf8')
  if (exitCode === null) throw new Error(`${proc.name} ended by signal ${proc.child.signalCode}, not by a boot refusal:\n${logs.slice(-2000)}`)
  if (exitCode === 0) throw new Error(`${proc.name} exited with 0; an invalid REGION must fail boot`)
  if (!logs.includes('REGION desconocida')) {
    throw new Error(`${proc.name} exited ${exitCode} without "REGION desconocida". Logs tail:\n${logs.slice(-2000)}`)
  }
  console.log(`region proof: ${proc.name} refused boot with exit ${exitCode} in ${Date.now() - started} ms`)
}

async function proveStandalone() {
  const admin = { email: 'region-admin@e2e.local', password: secret() }
  const postgres = await startPostgresOnHostPort()
  prepareBuild(`postgres://postgres:${postgres.password}@127.0.0.1:${postgres.port}/${BUILD_DATABASE}`)
  state.runner = path.join(state.tmp, 'runner')
  assembleRunner(state.buildDir, state.runner)
  console.log(`region proof: runner dir ${state.runner} (Dockerfile runner stage layout)`)
  createDatabases(postgres.name, DATABASES)
  const manaosPort = await freePort()
  const corrientesPort = await freePort()
  const atlantidaPort = await freePort()
  const runner = state.runner

  const manaos = spawnServer({ name: `${PREFIX}-manaos`, port: manaosPort, region: 'manaos', databaseName: 'region_manaos', postgres, admin, runner })
  const corrientes = spawnServer({ name: `${PREFIX}-corrientes`, port: corrientesPort, region: undefined, databaseName: 'region_corrientes', postgres, admin, runner })
  await waitHealthyProcess(manaos)
  await waitHealthyProcess(corrientes)
  await warmSeed(manaos.name, manaosPort)
  await warmSeed(corrientes.name, corrientesPort)
  checkJobs({ runner, postgres })

  // Same runner, invalid region: must refuse to boot. No traffic is sent to it.
  const atlantida = spawnServer({ name: `${PREFIX}-atlantida`, port: atlantidaPort, region: 'atlantida', databaseName: 'region_atlantida', postgres, admin, runner })
  await expectBootRefusalProcess(atlantida)

  return { admin, manaosPort, corrientesPort }
}

// ---- docker mode: the repository Dockerfile image ----

async function proveDocker() {
  buildImage()

  state.network = `${PREFIX}-net`
  dockerOk(['network', 'create', state.network], 'docker network create')
  const admin = { email: 'region-admin@e2e.local', password: secret() }
  const postgres = await startPostgres()

  const manaosPort = await freePort()
  const corrientesPort = await freePort()
  const atlantidaPort = await freePort()
  const manaosName = `${PREFIX}-manaos`
  const corrientesName = `${PREFIX}-corrientes`
  const atlantidaName = `${PREFIX}-atlantida`

  startApp({ name: manaosName, port: manaosPort, region: 'manaos', databaseName: 'region_manaos', postgres, admin, publish: true })
  startApp({ name: corrientesName, port: corrientesPort, region: undefined, databaseName: 'region_corrientes', postgres, admin, publish: true })
  await waitHealthy(manaosName, manaosPort)
  await waitHealthy(corrientesName, corrientesPort)
  await warmSeed(manaosName, manaosPort)
  await warmSeed(corrientesName, corrientesPort)

  // Same image, invalid region: must refuse to boot. No published port, no traffic.
  startApp({ name: atlantidaName, port: atlantidaPort, region: 'atlantida', databaseName: 'region_atlantida', postgres, admin, publish: false })
  expectBootRefusal(atlantidaName)

  return { admin, manaosPort, corrientesPort }
}

function runPlaywright(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=e2e/region-manaos/playwright.config.ts', ...playwrightArgs],
      { cwd: root, env, stdio: 'inherit' },
    )
    state.child = child
    child.once('error', reject)
    child.once('exit', (status, signal) => {
      state.child = null
      resolve(status ?? (signal ? 128 + os.constants.signals[signal] : 1))
    })
  })
}

let exitCode = 1
const shots = process.env.REGION_PROOF_SHOTS || mkdtempSync(path.join(os.tmpdir(), 'region-proof-shots-'))

try {
  state.tmp = mkdtempSync(path.join(os.tmpdir(), `${PREFIX}-`))
  mkdirSync(shots, { recursive: true })

  const { admin, manaosPort, corrientesPort } = MODE === 'docker' ? await proveDocker() : await proveStandalone()

  const env = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? os.homedir(),
    LANG: process.env.LANG ?? 'C.UTF-8',
    TMPDIR: os.tmpdir(),
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH } : {}),
    CI: '1',
    REGION_PROOF_MANAOS_URL: `http://127.0.0.1:${manaosPort}`,
    REGION_PROOF_CORRIENTES_URL: `http://127.0.0.1:${corrientesPort}`,
    REGION_PROOF_ADMIN_EMAIL: admin.email,
    REGION_PROOF_ADMIN_PASSWORD: admin.password,
    REGION_PROOF_SHOTS: shots,
  }
  console.log(`region proof (${MODE}): manaos ${env.REGION_PROOF_MANAOS_URL}, corrientes ${env.REGION_PROOF_CORRIENTES_URL}, screenshots ${shots}`)
  exitCode = await runPlaywright(env)
} catch (error) {
  console.error(`region proof failed: ${error.message}`)
  exitCode = 1
} finally {
  if (state.buildDir && (!state.buildOwned || process.env.REGION_PROOF_KEEP_BUILD === '1')) {
    console.log(`region proof: build kept at ${state.buildDir} (rerun with REGION_PROOF_BUILD_DIR=${state.buildDir})`)
  }
  for (const proc of state.procs) console.log(`region proof: ${proc.name} server log ${proc.log}`)
  removeEverything()
  console.log(`region proof: screenshots kept in ${shots}`)
}

process.exitCode = exitCode
