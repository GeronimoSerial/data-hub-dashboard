import { spawn } from 'node:child_process'
import path from 'node:path'

const project = process.env.T8_E2E_RUNTIME_ROOT
if (!project) throw new Error('T8_E2E_RUNTIME_ROOT is required')
const standaloneServer = path.join(project, '.next/standalone/server.js')
const child = spawn(process.execPath, [standaloneServer], {
  cwd: project,
  env: {
    ...process.env,
    PORT: process.env.T8_E2E_PORT ?? '3118',
    HOSTNAME: '127.0.0.1',
  },
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
