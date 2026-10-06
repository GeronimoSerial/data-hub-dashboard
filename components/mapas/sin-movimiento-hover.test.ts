import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('CSS del mapa sin movimiento al pasar el mouse', () => {
  it('no declara propiedades que mueven o redimensionan en hover', () => {
    // Parser deliberadamente simple: lee bloques CSS planos y no interpreta reglas anidadas
    // ni selectores escapados; alcanza para las reglas del mapa.
    const regla = /([^{}]+)\{([^{}]*)\}/g
    const prefijosMapa = ['.map-', '.radar-', '.filtros-', '.mapa-']
    const propiedadesProhibidas = new Set([
      'transform', 'translate', 'scale', 'rotate', 'margin', 'padding', 'width', 'height',
      'top', 'left', 'right', 'bottom', 'box-shadow',
    ])
    const infracciones: string[] = []

    for (const coincidencia of css.matchAll(regla)) {
      const selector = coincidencia[1].trim()
      if (!selector.includes(':hover') || !prefijosMapa.some((prefijo) => selector.includes(prefijo))) continue

      for (const declaracion of coincidencia[2].split(';')) {
        const separador = declaracion.indexOf(':')
        if (separador < 0) continue
        const propiedad = declaracion.slice(0, separador).trim().toLowerCase()
        if (propiedadesProhibidas.has(propiedad)) infracciones.push(`${selector}: ${propiedad}`)
      }
    }

    expect(infracciones).toEqual([])
  })

  it('no anima la ficha ni los paneles laterales del mapa', () => {
    // Usa el parser plano de arriba: no resuelve cascada, variables ni @supports anidados.
    const regla = /([^{}]+)\{([^{}]*)\}/g
    const selectoresSinAnimacion = ['.map-ficha-panel', '.map-ficha-escuela', '.map-panel-lateral']
    const infracciones: string[] = []

    for (const coincidencia of css.matchAll(regla)) {
      const selector = coincidencia[1].trim()
      if (!selectoresSinAnimacion.some((nombre) => selector.split(',').some((item) => item.trim().startsWith(nombre)))) continue

      for (const declaracion of coincidencia[2].split(';')) {
        const separador = declaracion.indexOf(':')
        if (separador >= 0 && declaracion.slice(0, separador).trim().toLowerCase().startsWith('animation')) {
          infracciones.push(`${selector}: ${declaracion.slice(0, separador).trim()}`)
        }
      }
    }

    expect(infracciones).toEqual([])
  })
})
