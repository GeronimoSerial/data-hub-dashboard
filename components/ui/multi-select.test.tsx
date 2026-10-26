// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MultiSelect } from './multi-select'

const opciones = [
  { value: 'a', label: 'Carrera A' },
  { value: 'b', label: 'Carrera B' },
  { value: 'c', label: 'Tecnicatura Superior en Gestión Ambiental y Desarrollo Sostenible con Orientación Territorial' },
]

function disparador(nombre = 'Carreras') {
  return screen.getByRole('combobox', { name: nombre })
}

describe('MultiSelect', () => {
  afterEach(cleanup)

  it('al abrir no monta una capa modal a pantalla completa sobre la tarjeta', () => {
    // La capa modal (inert) cubre toda la ventana y su recorte se reescribe en
    // cada scroll mientras el desplegable está abierto: la tarjeta de detrás
    // se repinta y titila. El desplegable no necesita bloquear la página.
    render(<MultiSelect<string> value={[]} onChange={() => {}} options={opciones} ariaLabel="Carreras" />)
    fireEvent.click(disparador())
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(document.querySelector('[data-base-ui-inert][role="presentation"]')).toBeNull()
  })

  it('muestra el placeholder sin elegidos', () => {
    render(<MultiSelect<string> value={[]} onChange={() => {}} options={opciones} ariaLabel="Carreras" placeholder="Elija" />)
    expect(disparador()).toHaveTextContent('Elija')
  })

  it('con una elegida muestra su nombre completo en la cabecera title', () => {
    render(<MultiSelect<string> value={['c']} onChange={() => {}} options={opciones} ariaLabel="Carreras" />)
    const texto = opciones[2].label
    expect(disparador()).toHaveTextContent(texto)
    expect(screen.getByTitle(texto)).toBeInTheDocument()
  })

  it('con dos o más elegidas muestra el resumen por defecto, sin nombres', () => {
    render(<MultiSelect<string> value={['a', 'b']} onChange={() => {}} options={opciones} ariaLabel="Carreras" />)
    expect(disparador()).toHaveTextContent('2 seleccionadas')
    expect(disparador()).not.toHaveTextContent('Carrera A')
  })

  it('usa el resumen recibido por prop', () => {
    render(
      <MultiSelect<string>
        value={['a', 'b']}
        onChange={() => {}}
        options={opciones}
        ariaLabel="Carreras"
        resumen={(n) => `${n} carreras seleccionadas`}
      />,
    )
    expect(disparador()).toHaveTextContent('2 carreras seleccionadas')
  })

  it('el disparador y su texto no crecen en ancho por el contenido', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
    const regla = (selector: string) => {
      const match = css.match(new RegExp(`(^|\\n)${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))
      return match?.[2] ?? ''
    }
    const trigger = regla('.ui-select-trigger')
    expect(trigger).toMatch(/min-width:\s*0/)
    expect(trigger).toMatch(/overflow:\s*hidden/)
    expect(trigger).toMatch(/white-space:\s*nowrap/)
    const valor = regla('.ui-select-value')
    expect(valor).toMatch(/min-width:\s*0/)
    expect(valor).toMatch(/text-overflow:\s*ellipsis/)
    expect(regla('.ui-select-positioner .ui-select-popup')).toMatch(/max-width:\s*min\(/)
    expect(regla('.afectacion-campos__grupo')).toMatch(/min-width:\s*0/)
  })
})
