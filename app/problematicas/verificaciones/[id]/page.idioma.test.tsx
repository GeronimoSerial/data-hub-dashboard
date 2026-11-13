// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import VerificacionPage, { generateMetadata } from './page'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'

const original = process.env.REGION

function fijarRegion(region: string | undefined) {
  if (region === undefined) delete process.env.REGION
  else process.env.REGION = region
  __reiniciarRegionActivaParaPruebas()
}

async function html() {
  const elemento = await VerificacionPage({
    params: Promise.resolve({ id: 'v-1' }),
    searchParams: Promise.resolve({}),
  })
  return renderToStaticMarkup(elemento)
}

beforeEach(() => fijarRegion(undefined))
afterEach(() => {
  if (original === undefined) delete process.env.REGION
  else process.env.REGION = original
  __reiniciarRegionActivaParaPruebas()
})

describe('verificación escolar · idioma', () => {
  it('Corrientes conserva título y aviso en español', async () => {
    fijarRegion(undefined)
    expect(await generateMetadata()).toMatchObject({ title: 'Verificación escolar' })
    expect(await html()).toContain('Este enlace no incluye la credencial de acceso.')
  })

  it('Manaos muestra título y aviso en portugués', async () => {
    fijarRegion('manaos')
    expect(await generateMetadata()).toMatchObject({ title: 'Verificação escolar' })
    expect(await html()).toContain('Este link não inclui a credencial de acesso.')
  })
})
