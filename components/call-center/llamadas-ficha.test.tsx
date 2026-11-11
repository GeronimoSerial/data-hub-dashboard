// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LlamadasFicha, type LlamadaFicha } from './llamadas-ficha'

const llamada = (n: number): LlamadaFicha => ({
  id: `l${n}`,
  callerNombre: `Caller ${n}`,
  justificacion: `Motivo ${n}`,
  respuestaDirector: `Respuesta ${n}`,
  creadaEn: '2026-11-11T12:00:00.000Z',
})

afterEach(cleanup)

describe('LlamadasFicha', () => {
  it('muestra un mensaje cuando no hay llamadas', () => {
    render(<LlamadasFicha llamadas={[]} />)
    expect(screen.getByText(/Todavía no hay llamadas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al call center' })).toHaveAttribute('href', '/call-center')
  })

  it('muestra motivo, respuesta y autor de cada llamada', () => {
    render(<LlamadasFicha llamadas={[llamada(1)]} />)
    expect(screen.getByText('Motivo 1')).toBeInTheDocument()
    expect(screen.getByText('Respuesta 1')).toBeInTheDocument()
    expect(screen.getByText(/Caller 1/)).toBeInTheDocument()
  })

  it('limita a 5 llamadas e indica cuántas quedan', () => {
    render(<LlamadasFicha llamadas={[1, 2, 3, 4, 5, 6, 7].map(llamada)} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('Hay 2 llamadas anteriores más.')).toBeInTheDocument()
  })
})
