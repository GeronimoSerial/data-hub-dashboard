// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { formatearCargaCorta } from './historial-formato'
import { VerificacionResponder, type VerificacionEnlace } from './verificacion-responder'
import { jsonResponse } from '@/lib/infraestructura/test-utils/http'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const ISO = '2026-09-18T13:35:00.000Z'
const RESPONDIDA: VerificacionEnlace = {
  cueAnexo: '1801605-04',
  estado: 'respondida',
  resultado: 'no_disponible',
  respondidaEn: ISO,
  discrepancia: 0,
}

function renderConIdioma(idioma: 'es' | 'pt') {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, verificacion: RESPONDIDA })))
  return render(
    <IdiomaProvider idioma={idioma}>
      <VerificacionResponder verificacionId="verif-1" token="token-secreto" />
    </IdiomaProvider>,
  )
}

describe('VerificacionResponder · fecha del comprobante por idioma', () => {
  it('formatea la fecha de respuesta en portugués cuando el idioma es pt', async () => {
    renderConIdioma('pt')
    const esperada = formatearCargaCorta(ISO, 'pt')
    expect(esperada).not.toBe(formatearCargaCorta(ISO, 'es'))
    expect(await screen.findByText(esperada, { exact: false })).toBeInTheDocument()
  })

  it('mantiene la fecha en español cuando el idioma es es', async () => {
    renderConIdioma('es')
    expect(await screen.findByText(formatearCargaCorta(ISO, 'es'), { exact: false })).toBeInTheDocument()
  })
})
