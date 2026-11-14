import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const temporales: string[] = []

afterEach(() => {
  for (const dir of temporales.splice(0)) rmSync(dir, { recursive: true, force: true })
})

it('resuelve un alias @/ que ya apunta a un archivo .mjs existente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ts-resolver-mjs-'))
  temporales.push(dir)
  mkdirSync(join(dir, 'lib'))
  writeFileSync(join(dir, 'lib', 'contratos.mjs'), 'export default "mjs"')
  writeFileSync(
    join(dir, 'runner.mjs'),
    `import { registerTsResolver } from ${JSON.stringify(new URL('./register-ts-resolver.mjs', import.meta.url).href)}
registerTsResolver(${JSON.stringify(dir)})
const mod = await import('@/lib/contratos.mjs')
console.log(mod.default)`,
  )

  const stdout = execFileSync(process.execPath, [join(dir, 'runner.mjs')], { encoding: 'utf8' })

  expect(stdout.trim()).toBe('mjs')
})
