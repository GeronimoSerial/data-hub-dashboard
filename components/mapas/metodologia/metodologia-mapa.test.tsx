// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MetodologiaMapa } from './metodologia-mapa'

function cambiar(id: string, valor: string) {
  const campo = document.getElementById(id) as HTMLInputElement
  fireEvent.input(campo, { target: { value: valor } })
}

describe('MetodologiaMapa', () => {
  it('explains every model of the map in one place', () => {
    render(<MetodologiaMapa />)

    for (const titulo of [
      'La escuela y su comunidad',
      '1 · Continuidad pedagógica',
      'Lluvia observada desde el espacio',
      '3 · Riesgo estimado',
      '4 · Aislamiento vial',
      '5 · Riesgo de acceso',
      '6 · Inundación',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: titulo })).toBeTruthy()
    }
    expect(screen.getAllByText(/NASA GPM IMERG/).length).toBeGreaterThan(0)
    expect(screen.getByText(/JRC Global River Flood Hazard Maps v2\.1/)).toBeTruthy()
    expect(screen.getByText(/Inaccesibilidad de docentes/)).toBeTruthy()
  })

  it('keeps the deep-link targets used by the school panel', () => {
    render(<MetodologiaMapa />)

    for (const id of ['inundacion-clases-rio', 'inundacion-ruta-acceso', 'inundacion-junto-laguna']) {
      expect(document.getElementById(id)).not.toBeNull()
    }
  })

  it('links in-page navigation through the methodology tab hash', () => {
    render(<MetodologiaMapa />)

    for (const enlace of document.querySelectorAll('.toc a')) {
      expect(enlace.getAttribute('href')).toMatch(/^#metodologia\//)
    }
  })

  it('warns the principal when most students are marked', () => {
    render(<MetodologiaMapa />)

    cambiar('rd-m', '200')
    cambiar('rd-k', '90')
    expect(document.getElementById('rd-b')?.textContent).toBe('Sin aviso')

    cambiar('rd-k', '101')
    expect(document.getElementById('rd-b')?.textContent).toBe('Aviso')
  })

  it('classifies access risk in three levels', () => {
    render(<MetodologiaMapa />)

    const nivel = document.getElementById('c-n') as HTMLSelectElement
    fireEvent.change(nivel, { target: { value: '3' } })
    expect(document.getElementById('c-s')?.textContent).toBe('100')
    expect(document.getElementById('c-b')?.textContent).toBe('Alto')
  })

  it('does not publish the satellite accumulation below 80 % coverage', () => {
    render(<MetodologiaMapa />)

    expect(document.getElementById('cob-p')?.textContent).toBe('100 %')
    const barras = document.querySelectorAll('#cob-svg rect')
    for (let i = 0; i < 10; i++) fireEvent.click(barras[i])
    expect(document.getElementById('cob-mm')?.textContent).toBe('sin dato')
  })
})
