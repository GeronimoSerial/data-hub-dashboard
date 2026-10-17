import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('valida la operación Coolify con API simulada y la sintaxis del retirador systemd', () => {
  expect(() => execFileSync('python3', ['-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_radar_operacion.py'], { stdio: 'pipe', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })).not.toThrow()
  expect(() => execFileSync('sh', ['-n', 'deploy/systemd/ops1/desactivar-productores-radar.sh'])).not.toThrow()
})

import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

it('retira los timers con prefijo Coolify terminado en guion y rechaza otros entornos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'radar-systemd-'))
  const log = join(dir, 'commands')
  const envFile = join(dir, 'ops.env')
  try {
    const script = readFileSync('deploy/systemd/ops1/desactivar-productores-radar.sh', 'utf8')
      .replaceAll('/etc/enos-ops1/enos-ops1.env', envFile)
    writeFileSync(join(dir, 'retirar.sh'), script)
    for (const name of ['systemctl', 'rm']) {
      writeFileSync(join(dir, name), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$RADAR_TEST_LOG"\n', { mode: 0o755 })
    }
    const env = { ...process.env, PATH: dir + ':' + process.env.PATH, RADAR_TEST_LOG: log }
    writeFileSync(envFile, 'CONTENEDOR_PREFIJO=j3zm0co4bi9iy0c70nv3vinf-\n')
    execFileSync('sh', [join(dir, 'retirar.sh'), 'j3zm0co4bi9iy0c70nv3vinf'], { env })
    const commands = readFileSync(log, 'utf8')
    for (const job of ['sync-radar-meteo', 'verificar-radar-meteo', 'sync-radar-ensemble']) {
      expect(commands).toContain(`disable --now enos-ops1-${job}.timer`)
      expect(commands).toContain(`stop enos-ops1@${job}.service`)
    }
    expect(commands).not.toContain('sync-smn-alertas')
    writeFileSync(log, '')
    writeFileSync(envFile, 'CONTENEDOR_PREFIJO=pts681lz0kazhs1dph8wjaxt-\n')
    expect(() => execFileSync('sh', [join(dir, 'retirar.sh'), 'j3zm0co4bi9iy0c70nv3vinf'], { env, stdio: 'pipe' })).toThrow()
    expect(readFileSync(log, 'utf8')).not.toContain('disable')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
