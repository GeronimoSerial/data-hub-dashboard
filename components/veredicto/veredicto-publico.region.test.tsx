// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { VeredictoPublico } from './veredicto-publico'
import { __reiniciarRegionPublicaClienteParaPruebas, fijarMarcaRegionCliente } from '@/lib/infraestructura/region/publica'
import { __reiniciarIdiomaClienteParaPruebas, fijarIdiomaCliente } from '@/lib/i18n/idioma-cliente'
import { marcaPublica } from '@/lib/infraestructura/region/esquema'
import { cargarRegion } from '@/lib/infraestructura/region/registro'

afterEach(() => {
  cleanup()
  __reiniciarRegionPublicaClienteParaPruebas()
  __reiniciarIdiomaClienteParaPruebas()
})

describe('título del veredicto público', () => {
  it('Corrientes conserva el título exacto', () => {
    render(<VeredictoPublico veredictos={[]} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Veredicto diario de inundaciones — Provincia de Corrientes')
  })

  it('Manaos usa la jurisdicción de su configuración y portugués', () => {
    fijarMarcaRegionCliente(marcaPublica(cargarRegion('manaos')))
    fijarIdiomaCliente('pt')
    render(<VeredictoPublico veredictos={[]} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Veredito diário de inundações — Amazonas')
  })
})
