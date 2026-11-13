// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import PublicoLayout from './layout'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'

vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => ({ isPending: true, data: null }) },
}))

const originalRegion = process.env.REGION

beforeEach(() => {
  __reiniciarRegionActivaParaPruebas()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  if (originalRegion === undefined) delete process.env.REGION
  else process.env.REGION = originalRegion
  __reiniciarRegionActivaParaPruebas()
})

describe('PublicoLayout marca de la region', () => {
  it('Corrientes mantiene la firma y el pie actuales', () => {
    delete process.env.REGION
    const { container } = render(<PublicoLayout><p>x</p></PublicoLayout>)

    expect(container.querySelector('img[src="/marca/logo-educacion-h.svg"]')).toBeInTheDocument()
    expect(container.querySelector('.publico-footer')?.textContent).toBe('Ministerio de Educación · Provincia de Corrientes')
  })

  it('Manaos no muestra logos ni textos de Corrientes', () => {
    process.env.REGION = 'manaos'
    __reiniciarRegionActivaParaPruebas()
    const { container } = render(<PublicoLayout><p>x</p></PublicoLayout>)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.publico-footer')?.textContent).toBe(
      '[PENDIENTE M0.5] Nome do organismo · [PENDIENTE M0.5] Jurisdição',
    )
    expect(container.textContent).not.toContain('Corrientes')
  })
})
