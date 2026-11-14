// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createHash } from 'node:crypto'
import { MetodologiaMapa } from './metodologia-mapa'
import { RegionProvider } from '@/lib/infraestructura/region/region-provider'
import { regionPublica } from '@/lib/infraestructura/region/esquema'
import { cargarRegion } from '@/lib/infraestructura/region/registro'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { __reiniciarRegionPublicaClienteParaPruebas } from '@/lib/infraestructura/region/publica'

// Sha256 of MetodologiaMapa.innerHTML under Corrientes, recorded before the FABDEM change.
const HASH_CORRIENTES = '0d051bb5481497b9145422a5f0115b3f89d0c63909c16d7b80561953945e8686'

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  __reiniciarRegionPublicaClienteParaPruebas()
})

function conRegion(id: string, idioma: 'pt' | 'es') {
  return render(
    <RegionProvider region={regionPublica(cargarRegion(id))}>
      <IdiomaProvider idioma={idioma}>
        <MetodologiaMapa />
      </IdiomaProvider>
    </RegionProvider>,
  )
}

describe('MetodologiaMapa con DEM FABDEM', () => {
  it('reemplaza en Manaos las tres menciones de Copernicus por FABDEM', () => {
    const { container } = conRegion('manaos', 'pt')
    const html = container.innerHTML

    expect(html).toContain('<b>Elevação FABDEM V1-2</b>')
    expect(html).toContain('A cota principal usa FABDEM V1-2; a conservadora toma a menor estimativa válida')
    expect(html).toContain('<td>FABDEM V1-2 (Universidade de Bristol)</td>')

    expect(html).not.toContain('<b>Copernicus</b>')
    expect(html).not.toContain('La cota principal usa Copernicus')
    expect(html).not.toContain('Copernicus DEM GLO-30')
  })

  it('mantiene el texto de Copernicus en Corrientes y el HTML exacto de antes del cambio', () => {
    const { container } = conRegion('corrientes', 'es')

    expect(container.innerHTML).toContain('<b>Copernicus</b>')
    expect(container.innerHTML).toContain('La cota principal usa Copernicus; la conservadora')
    expect(container.innerHTML).toContain('<td>Copernicus DEM GLO-30</td>')
    expect(createHash('sha256').update(container.innerHTML).digest('hex')).toBe(HASH_CORRIENTES)
  })

  it('mantiene el HTML de Corrientes sin región explícita idéntico al de antes del cambio', () => {
    const { container } = render(
      <IdiomaProvider idioma="es">
        <MetodologiaMapa />
      </IdiomaProvider>,
    )

    expect(createHash('sha256').update(container.innerHTML).digest('hex')).toBe(HASH_CORRIENTES)
  })
})
