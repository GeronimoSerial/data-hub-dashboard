// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import PublicoLayout from './layout'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'

vi.mock('@/components/marca', () => ({ MarcaBanda: () => null, MarcaCompacta: () => null, MarcaHorizontal: () => null, MarcaHorizontalInversa: () => null }))

const original = process.env.REGION

function tituloCon(region: string | undefined): string | null {
  if (region === undefined) delete process.env.REGION
  else process.env.REGION = region
  __reiniciarRegionActivaParaPruebas()
  const { container } = render(<PublicoLayout><p>Cuerpo</p></PublicoLayout>)
  return container.querySelector('.publico-header__title')?.textContent ?? null
}

beforeEach(() => __reiniciarRegionActivaParaPruebas())
afterEach(() => {
  cleanup()
  if (original === undefined) delete process.env.REGION
  else process.env.REGION = original
  __reiniciarRegionActivaParaPruebas()
})

describe('PublicoLayout · título del producto', () => {
  it('Corrientes muestra "Hub de Datos" en español', () => {
    expect(tituloCon(undefined)).toBe('Hub de Datos')
  })

  it('Manaos muestra "Hub de Dados" en portugués', () => {
    expect(tituloCon('manaos')).toBe('Hub de Dados')
  })
})
