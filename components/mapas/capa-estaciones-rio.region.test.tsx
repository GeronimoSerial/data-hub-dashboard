// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { cargarRegion, regionPublica, type RegionPublica } from '@/lib/infraestructura/region/index'
import { __reiniciarRegionPublicaClienteParaPruebas, fijarRegionPublicaCliente } from '@/lib/infraestructura/region/publica'
import { CapaEstacionesRio } from './capa-estaciones-rio'

vi.mock('react-map-gl/maplibre', () => ({
  Source: () => null,
  Layer: () => null,
  Popup: () => null,
  useMap: () => ({ current: undefined }),
}))

const manaosLike = (): RegionPublica => ({
  ...regionPublica(cargarRegion('corrientes')),
  id: 'manaos',
  nombre: 'Manaos',
  fuentesRio: ['ana', 'sgb'],
})

afterEach(() => {
  cleanup()
  __reiniciarRegionPublicaClienteParaPruebas()
  vi.restoreAllMocks()
})

describe('CapaEstacionesRio · región sin Prefectura', () => {
  it('no consulta las estaciones de Prefectura aunque la capa esté visible', () => {
    fijarRegionPublicaCliente(manaosLike())
    const fetchEspia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"estaciones":[]}'))

    const { container } = render(<CapaEstacionesRio visible />)

    expect(container.innerHTML).toBe('')
    expect(fetchEspia).not.toHaveBeenCalled()
  })
})
