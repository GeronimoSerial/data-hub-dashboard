// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { ReporteInicialForm } from './reporte-inicial-form'
import { jsonResponse } from '@/lib/infraestructura/test-utils/http'
import { vaciarEscriturasBorrador } from '@/lib/infraestructura/parte/borrador-formulario'
import { motivos, turnos } from '@/components/test-utils/parte-formulario'

const props = { cue: '12345678', turnos, motivos }

function renderConIdioma(idioma: 'es' | 'pt') {
  return render(
    <IdiomaProvider idioma={idioma}>
      <ReporteInicialForm {...props} />
    </IdiomaProvider>,
  )
}

beforeEach(async () => {
  cleanup()
  await vaciarEscriturasBorrador()
  localStorage.clear()
  sessionStorage.clear()
  globalThis.indexedDB = new IDBFactory()
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    if (String(input).includes('/borradores/config')) return jsonResponse({ borradoresSync: false, fotos: false, mapaBorradores: false })
    return jsonResponse({ ok: true, movimientoId: 'm1' }, 201)
  })
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  vi.unstubAllGlobals()
  globalThis.indexedDB = new IDBFactory()
  document.body.innerHTML = ''
})

describe('ReporteInicialForm · idioma', () => {
  it('mantiene el asistente en español de Corrientes', async () => {
    renderConIdioma('es')

    expect(await screen.findByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('Elija el tipo de situación, el motivo y la gravedad para continuar.')).toBeInTheDocument()
  })

  it('muestra el asistente en portugués de Brasil', async () => {
    renderConIdioma('pt')

    expect(await screen.findByRole('heading', { name: 'O que aconteceu?' })).toBeInTheDocument()
    expect(screen.getByText('Passo 1 de 5')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('Escolha o tipo de situação, o motivo e a gravidade para continuar.')).toBeInTheDocument()
  })
})
