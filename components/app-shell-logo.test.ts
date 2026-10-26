import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

describe('compact map header logo sizing', () => {
  it('keeps the compact header at 68px and renders the logo at 44px', () => {
    expect(css).toMatch(/\.app-page:has\(> \.app-header--mapa\)\s*\{[^}]*--header-h:\s*68px\s*;/)
    expect(css).toMatch(/\.app-header__logo\s*\{[^}]*height:\s*44px\s*;/)
    expect(68).toBeLessThanOrEqual(72)
  })

  it('hides the map header brand mark at widths of 1520px and below', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*1520px\)[\s\S]{0,300}\.app-header--mapa__marca\s*\{\s*display:\s*none\s*;/)
  })
})
