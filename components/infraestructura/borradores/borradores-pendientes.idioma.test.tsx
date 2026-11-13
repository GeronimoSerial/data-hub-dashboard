// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { BorradoresPendientes } from './borradores-pendientes'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const item = {
  draftId: 'server-draft-1',
  cue: '1801605-60',
  flujo: 'inicial',
  progreso: { pasoActual: 'servicios', pasosCompletados: ['inicio', 'afectaciones'] },
  actividadEn: '2026-10-15T10:00:00.000Z',
  respuestas: { descripcion: 'Corte prolongado' },
}

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/config')
    ? Response.json({ mapaBorradores: true })
    : { ok: true, json: async () => ({ items: [item], nextCursor: null }) }))
}

describe('BorradoresPendientes · idioma', () => {
  it('formatea la última actividad con el mes en portugués cuando el idioma es pt', async () => {
    mockFetch()
    render(
      <IdiomaProvider idioma="pt">
        <BorradoresPendientes cue="1801605-60" count={1} />
      </IdiomaProvider>,
    )

    const valor = (await screen.findByText('Última atividade')).nextElementSibling
    expect(valor?.textContent).toMatch(/de outubro,/)
    expect(valor?.textContent).not.toMatch(/octubre/)
  })

  it('mantiene el mes en español cuando el idioma es es', async () => {
    mockFetch()
    render(
      <IdiomaProvider idioma="es">
        <BorradoresPendientes cue="1801605-60" count={1} />
      </IdiomaProvider>,
    )

    const valor = (await screen.findByText('Última actividad')).nextElementSibling
    expect(valor?.textContent).toMatch(/octubre/)
  })
})
