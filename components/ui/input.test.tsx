// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Input } from './input'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Input (Base UI, type="file")', () => {
  it('renders a file input and forwards accept and accessible name', () => {
    render(<Input type="file" aria-label="Archivo del recurso" accept=".pdf,application/pdf" />)
    const input = screen.getByLabelText('Archivo del recurso')
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', '.pdf,application/pdf')
  })

  it('forwards change events carrying the selected file list', () => {
    let received: File | null = null
    const onChange = vi.fn((event: React.ChangeEvent<HTMLInputElement>) => {
      received = event.currentTarget.files?.[0] ?? null
    })
    render(<Input type="file" aria-label="Archivo" onChange={onChange} />)
    const input = screen.getByLabelText('Archivo') as HTMLInputElement
    const file = new File(['pdf'], 'reporte.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(received).toEqual(file)
  })

  it('lets the handler clear the value after a rejected file', () => {
    const onChange = vi.fn((event: React.ChangeEvent<HTMLInputElement>) => {
      event.currentTarget.value = ''
    })
    render(<Input type="file" aria-label="Archivo" onChange={onChange} />)
    const input = screen.getByLabelText('Archivo') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('')
  })
})