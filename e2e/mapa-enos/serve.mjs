import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// This file lives in <project>/e2e/mapa-enos, so the project root is two levels up.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const port = process.env.MAPA_E2E_PORT ?? '3201'
const sinRadar = process.env.MAPA_E2E_SIN_RADAR === '1'

const env = {
  ...process.env,
  // Better Auth only trusts its own base URL, so each server must advertise its own origin.
  BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
}
if (sinRadar) delete env.RISK_RADAR_ENABLED

const next = path.join(projectRoot, 'node_modules/next/dist/bin/next')
const child = spawn(process.execPath, [next, 'start', '-p', port], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
