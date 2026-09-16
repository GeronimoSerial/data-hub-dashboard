// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Indicadores } from './indicadores'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Indicadores', () => {
  it('muestra "No disponible" cuando el recuento de inmuebles no está disponible, nunca 0', () => {
    render(
      <Indicadores
        loading={false}
        indicadores={{
          escuelas: 12,
          localizaciones: 10,
          inmuebles: null,
          inmueblesDisponible: false,
          alumnos: 340,
          universoEducativo: 5000,
        }}
      />,
    )

    expect(screen.getByText('No disponible')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('muestra el número real de inmuebles cuando está disponible', () => {
    render(
      <Indicadores
        loading={false}
        indicadores={{
          escuelas: 12,
          localizaciones: 10,
          inmuebles: 7,
          inmueblesDisponible: true,
          alumnos: 340,
          universoEducativo: 5000,
        }}
      />,
    )

    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.queryByText('No disponible')).not.toBeInTheDocument()
  })
})
