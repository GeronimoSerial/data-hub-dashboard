// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EscuelaSearchBox } from './escuela-search-box'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  if (typeof globalThis.IntersectionObserver === 'undefined') {
    class IntersectionObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    }
    globalThis.IntersectionObserver =
      IntersectionObserverStub as unknown as typeof IntersectionObserver
  }
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const ESCUELAS = [
  {
    cueAnexo: '14001',
    nombre: 'Escuela Manuel Belgrano',
    localidad: 'Córdoba',
    departamento: 'Capital',
  },
  {
    cueAnexo: '14002',
    nombre: 'Instituto San José',
    localidad: 'Villa María',
    departamento: 'General San Martín',
  },
  {
    cueAnexo: '14003',
    nombre: 'Escuela Rivadavia',
    localidad: 'Río Cuarto',
    departamento: 'Río Cuarto',
  },
]

const ARIA_LABEL = 'Buscar escuela por nombre, CUE-anexo, localidad o departamento'

function renderBuscador() {
  const onSeleccionar = vi.fn()
  render(<EscuelaSearchBox escuelas={ESCUELAS} onSeleccionar={onSeleccionar} />)
  return { onSeleccionar }
}

describe('EscuelaSearchBox', () => {
  it('expone el aria-label esperado en el input', () => {
    renderBuscador()
    expect(screen.getByRole('combobox')).toHaveAccessibleName(ARIA_LABEL)
  })

  it('con menos de 2 caracteres tipeados no muestra el popover de resultados', async () => {
    const user = userEvent.setup()
    renderBuscador()
    const input = screen.getByRole('combobox')

    await user.type(input, 'E')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/Belgrano/)).not.toBeInTheDocument()
  })

  it('con 2+ caracteres que matchean muestra resultados y al hacer click llama onSeleccionar con el item y limpia el input', async () => {
    const user = userEvent.setup()
    const { onSeleccionar } = renderBuscador()
    const input = screen.getByRole('combobox')

    await user.type(input, 'Belgrano')

    const opcion = await screen.findByRole('option', { name: /Belgrano/ })
    await user.click(opcion)

    expect(onSeleccionar).toHaveBeenCalledTimes(1)
    expect(onSeleccionar).toHaveBeenCalledWith(ESCUELAS[0])
    expect(input).toHaveValue('')
  })

  it('con 2+ caracteres y Enter sobre un resultado llama onSeleccionar con el item', async () => {
    const user = userEvent.setup()
    const { onSeleccionar } = renderBuscador()
    const input = screen.getByRole('combobox')

    await user.type(input, 'Rivadavia')
    await screen.findByRole('option', { name: /Rivadavia/ })
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onSeleccionar).toHaveBeenCalledWith(ESCUELAS[2])
  })

  it('con query que no matchea nada muestra el mensaje de sin resultados', async () => {
    const user = userEvent.setup()
    renderBuscador()
    const input = screen.getByRole('combobox')

    await user.type(input, 'zzzzz')

    expect(await screen.findByText(/Sin resultados/)).toBeInTheDocument()
  })
})
