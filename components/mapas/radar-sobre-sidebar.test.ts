import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const reglas = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]

function reglasDe(selectorBuscado: string) {
  return reglas
    .filter(([, selector]) => selector?.trim() === selectorBuscado)
    .map(([, , declaraciones]) => declaraciones ?? '')
}

describe('ubicación de los controles del radar sobre el sidebar', () => {
  it('mantiene la leyenda base a la derecha y mueve la variante del resumen fuera del sidebar', () => {
    const leyendaBase = reglasDe('.radar-meteo-legend')[0] ?? ''
    expect(leyendaBase).not.toMatch(/\bleft\s*:/i)
    expect(leyendaBase).toMatch(/\bright\s*:\s*16px/i)
    expect(leyendaBase).toMatch(/\bwidth\s*:\s*224px/i)

    const leyendaConResumen = reglasDe('.radar-resumen ~ .radar-meteo-legend')
      .find((declaraciones) => /var\(--map-sidebar-ancho\)/i.test(declaraciones)) ?? ''
    expect(leyendaConResumen).toMatch(/\bleft\s*:\s*calc\(55px\s*\+\s*var\(--map-sidebar-ancho\)\s*\+\s*var\(--s-3\)\)/i)
    expect(leyendaConResumen).toMatch(/\bright\s*:\s*auto/i)
  })

  it('mantiene el timeline desplazado más allá del sidebar', () => {
    expect(reglasDe('.radar-meteo-timeline')[0] ?? '').toMatch(/\bleft\s*:\s*calc\(55px\s*\+\s*var\(--map-sidebar-ancho\)\s*\+\s*var\(--s-3\)\)/i)
  })
})
