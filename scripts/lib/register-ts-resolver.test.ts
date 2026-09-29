import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const temporales: string[] = []

afterEach(() => {
  for (const dir of temporales.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('registerTsResolver', () => {
  it('resuelve imports relativos, alias @/, rutas absolutas e index.ts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-resolver-'))
    temporales.push(dir)
    mkdirSync(join(dir, 'lib'))
    mkdirSync(join(dir, 'nested'))
    writeFileSync(join(dir, 'lib', 'alias.ts'), 'export default "alias"')
    writeFileSync(join(dir, 'nested', 'relative.ts'), 'export default "relative"')
    writeFileSync(join(dir, 'nested', 'index.ts'), 'export default "index"')
    writeFileSync(join(dir, 'absolute.ts'), 'export default "absolute"')
    writeFileSync(
      join(dir, 'runner.mjs'),
      `import { registerTsResolver } from ${JSON.stringify(
        new URL('./register-ts-resolver.mjs', import.meta.url).href,
      )}
registerTsResolver(${JSON.stringify(dir)})
const alias = await import('@/lib/alias')
const relative = await import('./nested/relative')
const index = await import('./nested')
const absolute = await import(${JSON.stringify(join(dir, 'absolute'))})
console.log([alias.default, relative.default, index.default, absolute.default].join(','))`,
    )

    const stdout = execFileSync(process.execPath, [join(dir, 'runner.mjs')], { encoding: 'utf8' })

    expect(stdout.trim()).toBe('alias,relative,index,absolute')
  })

  it('prioriza archivos sin extensión y rechaza directorios en modo estricto', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-resolver-files-'))
    temporales.push(dir)
    mkdirSync(join(dir, 'folder.ts'))
    writeFileSync(join(dir, 'folder.ts', 'index.js'), 'export default "directory"')
    writeFileSync(join(dir, 'bare'), 'export default "bare"')
    writeFileSync(join(dir, 'bare.ts'), 'export default "typescript"')
    writeFileSync(
      join(dir, 'runner.mjs'),
      `import { registerTsResolver } from ${JSON.stringify(
        new URL('./register-ts-resolver.mjs', import.meta.url).href,
      )}
registerTsResolver(${JSON.stringify(dir)}, { filesOnly: true, extensionless: true })
const bare = await import('./bare')
let directory = 'accepted'
try { await import('./folder') } catch { directory = 'rejected' }
console.log([bare.default, directory].join(','))`,
    )

    const stdout = execFileSync(process.execPath, [join(dir, 'runner.mjs')], { encoding: 'utf8' })

    expect(stdout.trim()).toBe('bare,rejected')
  })

  it('puede desactivar alias y rutas absolutas conservando imports relativos', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-resolver-relative-'))
    temporales.push(dir)
    writeFileSync(join(dir, 'relative.ts'), 'export default "relative"')
    writeFileSync(join(dir, 'alias.ts'), 'export default "alias"')
    writeFileSync(join(dir, 'absolute.ts'), 'export default "absolute"')
    writeFileSync(
      join(dir, 'runner.mjs'),
      `import { registerTsResolver } from ${JSON.stringify(
        new URL('./register-ts-resolver.mjs', import.meta.url).href,
      )}
registerTsResolver(${JSON.stringify(dir)}, { aliases: false, absolute: false })
const relative = await import('./relative')
let alias = 'accepted'
let absolute = 'accepted'
try { await import('@/alias') } catch { alias = 'rejected' }
try { await import(${JSON.stringify(join(dir, 'absolute'))}) } catch { absolute = 'rejected' }
console.log([relative.default, alias, absolute].join(','))`,
    )

    const stdout = execFileSync(process.execPath, [join(dir, 'runner.mjs')], { encoding: 'utf8' })

    expect(stdout.trim()).toBe('relative,rejected,rejected')
  })
})
