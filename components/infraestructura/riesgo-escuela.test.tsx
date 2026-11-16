// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { RiesgoEscuela } from './riesgo-escuela'
import { PRESENTACION_CRECIDA } from '@/lib/infraestructura/riesgo/__fixtures__/crecida-rio'

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

  it('muestra el antecedente y la crecida adicional fuera del detalle técnico', async () => {
    fetchMock.mockResolvedValue(jsonOk({ snapshot: snapshot('bajo'), factores: [], crecidaRio: PRESENTACION_CRECIDA }))
    render(<RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={null} />)
    const bloque = await screen.findByRole('region', { name: 'Referencia de crecida del río' })
    expect(bloque).toHaveTextContent('11,28 m')
    expect(bloque).toHaveTextContent('130 m de la escuela')
    expect(bloque).toHaveTextContent('Imagen satelital del 29/11/2023')
    expect(bloque).toHaveTextContent('En 2023, con el río a 11,28 m, el agua quedó a unos 130 m de la escuela.')
    expect(bloque).toHaveTextContent('Última lectura del río')
    expect(bloque).toHaveTextContent('Nivel necesario para llegar al terreno')
    expect(bloque).toHaveTextContent('14,66 m')
    expect(bloque).toHaveTextContent('+3,38 m')
    expect(within(bloque).getByRole('figure', { name: 'Comparación de alturas del río' })).toBeInTheDocument()
    expect(bloque).toHaveTextContent('5,20 m')
    expect(within(bloque).getByText(/Desde la última lectura faltan/)).not.toBeVisible()
    expect(within(bloque).getByText('Cómo se estima')).toBeVisible()
    expect(bloque.closest('details')).toBeNull()
  })

  it.each([
    [24, 0, 'las próximas 24 horas es menos del 1 %'],
    [72, 28, 'las próximas 72 horas es aproximadamente del 28 %'],
    [240, 100, 'los próximos 10 días es más del 99 %'],
  ] as const)('explica la probabilidad del umbral para el horizonte %s sin confundirla con el score', async (horizonte, probabilidad, texto) => {
    fetchMock.mockResolvedValue(jsonOk({ snapshot: snapshot('alto', horizonte), factores: [], crecidaRio: {
      ...PRESENTACION_CRECIDA, probabilidadesPorHorizonte: { 24: null, 72: null, 240: null, [horizonte]: probabilidad },
    } }))
    render(<RiesgoEscuela cueAnexo={CUE} horizonte={horizonte} planificacion={null} />)
    const bloque = await screen.findByRole('region', { name: 'Referencia de crecida del río' })
    expect(bloque).toHaveTextContent(`Según la evolución prevista del río, la probabilidad estimada de que el agua llegue al terreno de la escuela en ${texto}.`)
    expect(bloque).not.toHaveTextContent('50 %')
  })

  it('aclara cuando no hay probabilidad para el horizonte elegido', async () => {
    fetchMock.mockResolvedValue(jsonOk({ snapshot: snapshot('alto'), factores: [], crecidaRio: {
      ...PRESENTACION_CRECIDA, probabilidadesPorHorizonte: { 24: 12, 72: null, 240: 40 },
    } }))
    render(<RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={null} />)
    const bloque = await screen.findByRole('region', { name: 'Referencia de crecida del río' })
    expect(bloque).toHaveTextContent('todavía no se puede estimar la probabilidad')
    expect(bloque).not.toHaveTextContent('12 %')
    expect(bloque).not.toHaveTextContent('40 %')
  })

  it('explica el umbral ya alcanzado sin mostrar crecidas negativas', async () => {
    fetchMock.mockResolvedValue(jsonOk({ snapshot: snapshot('alto'), factores: [], crecidaRio: {
      ...PRESENTACION_CRECIDA, subidaDesdeActualM: -1, defensaCostera: true,
      antecedente: { ...PRESENTACION_CRECIDA.antecedente!, distanciaAguaM: null, subidaHastaUmbralM: 0 },
    } }))
    render(<RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={null} />)
    const bloque = await screen.findByRole('region', { name: 'Referencia de crecida del río' })
    expect(bloque).toHaveTextContent('no alcanzó el terreno de la escuela')
    expect(bloque).toHaveTextContent('aunque la imagen mostró el terreno seco')
    expect(bloque).toHaveTextContent('ya alcanza el nivel estimado')
    expect(bloque).toHaveTextContent('Hay una defensa costera')
    expect(bloque).not.toHaveTextContent('-1')
  })

  it('oculta la referencia anterior mientras cambia de escuela u horizonte', async () => {
    let resolver!: (respuesta: Response) => void
    fetchMock.mockResolvedValueOnce(jsonOk({ snapshot: snapshot('bajo'), factores: [], crecidaRio: PRESENTACION_CRECIDA }))
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolver = resolve }))
    const { rerender } = render(<RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={null} />)
    await screen.findByRole('region', { name: 'Referencia de crecida del río' })
    rerender(<RiesgoEscuela cueAnexo="otra-escuela" horizonte={24} planificacion={null} />)
    expect(screen.queryByRole('region', { name: 'Referencia de crecida del río' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Cargando riesgo actual')
    resolver(jsonOk({ snapshot: snapshot('bajo', 24), factores: [], crecidaRio: null }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.queryByRole('region', { name: 'Referencia de crecida del río' })).not.toBeInTheDocument()
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
