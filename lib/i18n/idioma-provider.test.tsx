// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IdiomaProvider, useTextos } from './idioma-provider'
import { textosActuales } from './index'
import { __reiniciarIdiomaClienteParaPruebas } from './idioma-cliente'
import { es } from './diccionarios/es'
import { pt } from './diccionarios/pt'

function Titulo() {
  const t = useTextos()
  return <p>{t.didactica.legend.evolutionTitle}</p>
}

describe('IdiomaProvider', () => {
  beforeEach(() => __reiniciarIdiomaClienteParaPruebas())
  afterEach(() => cleanup())

  it('gives pt texts to hooks under a pt provider', () => {
    render(
      <IdiomaProvider idioma="pt">
        <Titulo />
      </IdiomaProvider>,
    )
    expect(screen.getByText(pt.didactica.legend.evolutionTitle)).toBeTruthy()
    expect(textosActuales()).toBe(pt)
  })

  it('falls back to Spanish without a provider', () => {
    render(<Titulo />)
    expect(screen.getByText(es.didactica.legend.evolutionTitle)).toBeTruthy()
  })
})
