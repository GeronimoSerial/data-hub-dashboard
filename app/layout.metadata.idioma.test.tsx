import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import RootLayout, { generateMetadata } from './layout'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'

vi.mock('next/font/google', () => ({
  Barlow: () => ({ variable: '' }),
  Barlow_Semi_Condensed: () => ({ variable: '' }),
  Inter: () => ({ variable: '' }),
  Montserrat: () => ({ variable: '' }),
}))
vi.mock('./providers', () => ({ Providers: ({ children }: { children: unknown }) => children }))
vi.mock('lightgallery/css/lightgallery.css', () => ({}))
vi.mock('lightgallery/css/lg-thumbnail.css', () => ({}))
vi.mock('lightgallery/css/lg-zoom.css', () => ({}))
vi.mock('./globals.css', () => ({}))

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

describe('metadata raíz por región', () => {
  it('Corrientes conserva el título y la marca en español', async () => {
    fijarRegion(undefined)
    const meta = await generateMetadata()
    expect(meta.title).toEqual({
      default: 'Hub de Datos · Ministerio de Educación de Corrientes',
      template: '%s · Hub de Datos',
    })
    expect(meta.applicationName).toBe('Hub de Datos')
    expect(meta.openGraph).toMatchObject({
      title: 'Hub de Datos · Ministerio de Educación de Corrientes',
      siteName: 'Hub de Datos',
    })
  })

  it('Manaos usa el producto y la región en portugués, sin Corrientes', async () => {
    fijarRegion('manaos')
    const meta = await generateMetadata()
    expect(meta.title).toEqual({
      default: 'Hub de Dados · Ministério de Educação de Manaos',
      template: '%s · Hub de Dados',
    })
    expect(meta.applicationName).toBe('Hub de Dados')
    expect(meta.openGraph).toMatchObject({
      title: 'Hub de Dados · Ministério de Educação de Manaos',
      siteName: 'Hub de Dados',
    })
    const titulos = [meta.title, meta.applicationName, meta.openGraph?.title, meta.openGraph?.siteName]
    expect(JSON.stringify(titulos)).not.toContain('Corrientes')
  })

  it('Corrientes conserva descripción, Open Graph y locale byte a byte', async () => {
    fijarRegion(undefined)
    const meta = await generateMetadata()
    expect(meta.description).toBe(
      'Reportes, tableros y mapas del sistema educativo de la Provincia de Corrientes, publicados por el Ministerio de Educación para el análisis y la toma de decisiones.',
    )
    expect(meta.openGraph?.description).toBe(
      'Reportes, tableros y mapas del sistema educativo de la Provincia de Corrientes.',
    )
    expect(meta.openGraph?.locale).toBe('es_AR')
  })

  it('Manaos describe la región en portugués con locale pt_BR, sin Corrientes', async () => {
    fijarRegion('manaos')
    const meta = await generateMetadata()
    expect(meta.description).toBe(
      'Relatórios, painéis e mapas do sistema educacional de Manaos, publicados pelo Ministério de Educação para análise e tomada de decisões.',
    )
    expect(meta.openGraph?.description).toBe('Relatórios, painéis e mapas do sistema educacional de Manaos.')
    expect(meta.openGraph?.locale).toBe('pt_BR')
    expect(JSON.stringify([meta.description, meta.openGraph?.description])).not.toContain('Corrientes')
  })
})

describe('idioma del documento por región', () => {
  it('Corrientes declara lang es-AR', () => {
    fijarRegion(undefined)
    expect(htmlDeLaRaiz().props.lang).toBe('es-AR')
  })

  it('Manaos declara lang pt-BR', () => {
    fijarRegion('manaos')
    expect(htmlDeLaRaiz().props.lang).toBe('pt-BR')
  })
})

function htmlDeLaRaiz(): ReactElement<{ lang: string }> {
  return RootLayout({ children: null }) as ReactElement<{ lang: string }>
}
