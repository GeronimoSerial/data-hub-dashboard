// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { __reiniciarIdiomaClienteParaPruebas } from '@/lib/i18n/idioma-cliente'
import { CAPAS_VISIBLES_DEFAULT } from '@/lib/infraestructura/mapa/capas'
import { PanelCapas } from './panel-capas'

const base = {
  value: 'voyager' as const,
  onChange: () => {},
  capasVisibles: CAPAS_VISIBLES_DEFAULT,
  onCapasVisiblesChange: () => {},
  haySeleccion: false,
  riesgoHoyDisponible: true,
}

afterEach(() => {
  cleanup()
  __reiniciarIdiomaClienteParaPruebas()
})

describe('PanelCapas · idioma español (default)', () => {
  it('mantiene los títulos de grupo y la sección con su texto original', () => {
    render(<PanelCapas {...base} riesgoDisponible />)

    expect(screen.getByRole('region', { name: 'Capas' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Situación actual' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Mapa base' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Referencias' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Riesgo' })).toBeTruthy()
  })

  it('mantiene los nombres de los interruptores y las pistas', () => {
    render(<PanelCapas {...base} riesgoDisponible={false} />)

    expect(screen.getByRole('switch', { name: 'Estaciones de Prefectura (altura de ríos)' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Escuelas en riesgo hoy (moderado o más)' })).toBeTruthy()
    expect(screen.getByText('Los datos territoriales no están disponibles.')).toBeTruthy()
    expect(screen.getAllByText('Se muestra al seleccionar una escuela.')).toHaveLength(2)
  })

  it('mantiene la etiqueta aria de la escala de riesgo', () => {
    render(<PanelCapas {...base} riesgoDisponible capasVisibles={{ ...CAPAS_VISIBLES_DEFAULT, escuelasAisladas: true }} />)

    expect(screen.getByLabelText('Escala de riesgo')).toBeTruthy()
  })
})

describe('PanelCapas · idioma portugués', () => {
  it('muestra los títulos de grupo y la sección en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <PanelCapas {...base} riesgoDisponible />
      </IdiomaProvider>,
    )

    expect(screen.getByRole('region', { name: 'Camadas' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Situação atual' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Mapa de base' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Referências' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Risco' })).toBeTruthy()
  })

  it('muestra los nombres de los interruptores y las pistas en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <PanelCapas {...base} riesgoDisponible={false} />
      </IdiomaProvider>,
    )

    expect(screen.getByRole('switch', { name: 'Estações da Prefectura (altura dos rios)' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Escolas isoladas' })).toBeTruthy()
    expect(screen.getByText('Os dados territoriais não estão disponíveis.')).toBeTruthy()
    expect(screen.getAllByText('Aparece ao selecionar uma escola.')).toHaveLength(2)
  })

  it('muestra la escala de riesgo con su etiqueta en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <PanelCapas {...base} riesgoDisponible capasVisibles={{ ...CAPAS_VISIBLES_DEFAULT, escuelasAisladas: true }} />
      </IdiomaProvider>,
    )

    expect(screen.getByLabelText('Escala de risco')).toBeTruthy()
  })
})
