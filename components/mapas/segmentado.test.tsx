// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Segmentado } from './segmentado'

describe('Segmentado', () => {
  afterEach(() => cleanup())

  const opciones = [
    { valor: '24h', etiqueta: '24 h' },
    { valor: '72h', etiqueta: '72 h' },
    { valor: '10d', etiqueta: '10 días', deshabilitada: true, titulo: 'Sin datos disponibles' },
  ] as const

  it('muestra las opciones, marca la activa y permite elegir otra', async () => {
    const usuario = userEvent.setup()
    const onChange = vi.fn()
    render(<Segmentado etiqueta="Horizonte" opciones={opciones} valor="24h" onChange={onChange} />)

    const grupo = screen.getByRole('group', { name: 'Horizonte' })
    expect(grupo).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: '24 h' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '72 h' })).toHaveAttribute('aria-pressed', 'false')

    await usuario.click(screen.getByRole('button', { name: '72 h' }))
    expect(onChange).toHaveBeenCalledWith('72h')
  })

  it('mantiene alcanzable la opción deshabilitada e ignora su click', async () => {
    const usuario = userEvent.setup()
    const onChange = vi.fn()
    render(<Segmentado etiqueta="Horizonte" opciones={opciones} valor="24h" onChange={onChange} />)

    const deshabilitada = screen.getByRole('button', { name: '10 días' })
    expect(deshabilitada).toHaveAttribute('aria-disabled', 'true')
    expect(deshabilitada).toHaveAttribute('title', 'Sin datos disponibles')
    expect(deshabilitada).not.toBeDisabled()
    await usuario.click(deshabilitada)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('define una grilla regular de dos columnas compactas para el Radar', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const regla = (selector: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectores]) => selectores?.split(',').some((item) => item.trim() === selector))
      .map(([, , declaraciones]) => declaraciones ?? '')
      .join(';')

    expect(regla('.map-seg--2')).toMatch(/display\s*:\s*grid/i)
    expect(regla('.map-seg--2')).toMatch(/grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/i)
    expect(regla('.map-seg--2 .map-seg__opcion')).toMatch(/padding-inline\s*:\s*var\(--s-1\)/i)
    expect(regla('.map-seg--2 .map-seg__opcion')).toMatch(/font-size\s*:\s*var\(--t-small\)/i)
    expect(regla('.map-seg--2 .map-seg__opcion')).toMatch(/white-space\s*:\s*nowrap/i)
  })
})
