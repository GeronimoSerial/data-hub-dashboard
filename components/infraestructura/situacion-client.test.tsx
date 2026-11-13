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
    cobertura: null,
  },
  briefing: ['Línea 1 del briefing.', 'Línea 2 del briefing.'],
  atraso: { texto: 'al día', atrasado: false, desactivadoPorConfig: false },
  prioridades: [
    { cueAnexo: '1800001-00', departamento: 'PARANA', nivelRiesgo: 'alto', scoreRiesgo: 0.7 },
  ],
  sinRun: false,
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
      sinRun: true,
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

    const selectModo = screen.getByRole('combobox', { name: 'Mostrar por' })
    expect(selectModo).toHaveTextContent('Vigencia (cuándo rige)')
    await user.click(selectModo)
    await user.click(await screen.findByRole('option', { name: 'Registro (cuándo se cargó)' }))
    expect(selectModo).toHaveTextContent('Registro (cuándo se cargó)')
  })

  it('el selector de rango dispara un nuevo fetch de cambios con el "desde" recalculado', async () => {
    const user = userEvent.setup()
    render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)

    await screen.findByText('Sin cambios en el rango seleccionado.')
    const llamadasIniciales = fetchMock.mock.calls.length

    await user.click(screen.getByRole('combobox', { name: 'Rango de cambios' }))
    await user.click(await screen.findByRole('option', { name: 'Últimos 7 días' }))

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
      sinRun: true,
      estadoDatos: null,
    }
    render(<SituacionClient estadoInicial={estadoVacio} />)
    expect(screen.getByText('Todavía no se generó ningún corte.')).toBeInTheDocument()
    expect(document.querySelectorAll('.situacion-kpi')).toHaveLength(0)
  })
})

