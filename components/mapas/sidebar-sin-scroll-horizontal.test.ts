// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PanelCapas } from './panel-capas'
import { PanelEstadisticas } from './panel-estadisticas'
import { PanelLateral } from './panel-lateral'
import { PanelPlanificacion } from './panel-planificacion'
import { PanelRadar } from './panel-radar'
import { PanelSituacionActual } from './panel-situacion-actual'
import { FILTROS_MAPA_VACIOS } from '@/lib/infraestructura/mapa/tipos'
import { CAPAS_VISIBLES_DEFAULT } from '@/lib/infraestructura/mapa/capas'

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

afterEach(cleanup)

function regla(selectorBuscado: string) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector?.split(',').some((item) => item.trim() === selectorBuscado))
    .map(([, , declaraciones]) => declaraciones ?? '')
    .join(';')
}

function contenidoPestana(pestana: 'actual' | 'radar' | 'planificacion' | 'estadisticas' | 'capas') {
  return {
    pestana,
    seleccion: null,
    onCerrarFicha: vi.fn(),
    actual: createElement(PanelSituacionActual, { escuelas: [], actualizadoEn: null, onSeleccionar: vi.fn() }),
    radar: createElement(PanelRadar, { horizonte: 72, disponibles: [], onHorizonte: vi.fn(), variable: 'lluvia', onVariable: vi.fn(), puntos: null, escuelas: [], cargando: false, error: null, onSeleccionar: vi.fn() }),
    planificacion: createElement(PanelPlanificacion, { vista: 'aisladas', onVista: vi.fn(), escuelas: [], territorio: null, cargando: false, error: false, onSeleccionar: vi.fn() }),
    estadisticas: createElement(PanelEstadisticas, { escuelas: [], filtros: FILTROS_MAPA_VACIOS }),
    capas: createElement(PanelCapas, { value: 'voyager', onChange: vi.fn(), capasVisibles: CAPAS_VISIBLES_DEFAULT, onCapasVisiblesChange: vi.fn(), haySeleccion: false }),
  }
}

describe('sidebar del mapa sin scroll horizontal', () => {
  it('declara el ancho compartido y contiene el desborde de sus hijos', () => {
    expect(regla('.map-left-stack')).toMatch(/overflow\s*:\s*hidden/i)
    expect(regla('.map-left-stack')).toMatch(/--map-sidebar-ancho\s*:\s*24rem/i)
    expect(regla('.map-left-stack')).toMatch(/width\s*:\s*min\(var\(--map-sidebar-ancho\)\s*,\s*calc\(100vw\s*-\s*80px\)\)/i)
    expect(regla('.map-panel-lateral')).toMatch(/min-width\s*:\s*0/i)
    expect(regla('.map-panel-lateral > *')).toMatch(/min-width\s*:\s*0/i)

    const reglasSidebar = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selector]) => /\.map-|\.radar-/.test(selector ?? ''))
    const desbordes = reglasSidebar.flatMap(([, selector, declaraciones]) =>
      (declaraciones ?? '').split(';')
        .filter((declaracion) => /^\s*overflow-x\s*:\s*(auto|scroll)\b/i.test(declaracion))
        .map(() => selector?.trim() ?? ''),
    )
    expect(desbordes).toEqual([])

    const stackMovil = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .find(([, selector, declaraciones]) => selector?.trim() === '.map-left-stack' && /calc\(100vw\s*-\s*24px\)/.test(declaraciones ?? ''))
    expect(stackMovil?.[2]).toMatch(/width\s*:\s*min\(var\(--map-sidebar-ancho\)\s*,\s*calc\(100vw\s*-\s*24px\)\)/i)
  })

  it('ancla el sidebar arriba y abajo y desplaza solo el cuerpo', () => {
    const stack = regla('.map-left-stack')
    expect(stack).toMatch(/top\s*:\s*var\(--s-3\)/i)
    expect(stack).toMatch(/bottom\s*:\s*var\(--s-3\)/i)
    expect(stack).toMatch(/overflow\s*:\s*hidden/i)
    expect(regla('.map-panel-lateral__cuerpo')).toMatch(/overflow-y\s*:\s*auto/i)
    expect(regla('.map-panel-lateral__cuerpo')).toMatch(/min-height\s*:\s*0/i)
    for (const selector of ['.radar-meteo-timeline', '.radar-meteo-estado']) {
      expect(regla(selector)).toMatch(/left\s*:\s*calc\(55px\s*\+\s*var\(--map-sidebar-ancho\)\s*\+\s*var\(--s-3\)\)/i)
    }

    expect(css).not.toMatch(/\.map-left-stack(?:\[[^\]]+\]|\.[\w-]+)\s*\{[^}]*\b(?:height|max-height)\s*:/i)
  })

  it.each(['actual', 'radar', 'planificacion', 'estadisticas', 'capas'] as const)(
    'no agrega anchos inline que excedan el sidebar en %s',
    (pestana) => {
      render(createElement(PanelLateral, contenidoPestana(pestana)))
      const panel = screen.getByTestId('panel-lateral')
      expect(panel.style.overflowX).toBe('')
      expect(panel.style.width).not.toMatch(/^(?:385|(?:[4-9]\d\d)|\d{4,})px$/)

      for (const elemento of panel.querySelectorAll<HTMLElement>('*')) {
        for (const valor of [elemento.style.width, elemento.style.minWidth]) {
          const px = /^([\d.]+)px$/.exec(valor)
          expect(px ? Number(px[1]) : 0, `${elemento.tagName}.${elemento.className} tiene ${valor}`).toBeLessThanOrEqual(384)
        }
      }
    },
  )
})
