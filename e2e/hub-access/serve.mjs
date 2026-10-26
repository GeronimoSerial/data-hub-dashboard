import { spawn } from 'node:child_process'
import path from 'node:path'

const project = process.env.HUB_E2E_RUNTIME_ROOT
if (!project) throw new Error('HUB_E2E_RUNTIME_ROOT is required')
const next = path.join(project, 'node_modules/next/dist/bin/next')
const child = spawn(process.execPath, [next, 'start', '-p', process.env.HUB_E2E_PORT ?? '3101'], {
  cwd: project,
  env: process.env,
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
