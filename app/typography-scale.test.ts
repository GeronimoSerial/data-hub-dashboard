import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

// Display numbers that intentionally stay literal (KPI and stat figures).
const ALLOWED_LITERALS = new Set(['1.875rem', '2.25rem'])
const KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert'])
const LITERAL = /^[\d.]+(px|rem|em)$/

function listModuleCss(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listModuleCss(path)
    return entry.name.endsWith('.module.css') ? [path] : []
  })
}

function findLiteralFontSizes(css: string): string[] {
  const offenders: string[] = []
  for (const match of css.matchAll(/font-size\s*:\s*([^;}\n]+)/g)) {
    const value = match[1].replace(/!important/, '').trim()
    if (value.startsWith('var(') || value.startsWith('clamp(')) continue
    if (KEYWORDS.has(value) || ALLOWED_LITERALS.has(value)) continue
    if (LITERAL.test(value)) offenders.push(value)
  }
  return offenders
}

describe('escala tipografica', () => {
  const files = [
    join(ROOT, 'app/globals.css'),
    ...listModuleCss(join(ROOT, 'components')),
  ]

  it.each(files.map((file) => [file.replace(ROOT, ''), file]))(
    '%s usa solo tokens de font-size',
    (_name, file) => {
      const css = readFileSync(file, 'utf8')
      expect(findLiteralFontSizes(css)).toEqual([])
    },
  )

  it('preserves the reorganization panel sizes with scoped tokens', () => {
    const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')
    const panel = css.match(/\.rz-side\s*\{([^}]+)\}/)?.[1] ?? ''
    expect(panel).toMatch(/--t-rz-title:\s*1\.25rem;/)
    expect(panel).toMatch(/--t-rz-caption:\s*0\.75rem;/)
    expect(panel).toMatch(/--t-rz-kpi:\s*1\.5rem;/)
  })

  it('define la escala de tokens en :root', () => {
    const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')
    expect(css).toMatch(/--t-micro:\s*0\.875rem;/)
    expect(css).toMatch(/--t-small:\s*0\.9375rem;/)
    expect(css).toMatch(/--t-body:\s*1rem;/)
    expect(css).toMatch(/--t-h3:\s*1\.125rem;/)
    expect(css).toMatch(/--t-h2:\s*1\.375rem;/)
    expect(css).toMatch(/--t-h1:\s*1\.75rem;/)
  })
})