describe('encabezado: frescura según la corrida de riesgo detrás del corte (I1)', () => {
  it('con la corrida desactualizada muestra "Desactualizado"', () => {
    render(
      <SituacionClient
        estadoInicial={{
          ...ESTADO_CON_CORTE,
          atraso: { texto: 'atrasado', atrasado: true, desactivadoPorConfig: false },
        }}
      />,
    )
    expect(document.querySelector('.situacion-page__generado')?.textContent).toBe(
      'Corte generado el 27/09/2026, 09:00 — Desactualizado',
    )
  })

  it('sin fecha verificable de la corrida muestra "No verificable" y nunca se lee como al día', () => {
    render(
      <SituacionClient
        estadoInicial={{
          ...ESTADO_CON_CORTE,
          atraso: { texto: 'no verificable', atrasado: false, desactivadoPorConfig: false },
        }}
      />,
    )
    const texto = document.querySelector('.situacion-page__generado')?.textContent ?? ''
    expect(texto).toBe('Corte generado el 27/09/2026, 09:00 — No verificable')
    expect(texto).not.toMatch(/Desactualizado/)
  })

  it('con la corrida al día no muestra ningún estado de frescura (control sano)', () => {
    render(<SituacionClient estadoInicial={ESTADO_CON_CORTE} />)
    expect(document.querySelector('.situacion-page__generado')?.textContent).toBe(
      'Corte generado el 27/09/2026, 09:00',
    )
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

function estadoConCobertura(
  cobertura: { procesadas: number; conEvidencia: number; sinEvidencia: number } | null,
): EstadoSituacionCliente {
  const corte = ESTADO_CON_CORTE.corte
  if (corte === null) throw new Error('el fixture necesita corte')
  return { ...ESTADO_CON_CORTE, sinRun: false, corte: { ...corte, cobertura } }
}

const TILE_RIESGO_ALTO = 'situacion-kpi-Escuelas con riesgo alto o muy alto (24 h)'

describe('cobertura junto al KPI de riesgo alto', () => {
  it('muestra "Cobertura 20%" cuando 2 de 10 escuelas tienen evidencia', () => {
    render(<SituacionClient estadoInicial={estadoConCobertura({ procesadas: 10, conEvidencia: 2, sinEvidencia: 8 })} />)
    expect(screen.getByTestId(TILE_RIESGO_ALTO)).toHaveTextContent('Cobertura 20%')
  })

  it('muestra "Cobertura 100%" con cobertura completa', () => {
    render(<SituacionClient estadoInicial={estadoConCobertura({ procesadas: 10, conEvidencia: 10, sinEvidencia: 0 })} />)
    expect(screen.getByTestId(TILE_RIESGO_ALTO)).toHaveTextContent('Cobertura 100%')
  })

  it('sin dato de cobertura no muestra ninguna cifra de cobertura', () => {
    render(<SituacionClient estadoInicial={estadoConCobertura(null)} />)
    expect(screen.getByTestId(TILE_RIESGO_ALTO)).not.toHaveTextContent('Cobertura')
    expect(screen.queryByText(/Cobertura \d+%/)).toBeNull()
  })

  it('con cero escuelas procesadas no inventa un porcentaje', () => {
    render(<SituacionClient estadoInicial={estadoConCobertura({ procesadas: 0, conEvidencia: 0, sinEvidencia: 0 })} />)
    expect(screen.getByTestId(TILE_RIESGO_ALTO)).not.toHaveTextContent('Cobertura')
    expect(screen.getByTestId(TILE_RIESGO_ALTO)).not.toHaveTextContent('NaN')
  })
})

describe('prioridades sin corrida de riesgo', () => {
  it('sin corrida vigente dice "Sin cálculo de riesgo disponible" y no "Sin escuelas en riesgo alto"', () => {
    render(<SituacionClient estadoInicial={{ ...ESTADO_CON_CORTE, prioridades: [], sinRun: true }} />)
    expect(screen.getByText('Sin cálculo de riesgo disponible')).toBeInTheDocument()
    expect(screen.queryByText(/Sin escuelas en riesgo alto/)).toBeNull()
  })

  it('con corrida y cero escuelas en riesgo alto sigue diciendo "Sin escuelas en riesgo alto"', () => {
    render(<SituacionClient estadoInicial={{ ...ESTADO_CON_CORTE, prioridades: [], sinRun: false }} />)
    expect(screen.getByText(/Sin escuelas en riesgo alto/)).toBeInTheDocument()
    expect(screen.queryByText('Sin cálculo de riesgo disponible')).toBeNull()
  })
})

describe('corte legado (sin el campo problema por fuente)', () => {
  it('renderiza sin romper y muestra el KPI de fuentes vencidas tal como quedó persistido', () => {
    const legado: EstadoSituacionCliente = {
      ...ESTADO_CON_CORTE,
      corte: {
        ...ESTADO_CON_CORTE.corte!,
        kpis: { ...ESTADO_CON_CORTE.corte!.kpis, fuentesVencidas: 2 },
        fuentesSalud: [{ provider: 'open-meteo', estado: 'ok', frescuraMinutos: 30, vencida: true }],
      },
    }

    render(<SituacionClient estadoInicial={legado} />)

    expect(screen.getByTestId('situacion-kpi-Fuentes vencidas')).toHaveTextContent('2')
  })
})

describe('situacion-cadena-verificada: línea de la sonda en el encabezado', () => {
  const itemSonda = (estado: string, motivo: string) => ({
    id: 'sonda:cadena', grupo: 'riesgo', nombre: 'Cadena de datos (sonda)', estado, motivo,
    ultimoExitoEn: '2026-10-17T20:30:00.000Z', ultimoIntentoEn: '2026-10-17T20:30:00.000Z', ultimoError: null,
    edadMinutos: 90, intervaloMinutos: 60,
  })
  const conSonda = (item: ReturnType<typeof itemSonda>): EstadoSituacionCliente => ({
    ...ESTADO_CON_CORTE,
    estadoDatos: { items: [item as never], problemas: 0, generadoEn: '2026-10-17T21:00:00.000Z' },
  })

  it('con la sonda ok muestra la línea sin punto final', () => {
    render(<SituacionClient estadoInicial={conSonda(itemSonda('ok', 'Cadena de datos verificada a las 17:30.'))} />)
    expect(screen.getByTestId('situacion-cadena-verificada').textContent).toBe(
      'Cadena de datos verificada a las 17:30',
    )
  })

  it('con la sonda fallida no muestra la línea en el encabezado', () => {
    render(<SituacionClient estadoInicial={conSonda(itemSonda('fallido', 'La cadena de datos falló: x'))} />)
    expect(screen.queryByTestId('situacion-cadena-verificada')).not.toBeInTheDocument()
  })

  it('con la sonda desactualizada no muestra la línea en el encabezado', () => {
    render(<SituacionClient estadoInicial={conSonda(itemSonda('atrasado', 'Última verificación de la cadena de datos a las 15:30 (hace 3 h).'))} />)
    expect(screen.queryByTestId('situacion-cadena-verificada')).not.toBeInTheDocument()
  })

  it('sin estado de datos no muestra la línea', () => {
    render(<SituacionClient estadoInicial={{ ...ESTADO_CON_CORTE, estadoDatos: null }} />)
    expect(screen.queryByTestId('situacion-cadena-verificada')).not.toBeInTheDocument()
  })
})
