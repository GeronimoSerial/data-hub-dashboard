import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('valida la operación Coolify con API simulada y la sintaxis del retirador systemd', () => {
  expect(() => execFileSync('python3', ['-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_radar_operacion.py'], { stdio: 'pipe', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })).not.toThrow()
  expect(() => execFileSync('sh', ['-n', 'deploy/systemd/ops1/desactivar-productores-radar.sh'])).not.toThrow()
})
