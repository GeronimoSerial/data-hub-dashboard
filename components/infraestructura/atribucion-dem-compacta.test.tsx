// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AtribucionDemCompacta } from './atribucion-dem-compacta'
import { RegionProvider } from '@/lib/infraestructura/region/region-provider'
import { regionPublica } from '@/lib/infraestructura/region/esquema'
import { cargarRegion } from '@/lib/infraestructura/region/registro'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'

afterEach(() => cleanup())

function conRegion(id: string, idioma: 'pt' | 'es') {
  return render(
    <RegionProvider region={regionPublica(cargarRegion(id))}>
      <IdiomaProvider idioma={idioma}>
        <AtribucionDemCompacta />
      </IdiomaProvider>
    </RegionProvider>,
  )
}

describe('AtribucionDemCompacta', () => {
  it('muestra una línea corta de atribución FABDEM en portugués bajo Manaos', () => {
    const { container } = conRegion('manaos', 'pt')

    expect(container.querySelector('p')).toHaveTextContent(
      'Terreno: FABDEM V1-2 © Universidade de Bristol / Fathom, CC BY-NC-SA 4.0',
    )
    const enlace = screen.getByRole('link', { name: 'CC BY-NC-SA 4.0' })
    expect(enlace.getAttribute('href')).toBe('https://creativecommons.org/licenses/by-nc-sa/4.0/')
  })

  it('guarda la nota de Copernicus y los valores modificados en el detalle', () => {
    const { container } = conRegion('manaos', 'pt')

    const detalle = container.querySelector('details')!
    expect(detalle).not.toBeNull()
    expect(detalle).toHaveTextContent('Copernicus WorldDEM-30 © DLR e.V. 2010-2014')
    expect(detalle).toHaveTextContent('Valores derivados e modificados')
  })

  it('usa los textos en español cuando el idioma es es', () => {
    conRegion('manaos', 'es')

    expect(screen.getByText(/Terreno: FABDEM V1-2 © Universidad de Bristol \/ Fathom,/)).toBeTruthy()
    expect(screen.getByText('Valores derivados y modificados: se usa el percentil 10 por escuela.', { exact: false })).toBeTruthy()
  })

  it('no renderiza nada en Corrientes', () => {
    const { container } = conRegion('corrientes', 'es')

    expect(container.innerHTML).toBe('')
  })
})
