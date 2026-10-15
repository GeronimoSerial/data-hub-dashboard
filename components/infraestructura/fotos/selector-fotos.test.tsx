// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SelectorFotos } from './selector-fotos'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function crearFoto(nombre: string): File {
  return new File(['image bytes'], nombre, { type: 'image/jpeg' })
}

describe('SelectorFotos', () => {
  it('emits selected original blobs and previews each photo', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const createObjectURL = vi.fn((blob: Blob) => `blob:preview-${(blob as File).name}`)
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })
    const fotos = [crearFoto('patio.jpg'), crearFoto('aula.jpg')]

    render(<SelectorFotos onChange={onChange} />)
    await user.upload(screen.getByLabelText('Agregar fotos'), fotos)

    expect(onChange).toHaveBeenLastCalledWith(fotos)
    expect(screen.getByRole('img', { name: 'patio.jpg' })).toHaveAttribute('src', 'blob:preview-patio.jpg')
    expect(screen.getByRole('img', { name: 'aula.jpg' })).toBeInTheDocument()
    expect(screen.getByText('2 de 3 fotos')).toBeInTheDocument()
  })

  it('removes a selected photo and emits the remaining original blobs', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn((blob: Blob) => `blob:${(blob as File).name}`), revokeObjectURL: vi.fn() })
    const fotos = [crearFoto('patio.jpg'), crearFoto('aula.jpg')]

    render(<SelectorFotos onChange={onChange} />)
    await user.upload(screen.getByLabelText('Agregar fotos'), fotos)
    await user.click(screen.getByRole('button', { name: 'Quitar patio.jpg' }))

    expect(onChange).toHaveBeenLastCalledWith([fotos[1]])
    expect(screen.queryByRole('img', { name: 'patio.jpg' })).not.toBeInTheDocument()
    expect(screen.getByText('1 de 3 fotos')).toBeInTheDocument()
  })

  it('keeps the selection at three and reports when additional photos are skipped', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn((blob: Blob) => `blob:${(blob as File).name}`), revokeObjectURL: vi.fn() })

    render(<SelectorFotos onChange={onChange} />)
    await user.upload(screen.getByLabelText('Agregar fotos'), [
      crearFoto('uno.jpg'),
      crearFoto('dos.jpg'),
      crearFoto('tres.jpg'),
      crearFoto('cuatro.jpg'),
    ])

    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.any(Blob), expect.any(Blob), expect.any(Blob)]))
    expect(onChange.mock.lastCall?.[0]).toHaveLength(3)
    expect(screen.getByRole('status')).toHaveTextContent('Se pueden agregar hasta 3 fotos. Se omitieron 1.')
    expect(screen.getByLabelText('Agregar fotos')).toBeDisabled()
  })
})
