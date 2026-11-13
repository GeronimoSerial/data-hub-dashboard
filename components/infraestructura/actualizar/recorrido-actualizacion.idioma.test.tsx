// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { MOTIVOS_FIXTURE, TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { RecorridoActualizacion } from './recorrido-actualizacion'

const CUE = '1801605-41'

function estadoActual() {
  return {
    ok: true,
    periodo: { id: 'p', nombre: 'ENOS' },
    parte: { id: 'parte', cueAnexo: CUE, estadoEstablecimiento: 'habitual', estadoEstablecimientoRigeDesde: '2026-10-02T10:00:00.000Z', actualizadaEn: '2026-10-03T10:00:00.000Z' },
    servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
    afectaciones: [],
    recientes: [],
    ultimaCarga: null,
  }
}

function stubCargaPendiente() {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
}

function stubCarga() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = url.includes('/historial') ? { ok: true, movimientos: [] } : estadoActual()
    return new Response(JSON.stringify(body), { status: 200 })
  }))
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear() })

describe('RecorridoActualizacion · idioma', () => {
  it('muestra el aviso de carga en español por defecto', () => {
    stubCargaPendiente()
    const { getByRole } = render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    expect(getByRole('status').textContent).toBe('Buscando el estado actual del establecimiento…')
  })

  it('muestra el aviso de carga en portugués con idioma pt', () => {
    stubCargaPendiente()
    const { getByRole } = render(
      <IdiomaProvider idioma="pt">
        <RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />
      </IdiomaProvider>,
    )
    expect(getByRole('status').textContent).toBe('Buscando o estado atual do estabelecimento…')
  })

  it('el título del asistente sigue el idioma activo', async () => {
    stubCarga()
    const { container } = render(
      <IdiomaProvider idioma="pt">
        <RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />
      </IdiomaProvider>,
    )
    await waitFor(() => expect(container.querySelector('.asistente__titulo')?.textContent).toBe('Atualizar'))
  })
})
