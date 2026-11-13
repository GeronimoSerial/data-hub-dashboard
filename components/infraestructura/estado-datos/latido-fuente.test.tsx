// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { textos } from '@/lib/i18n'
import { LatidoFuente } from './latido-fuente'

afterEach(cleanup)
const AHORA = '2026-09-27T12:00:00.000Z'
const hace = (h: number) => new Date(Date.parse(AHORA) - h * 3_600_000).toISOString()

describe('LatidoFuente', () => {
  it('dibuja latidos y muescas rojas, y siempre incluye el texto y el aria-label con conteos', () => {
    render(
      <LatidoFuente
        corridas={[{ en: hace(10), ok: true }, { en: hace(4), ok: false }, { en: hace(1), ok: true }]}
        ahora={AHORA} estado="ok" ultimoIntentoEn={null} ultimoExitoEn={hace(1)} intervaloMinutos={360} t={textos('es')}
      />,
    )
    const raiz = screen.getByTestId('estado-datos-latido')
    expect(raiz).toHaveTextContent('intermitente')
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'intermitente: 2 corridas exitosas y 1 fallidas en las últimas 72 h')
    expect(raiz.querySelector('.situacion-latido__pulso')).not.toBeNull()
    expect(raiz.querySelector('.situacion-latido__falla')).not.toBeNull()
  })

  it('nunca corrió: línea plana y texto', () => {
    render(<LatidoFuente corridas={[]} ahora={AHORA} estado="ok" ultimoIntentoEn={null} ultimoExitoEn={null} intervaloMinutos={1440} t={textos('es')} />)
    const raiz = screen.getByTestId('estado-datos-latido')
    expect(raiz).toHaveTextContent('nunca corrió')
    expect(raiz.querySelector('.situacion-latido__pulso')).toBeNull()
    expect(raiz.querySelector('.situacion-latido__falla')).toBeNull()
  })

  it('sin latido N d y portugués', () => {
    render(<LatidoFuente corridas={[]} ahora={AHORA} estado="ok" ultimoIntentoEn={null} ultimoExitoEn={hace(28 * 24)} intervaloMinutos={1440} t={textos('pt')} />)
    expect(screen.getByTestId('estado-datos-latido')).toHaveTextContent('sem batimento há 28 d')
  })
})
