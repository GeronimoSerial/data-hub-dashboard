// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { RiesgoEscuela } from './riesgo-escuela'

const CUE = '1801605-04'

function jsonOk(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

function fail(): Response {
  return { ok: false, status: 500, json: async () => ({}) } as Response
}

const FACTOR_RIO = {
  tipo: 'amenaza',
  fuente: 'rio-prefectura',
  variable: 'altura_rio',
  valor: 4.03,
  unidad: 'm',
  contribucion: 31.25,
  explicacion:
    'Rio parana en pna-ituzaingo: 4.03m, estado evacuacion (alerta 3.5m, evacuacion 4m), tendencia crece; escuela expuesta por clase_rio=alto',
  observadoEn: null,
}

function snapshot(nivelRiesgo: 'bajo' | 'moderado' | 'alto' | 'muy_alto' | null, horizonteHoras = 72) {
  return {
    nivelRiesgo,
    scoreRiesgo: 50,
    horizonteHoras,
    calculadoEn: '2026-10-14T02:26:32.861Z',
  }
}

const PLANIFICACION = [{ etiquetaVista: 'Vista regional', etiquetaNivel: 'Prioridad alta' }]

describe('RiesgoEscuela', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('muestra el nivel, la conclusion y la zona expuesta de Ituzaingo y pide el horizonte 72', async () => {
    fetchMock.mockResolvedValue(jsonOk({ snapshot: snapshot('alto'), factores: [FACTOR_RIO] }))

    render(<RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={PLANIFICACION} />)

    const bloque = await screen.findByTestId('riesgo-escuela-actual')
    await waitFor(() => expect(screen.getByTestId('riesgo-escuela-nivel')).toHaveTextContent('Alto'))
    const conclusion = screen.getByTestId('riesgo-escuela-conclusion').textContent ?? ''
    expect(conclusion).toContain('Riesgo actual alto')
    expect(conclusion).not.toContain('Sin señales')
    expect(within(bloque).getByText('Zona expuesta a crecidas')).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('?horizonte=72')
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/api/infraestructura/riesgo/escuela/${CUE}`)
  })

  it.each([
    ['bajo', 'Bajo'],
    ['moderado', 'Moderado'],
    ['alto', 'Alto'],
    ['muy_alto', 'Muy alto'],
  ] as const)('el nivel titular coincide con el snapshot %s', async (nivelRiesgo, etiqueta) => {
    fetchMock.mockResolvedValue(jsonOk({ snapshot: snapshot(nivelRiesgo), factores: [] }))

    render(<RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={PLANIFICACION} />)

    const nivel = await screen.findByTestId('riesgo-escuela-nivel')
    await waitFor(() => expect(nivel).toHaveTextContent(etiqueta))
    expect(nivel).toHaveClass(`riesgo-escuela__nivel--${nivelRiesgo}`)
  })

  it('muestra Sin datos cuando no hay snapshot', async () => {
    fetchMock.mockResolvedValue(jsonOk({ snapshot: null, factores: [] }))

    render(<RiesgoEscuela cueAnexo={CUE} horizonte={24} planificacion={null} />)

    await waitFor(() => expect(screen.getByTestId('riesgo-escuela-nivel')).toHaveTextContent('Sin datos'))
  })

  it('muestra el aviso de error cuando la respuesta no es ok', async () => {
    fetchMock.mockResolvedValue(fail())

    render(<RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={PLANIFICACION} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el riesgo actual.')
  })

  it('muestra el aviso de error cuando el fetch falla', async () => {
    fetchMock.mockRejectedValue(new Error('red caída'))

    render(<RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={PLANIFICACION} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el riesgo actual.')
  })

  it('omite el bloque de planificacion cuando todos sus valores son nulos o cero', async () => {
    fetchMock.mockResolvedValue(jsonOk({ snapshot: snapshot('bajo'), factores: [] }))

    render(
      <RiesgoEscuela
        cueAnexo={CUE}
        horizonte={72}
        planificacion={[
          { etiquetaVista: 'Vista aislamiento', etiquetaNivel: 'Nulo' },
          { etiquetaVista: 'Vista inundación', etiquetaNivel: 'Nulo' },
          { etiquetaVista: 'Veces con situaciones', etiquetaNivel: 'Nulo (0)' },
        ]}
      />,
    )

    await screen.findByTestId('riesgo-escuela-actual')
    expect(screen.queryByTestId('riesgo-escuela-planificacion')).not.toBeInTheDocument()
    expect(screen.queryByText('Prioridad para obras y prevención')).not.toBeInTheDocument()
  })

  it('muestra las etiquetas de planificacion y el aviso cuando no hay dato', async () => {
    fetchMock.mockResolvedValue(jsonOk({ snapshot: snapshot('bajo'), factores: [] }))

    const { unmount } = render(
      <RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={PLANIFICACION} />,
    )
    const planificacion = screen.getByTestId('riesgo-escuela-planificacion')
    expect(planificacion).toHaveTextContent('Prioridad para obras y prevención')
    expect(within(planificacion).getByText('Prioridad alta')).toBeInTheDocument()
    expect(within(planificacion).getByText(/Vista regional/)).toBeInTheDocument()
    expect(within(planificacion).getByText(/Depende de la ubicación y los antecedentes/)).toBeInTheDocument()
    unmount()

    render(<RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={null} />)
    expect(screen.queryByTestId('riesgo-escuela-planificacion')).not.toBeInTheDocument()
  })
})
