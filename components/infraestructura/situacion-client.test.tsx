// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { formatearFecha, SituacionClient, type EstadoSituacionCliente } from './situacion-client'

const ESTADO_CON_CORTE: EstadoSituacionCliente = {
  corte: {
    id: 'corte-1',
    generadoEn: '2026-09-27T12:00:00.000Z',
    kpis: {
      escuelasAfectacionConfirmadaVigente: 2,
      escuelasRiesgoAlto24h: 3,
      fuentesVencidas: 1,
    },
    conteosPorNivelRiesgo: { bajo: 5, moderado: 2, alto: 2, muy_alto: 1 },
    fuentesSalud: [
      { provider: 'open-meteo', estado: 'ok', frescuraMinutos: 5, vencida: false },
      { provider: 'nasa-gpm', estado: 'ok', frescuraMinutos: null, vencida: false },
    ],
    episodiosAbiertos: 1,
    episodiosCerradosDesdeAnterior: 0,
  },
  briefing: ['Línea 1 del briefing.', 'Línea 2 del briefing.'],
  atraso: { texto: 'al día', atrasado: false, desactivadoPorConfig: false },
  prioridades: [
    { cueAnexo: '1800001-00', departamento: 'PARANA', nivelRiesgo: 'alto', scoreRiesgo: 0.7 },
  ],
  estadoDatos: {
    items: [
      {
        id: 'job:climatologia-caudal', grupo: 'climatologias', nombre: 'Climatología de caudal', estado: 'fallido',
        motivo: 'Falló la última corrida (intento 3).', ultimoExitoEn: '2026-09-26T21:50:00.000Z',
        ultimoIntentoEn: '2026-09-27T11:00:00.000Z', ultimoError: 'GloFAS respondió 503', edadMinutos: 850,
        intervaloMinutos: 1440,
      },
    ],
    problemas: 1,
    generadoEn: '2026-09-27T12:00:00.000Z',
  },
}

