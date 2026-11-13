// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import EscuelaFichaNotFound from './not-found'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'

const original = process.env.REGION

function fijarRegion(region: string | undefined) {
  if (region === undefined) delete process.env.REGION
  else process.env.REGION = region
  __reiniciarRegionActivaParaPruebas()
}

beforeEach(() => fijarRegion(undefined))
afterEach(() => {
  if (original === undefined) delete process.env.REGION
  else process.env.REGION = original
  __reiniciarRegionActivaParaPruebas()
})

describe('escuela no encontrada · región', () => {
  it('Corrientes mantiene "Volver a ENOS Corrientes" en español', () => {
    fijarRegion(undefined)
    const html = renderToStaticMarkup(<EscuelaFichaNotFound />)
    expect(html).toContain('>Volver a ENOS Corrientes<')
    expect(html).toContain('Establecimiento no disponible')
  })

  it('Manaos muestra "Voltar a ENOS Manaos" en portugués', () => {
    fijarRegion('manaos')
    const html = renderToStaticMarkup(<EscuelaFichaNotFound />)
    expect(html).toContain('>Voltar a ENOS Manaos<')
    expect(html).toContain('Estabelecimento indisponível')
    expect(html).not.toContain('Corrientes')
  })
})
