// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AtribucionDem } from './atribucion-dem'
import { RegionProvider } from '@/lib/infraestructura/region/region-provider'
import { regionPublica } from '@/lib/infraestructura/region/esquema'
import { cargarRegion } from '@/lib/infraestructura/region/registro'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'

afterEach(() => cleanup())

function conRegion(id: string, idioma: 'pt' | 'es', contenido = <AtribucionDem />) {
  return render(
    <RegionProvider region={regionPublica(cargarRegion(id))}>
      <IdiomaProvider idioma={idioma}>{contenido}</IdiomaProvider>
    </RegionProvider>,
  )
}

describe('AtribucionDem', () => {
  it('renders the FABDEM attribution in Portuguese under manaos', () => {
    conRegion('manaos', 'pt')

    expect(screen.getByText(/FABDEM V1-2/)).toBeTruthy()
    expect(screen.getByText(/Universidade de Bristol \/ Fathom/)).toBeTruthy()
    expect(screen.getByText(/Copernicus WorldDEM-30 © DLR e\.V\./)).toBeTruthy()
    expect(screen.getByText(/percentil 10 por escola/)).toBeTruthy()
    expect(screen.getByText(/Uso não comercial/)).toBeTruthy()
    const enlace = screen.getByRole('link', { name: /CC BY-NC-SA 4\.0/ })
    expect(enlace.getAttribute('href')).toBe('https://creativecommons.org/licenses/by-nc-sa/4.0/')
  })

  it('renders the Spanish texts when the language is es', () => {
    conRegion('manaos', 'es')

    expect(screen.getByText(/FABDEM V1-2/)).toBeTruthy()
    expect(screen.getByText(/Uso no comercial/)).toBeTruthy()
  })

  it('renders nothing under corrientes', () => {
    const { container } = conRegion('corrientes', 'es')

    expect(container.innerHTML).toBe('')
  })
})