const CAMBIOS_VACIOS = { porRegistro: [], porVigencia: [] }

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/situacion/cambios')) {
      return { ok: true, json: async () => CAMBIOS_VACIOS }
    }
    return { ok: true, json: async () => ESTADO_CON_CORTE }
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('SituacionClient', () => {
  it('pinta el estado inicial sin esperar ningún fetch (llega ya resuelto del servidor)', () => {
    render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)

    expect(screen.getByText('Centro de Situación')).toBeInTheDocument()
    expect(
      screen.getByTestId('situacion-kpi-Escuelas con afectación confirmada vigente'),
    ).toHaveTextContent('2')
    expect(screen.getByTestId('situacion-kpi-Escuelas con riesgo alto o muy alto (24 h)')).toHaveTextContent('3')
    expect(screen.getByTestId('situacion-kpi-Fuentes vencidas')).toHaveTextContent('1')
  })

  it('enlaza la exportación CSV al endpoint cuando hay corte y la deshabilita sin corte', () => {
    const { unmount } = render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)
    expect(screen.getByRole('link', { name: 'Exportar CSV' })).toHaveAttribute(
      'href', '/api/infraestructura/situacion/export?formato=csv',
    )
    const estadoVacio: EstadoSituacionCliente = {
      corte: null,
      briefing: [],
      atraso: { texto: '—', atrasado: true, desactivadoPorConfig: false },
      prioridades: [],
      estadoDatos: null,
    }
    unmount()
    render(<SituacionClient estadoInicial={estadoVacio} />)
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled()
  })

  it('muestra a lo sumo 3 KPIs y ninguna segunda fila permanente de indicadores', () => {
    render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)
    const kpis = document.querySelectorAll('.situacion-kpi')
    expect(kpis).toHaveLength(3)
  })

  it('el briefing es una lista corta (no un texto largo ni un acordeón)', () => {
    render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)
    const items = screen.getAllByText(/Línea \d del briefing\./)
    expect(items).toHaveLength(2)
  })

  it('muestra el estado de los datos con los problemas visibles (reemplaza la lista cruda de fuentes)', () => {
    render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)
    const panel = screen.getByTestId('estado-datos')
    expect(panel).toHaveAttribute('open')
    expect(panel).toHaveTextContent('1 fuente con problemas')
    expect(panel).toHaveTextContent('GloFAS respondió 503')
    expect(screen.queryByTestId('situacion-fuentes')).not.toBeInTheDocument()
  })

  it('el copy no usa nunca "alerta" ni "SMN"', () => {
    render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)
    const texto = document.body.textContent ?? ''
    expect(texto).not.toMatch(/alerta/i)
    expect(texto).not.toMatch(/\bSMN\b/)
  })

  it('el selector "Cambios desde" permite elegir registro vs vigencia por teclado', async () => {
    const user = userEvent.setup()
    render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)

    const selectModo = screen.getByLabelText('Mostrar por') as HTMLSelectElement
    expect(selectModo.value).toBe('vigencia')
    await user.selectOptions(selectModo, 'registro')
    expect(selectModo.value).toBe('registro')
  })

  it('el selector de rango dispara un nuevo fetch de cambios con el "desde" recalculado', async () => {
    const user = userEvent.setup()
    render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)

    await screen.findByText('Sin cambios en el rango seleccionado.')
    const llamadasIniciales = fetchMock.mock.calls.length

    const selectRango = screen.getByLabelText('Rango de cambios') as HTMLSelectElement
    await user.selectOptions(selectRango, '7d')

    expect(fetchMock.mock.calls.length).toBeGreaterThan(llamadasIniciales)
    const ultimaUrl = fetchMock.mock.calls.at(-1)?.[0] as string
    expect(ultimaUrl).toContain('/api/infraestructura/situacion/cambios?desde=')
  })

  it('el refresco automático usa una región aria-live sin robar el foco del elemento activo', () => {
    render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)

    const selectRango = screen.getByLabelText('Rango de cambios')
    selectRango.focus()
    expect(document.activeElement).toBe(selectRango)

    const region = screen.getByTestId('situacion-live')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region.className).toContain('sr-only')

    // El foco sigue exactamente donde el usuario lo dejó: nada en el
    // componente llama .focus() ni scrollIntoView por su cuenta.
    expect(document.activeElement).toBe(selectRango)
  })

  it('sin corte todavía, no rompe y muestra el estado vacío explícito', () => {
    const estadoVacio: EstadoSituacionCliente = {
      corte: null,
      briefing: [],
      atraso: { texto: '—', atrasado: true, desactivadoPorConfig: false },
      prioridades: [],
      estadoDatos: null,
    }
    render(<SituacionClient estadoInicial={estadoVacio} />)
    expect(screen.getByText('Todavía no se generó ningún corte.')).toBeInTheDocument()
    expect(document.querySelectorAll('.situacion-kpi')).toHaveLength(0)
  })
})

describe('formatearFecha — igual en servidor y navegador (sin error de hidratación)', () => {
  it('formatea un instante fijo en hora de Buenos Aires, 24 h, sin depender del ICU del runtime', () => {
    expect(formatearFecha('2026-10-14T12:05:00.000Z')).toBe('14/10/2026, 09:05')
    expect(formatearFecha('2026-10-14T03:00:00.000Z')).toBe('14/10/2026, 00:00')
    expect(formatearFecha('2026-10-14T20:30:00.000Z')).toBe('14/10/2026, 17:30')
  })

  it('el encabezado del corte usa ese mismo texto', () => {
    render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)
    expect(document.querySelector('.situacion-page__generado')?.textContent).toBe('Corte generado el 27/09/2026, 09:00')
  })

  it('devuelve el texto tal cual si no es una fecha válida', () => {
    expect(formatearFecha('no-es-fecha')).toBe('no-es-fecha')
  })
})
