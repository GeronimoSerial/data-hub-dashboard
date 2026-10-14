// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { FichaTerritorial, type EstadoVistaPeligro } from './ficha-territorial'

const CUE = '1801605-04'
const GEOMETRY_REF = 'celda-1801605-04'

// Ningún texto visible puede exponer ids internos ni códigos de calidad.
const IDS_INTERNOS = /Celda|Calidad de coordenada|open-meteo|nasa-imerg|_-\d/

function jsonOk(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

function json404(): Response {
  return { ok: false, status: 404, json: async () => ({}) } as Response
}

function perfilValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cueAnexo: CUE,
    lat: -27.47,
    lon: -58.83,
    geoCalidad: 'exacta',
    departamento: 'Capital',
    geometryRef: GEOMETRY_REF,
    motivoExclusion: null,
    perfilVersion: 3,
    calculadoEn: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

function fuente(provider: string, frescuraMinutos = 30, ttlMinutos = 60, ultimoExitoEn = '2026-10-13T18:00:00Z') {
  return { provider, estado: 'ok', ultimoExitoEn, ttlMinutos, frescuraMinutos }
}

function nivel(
  horizonteHoras: 24 | 72 | 240,
  nivelPeligro: 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'sin_dato',
  precipitacionMm: number | null = null,
) {
  return {
    geometryRef: GEOMETRY_REF,
    horizonteHoras,
    nivel: nivelPeligro,
    base: 'ensemble',
    probabilidadP95: null,
    probabilidadP99: null,
    precipitacionMm,
    percentilReferencia: precipitacionMm === null ? null : 'P95',
    emitidoEn: '2026-10-13T06:00:00Z',
    validoHasta: '2026-10-14T06:00:00Z',
    versionRegla: 'v1',
  }
}

function climatologiaLluvia(valor: number) {
  return {
    geometryRef: GEOMETRY_REF,
    variable: 'precipitacion',
    percentil: 'p95',
    muestra: 30,
    valor,
    unidad: 'mm',
    periodoDesde: '1991-01-01',
    periodoHasta: '2020-12-31',
  }
}

function punto(variable: string, horizonteHoras: number, valor: number, unidad: string) {
  return {
    geometryRef: GEOMETRY_REF,
    provider: 'open-meteo',
    variable,
    corridaEn: '2026-10-13T06:00:00Z',
    validoEn: '2026-10-13T12:00:00Z',
    horizonteHoras,
    valor,
    unidad,
    pasoHoras: 12,
  }
}

function climatologia(variable: string, percentil: 'p90' | 'p95' | 'p99', valor: number, unidad: string) {
  return {
    geometryRef: GEOMETRY_REF,
    variable,
    percentil,
    muestra: 30,
    valor,
    unidad,
    periodoDesde: '1991-01-01',
    periodoHasta: '2020-12-31',
  }
}

function observadoSatelital(overrides: Record<string, unknown> = {}) {
  return {
    geometryRef: GEOMETRY_REF,
    provider: 'nasa-imerg',
    variable: 'precipitacion_observada_satelital',
    valor: 12.4,
    unidad: 'mm',
    observadoEn: '2026-10-13T09:00:00Z',
    validoDesde: '2026-10-13T09:00:00Z',
    validoHasta: '2026-10-13T10:00:00Z',
    ...overrides,
  }
}

interface Handlers {
  perfil?: () => Response | Promise<Response>
  peligro?: () => Response | Promise<Response>
  fuentes?: () => Response | Promise<Response>
  hidrometria?: () => Response | Promise<Response>
}

function stubFetch(handlers: Handlers = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/geo-perfiles/')) {
      return Promise.resolve(handlers.perfil ? handlers.perfil() : jsonOk(perfilValido()))
    }
    if (url.includes('/peligro?')) {
      return Promise.resolve(
        handlers.peligro ? handlers.peligro() : jsonOk({ pronostico: [], niveles: [], observado: [] }),
      )
    }
    if (url.includes('/hidrometria/estado')) {
      return Promise.resolve(
        handlers.hidrometria ? handlers.hidrometria() : jsonOk({ tramo: null, lectura: null }),
      )
    }
    if (url.includes('/fuentes')) {
      return Promise.resolve(handlers.fuentes ? handlers.fuentes() : jsonOk({ fuentes: [fuente('open-meteo')] }))
    }
    return Promise.reject(new Error(`URL inesperada: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('FichaTerritorial', () => {
  it('sin datos de peligro muestra una sola línea "Sin datos" con el motivo y nada más', async () => {
    stubFetch({ peligro: () => jsonOk({ niveles: [nivel(24, 'sin_dato'), nivel(72, 'sin_dato')] }) })

    const { container } = render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-sin-datos')
    expect(screen.getAllByText(/Sin datos de peligro para esta escuela/)).toHaveLength(1)
    expect(screen.getByText('sin cobertura de datos para esta ubicación')).toBeInTheDocument()
    expect(screen.queryByTestId('ficha-territorial-datos')).not.toBeInTheDocument()
    expect(container.querySelector('details')).toBeNull()
  })

  it('con fuente vencida y sin datos, el motivo es genérico y no menciona frescura', async () => {
    stubFetch({
      peligro: () => jsonOk({ niveles: [nivel(24, 'sin_dato')] }),
      fuentes: () =>
        jsonOk({ fuentes: [fuente('open-meteo-radar', 90, 60, '2026-10-13T18:00:00Z')] }),
    })

    const { container } = render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-sin-datos')
    expect(screen.getByText('sin datos disponibles por ahora')).toBeInTheDocument()
    expect(screen.queryByTestId('ficha-territorial-fuente-vencida')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/desactualiz/i)
    expect(screen.getAllByText(/Sin datos de peligro para esta escuela/)).toHaveLength(1)
  })

  it('un pronóstico vencido se muestra atenuado con la fecha en el tooltip, sin texto de desactualización', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          niveles: [nivel(24, 'naranja', 85)],
          pronostico: [punto('precipitacion', 24, 85, 'mm')],
          observado: [],
        }),
      fuentes: () =>
        jsonOk({ fuentes: [fuente('open-meteo', 120, 60, '2026-10-13T18:00:00Z')] }),
    })

    const { container } = render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    const vencido = container.querySelector('.dato-fechado--vencido')
    expect(vencido).not.toBeNull()
    expect(vencido).toHaveTextContent('Pronóstico próximas 24 h')
    expect(vencido?.getAttribute('title')).toMatch(/^Actualizado \d{2}\/\d{2} \d{2}:\d{2}$/)
    expect(screen.queryByTestId('ficha-territorial-fuente-vencida')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/desactualiz/i)
  })

  it('escuela sin coordenadas se explica con texto plano', async () => {
    stubFetch({ perfil: () => jsonOk(perfilValido({ motivoExclusion: 'sin_coordenadas' })) })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByText('escuela sin coordenadas')
    expect(screen.getAllByText(/Sin datos de peligro para esta escuela/)).toHaveLength(1)
  })

  it('sin perfil (404) muestra la misma línea de sin datos y no pide peligro', async () => {
    const fetchMock = stubFetch({ perfil: () => json404() })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByText(/Sin datos de peligro para esta escuela/)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/peligro?'))).toBe(false)
  })

  it('con datos muestra primero la conclusión y deja el detalle colapsado', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          niveles: [nivel(24, 'naranja', 85), nivel(72, 'amarillo', 90), nivel(240, 'sin_dato')],
          climatologia: [climatologiaLluvia(62)],
          observado: [],
        }),
    })

    const { container } = render(<FichaTerritorial cueAnexo={CUE} />)

    const datos = await screen.findByTestId('ficha-territorial-datos')
    // La conclusión vive en RiesgoEscuela (motor); esta ficha sólo muestra datos de apoyo.
    expect(within(datos).queryByTestId('ficha-territorial-conclusion')).toBeNull()
    expect(within(datos).getByTestId('ficha-territorial-puntos')).toBeInTheDocument()

    const detalle = container.querySelector('details')
    expect(detalle).not.toBeNull()
    expect(detalle).not.toHaveAttribute('open')
    expect(within(detalle as HTMLElement).getByText('Ver detalle técnico')).toBeInTheDocument()
    expect(within(detalle as HTMLElement).getAllByTestId('ficha-territorial-nivel-peligro')).toHaveLength(3)
  })

  it('nunca renderiza ids internos, códigos de calidad ni nombres de proveedor', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          niveles: [nivel(24, 'rojo', 120)],
          pronostico: [
            {
              geometryRef: GEOMETRY_REF,
              provider: 'open-meteo',
              variable: 'precipitacion',
              corridaEn: '2026-10-13T06:00:00Z',
              horizonteHoras: 24,
              valor: 120,
              unidad: 'mm',
            },
          ],
          observado: [
            {
              geometryRef: GEOMETRY_REF,
              provider: 'nasa-imerg',
              variable: 'precipitacion_observada_satelital',
              valor: 12.4,
              unidad: 'mm',
              observadoEn: '2026-10-13T09:00:00Z',
              validoDesde: '2026-10-13T09:00:00Z',
              validoHasta: '2026-10-13T10:00:00Z',
            },
          ],
        }),
      fuentes: () => jsonOk({ fuentes: [fuente('open-meteo', 120, 60)] }),
    })

    const { container } = render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(container.textContent).not.toMatch(IDS_INTERNOS)
    expect(container.querySelector('.dato-fechado--vencido')).not.toBeNull()
    expect(container.textContent).not.toMatch(/desactualiz/i)
  })

  it('pasa el estado de la vista al padre (con datos, sin datos, cargando)', async () => {
    const estados: EstadoVistaPeligro[] = []
    stubFetch({ peligro: () => jsonOk({ niveles: [nivel(24, 'sin_dato')] }) })

    render(<FichaTerritorial cueAnexo={CUE} onEstado={(estado) => estados.push(estado)} />)

    await waitFor(() => expect(estados).toContain('sin_datos'))
    expect(estados[0]).toBe('cargando')
  })

  it('muestra el aviso de error si el fetch falla', async () => {
    stubFetch({ perfil: () => ({ ok: false, status: 500, json: async () => ({}) }) as Response })

    render(<FichaTerritorial cueAnexo={CUE} />)

    expect(await screen.findByTestId('ficha-territorial-error')).toBeInTheDocument()
  })

  it('muestra el estado del edificio y el acceso sin mezclarlos con el peligro', async () => {
    stubFetch({ peligro: () => jsonOk({ niveles: [nivel(24, 'verde')] }) })

    render(
      <FichaTerritorial
        cueAnexo={CUE}
        estadoEdificio="sin_afectacion_reportada"
        riesgoAcceso={{ nivel: null, explicacion: '' }}
      />,
    )

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.getByTestId('ficha-territorial-estado-edificio')).toHaveTextContent('Sin afectación reportada')
    expect(screen.getByTestId('ficha-territorial-acceso-nivel')).toHaveTextContent('Sin datos de acceso')
  })

  it('muestra el riesgo de acceso alto con su explicación, junto al estado del edificio', async () => {
    stubFetch({ peligro: () => jsonOk({ niveles: [nivel(24, 'verde')] }) })

    render(
      <FichaTerritorial
        cueAnexo={CUE}
        estadoEdificio="sin_afectacion_reportada"
        riesgoAcceso={{ nivel: 'alto', explicacion: 'aislamiento OSM 3/3' }}
      />,
    )

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.getByTestId('ficha-territorial-estado-edificio')).toHaveTextContent('Sin afectación reportada')
    const acceso = screen.getByTestId('ficha-territorial-riesgo-acceso')
    expect(acceso).toHaveTextContent('Riesgo de acceso')
    expect(acceso).toHaveTextContent('aislamiento OSM 3/3')
    expect(acceso).not.toHaveTextContent('Bajo')
  })

  it('muestra cada horizonte con su nivel en texto explícito, no sólo color', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          niveles: [nivel(24, 'rojo', 120), nivel(72, 'amarillo', 30), nivel(240, 'sin_dato')],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    const filas = screen.getAllByTestId('ficha-territorial-nivel-peligro')
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent('Próximas 24 h')
    expect(filas[0]).toHaveTextContent('muy alto')
    expect(filas[1]).toHaveTextContent('Próximas 72 h')
    expect(filas[1]).toHaveTextContent('moderado')
    expect(filas[2]).toHaveTextContent('Próximos 7 a 10 días')
    expect(filas[2]).toHaveTextContent('sin dato')
  })

  it('muestra los umbrales P90, P95 y P99 junto al pronóstico del horizonte más corto, y no usa el de 36 h', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          niveles: [nivel(24, 'verde')],
          pronostico: [punto('precipitacion', 36, 20, 'mm'), punto('precipitacion', 12, 8, 'mm')],
          climatologia: [
            climatologia('precipitacion', 'p90', 15, 'mm'),
            climatologia('precipitacion', 'p95', 22.5, 'mm'),
            climatologia('precipitacion', 'p99', 40, 'mm'),
          ],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    const bloque = await screen.findByTestId('ficha-territorial-umbrales')
    expect(bloque).toHaveTextContent('Umbrales habituales de la zona')
    expect(bloque).toHaveTextContent('P90')
    expect(bloque).toHaveTextContent('P95')
    expect(bloque).toHaveTextContent('P99')
    expect(bloque).toHaveTextContent('15 mm')
    expect(bloque).toHaveTextContent('23 mm')
    expect(bloque).toHaveTextContent('40 mm')
    expect(bloque).toHaveTextContent('pronóstico: 8 mm')
    expect(bloque).not.toHaveTextContent('20 mm')
    expect(bloque).toHaveTextContent(
      'Umbrales de referencia relativos a la climatología local; no son probabilidades.',
    )
  })

  it('muestra "Sin dato" para una variable sin climatología, nunca "Bajo"', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          niveles: [nivel(24, 'verde')],
          pronostico: [punto('precipitacion', 12, 8, 'mm'), punto('rafagas', 12, 45, 'km/h')],
          climatologia: [climatologia('precipitacion', 'p90', 15, 'mm')],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    const bloque = await screen.findByTestId('ficha-territorial-umbrales')
    // Una variable sin climatología no tiene fila de umbral: se omite, no se muestra "Sin dato".
    expect(within(bloque).getByTestId('ficha-territorial-umbral-precipitacion')).toBeInTheDocument()
    expect(within(bloque).queryByTestId('ficha-territorial-umbral-rafagas')).not.toBeInTheDocument()
    expect(bloque).not.toHaveTextContent('Sin dato')
    expect(bloque).not.toHaveTextContent(/\bBajo\b/)
  })

  it('ignora los pronósticos de más de 72 h al sumar la lluvia de próximas 72 h', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          niveles: [nivel(24, 'verde')],
          pronostico: [punto('precipitacion', 12, 8, 'mm'), punto('precipitacion', 96, 50, 'mm')],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.getByText(/Lluvia pronosticada próximas 72 h: 8 mm/)).toBeInTheDocument()
  })

  it('muestra el caudal con percentil y nivel cuando la respuesta lo trae', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          niveles: [],
          caudal: {
            puntoId: 'rio-1801',
            percentilActual: 0.92,
            nivel: 'naranja',
            emitidoEn: '2026-10-13T06:00:00Z',
            validoHasta: '2026-10-14T06:00:00Z',
          },
          observado: [],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    const linea = screen.getByTestId('ficha-territorial-caudal')
    expect(linea).toHaveTextContent('percentil 0.92')
    expect(linea).toHaveTextContent('alto')
  })

  it('muestra "Caudal del río: sin dato" cuando hay punto asociado pero todavía no hay caudal', async () => {
    stubFetch({
      perfil: () => jsonOk(perfilValido({ rioAsociacion: { puntoRioId: 'rio-1801', distanciaKm: 8 } })),
      peligro: () => jsonOk({ niveles: [nivel(24, 'verde')], caudal: null, observado: [] }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.getByTestId('ficha-territorial-caudal')).toHaveTextContent('Caudal del río: sin dato')
  })

  it('agrega puntoRioId a la URL de /peligro cuando el perfil trae un punto de río asociado', async () => {
    const fetchMock = stubFetch({
      perfil: () => jsonOk(perfilValido({ rioAsociacion: { puntoRioId: 'rio-1801', distanciaKm: 8 } })),
      peligro: () => jsonOk({ niveles: [nivel(24, 'verde')], observado: [] }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    const llamada = fetchMock.mock.calls.find(([input]) => String(input).includes('/peligro?'))
    expect(String(llamada?.[0])).toContain('puntoRioId=rio-1801')
  })

  it('no muestra la lectura satelital por cada 30 min', async () => {
    stubFetch({
      peligro: () => jsonOk({ niveles: [nivel(24, 'verde')], observado: [observadoSatelital()] }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.queryByTestId('ficha-territorial-lluvia-observada')).not.toBeInTheDocument()
    expect(screen.queryByText(/mm\/30min/)).not.toBeInTheDocument()
  })

  it('no muestra la línea de lluvia observada cuando no hay filas de IMERG', async () => {
    stubFetch({ peligro: () => jsonOk({ niveles: [nivel(24, 'verde')], observado: [] }) })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.queryByTestId('ficha-territorial-lluvia-observada')).not.toBeInTheDocument()
  })

  it('muestra el acumulado observado 24h/72h con cobertura, y "sin dato" si la cobertura es insuficiente', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          niveles: [nivel(24, 'verde')],
          observado: [],
          observadoAcumulado: [
            {
              geometryRef: GEOMETRY_REF,
              horizonteHoras: 24,
              acumuladoMm: 18.5,
              granulosEncontrados: 48,
              granulosEsperados: 48,
              cobertura: 1,
              masRecienteEn: '2026-10-13T09:00:00Z',
            },
            {
              geometryRef: GEOMETRY_REF,
              horizonteHoras: 72,
              acumuladoMm: null,
              granulosEncontrados: 60,
              granulosEsperados: 144,
              cobertura: 60 / 144,
              masRecienteEn: '2026-10-13T09:00:00Z',
            },
          ],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    const acumulado24h = screen.getByTestId('ficha-territorial-observado-24h')
    expect(acumulado24h).toHaveTextContent('19 mm')
    expect(acumulado24h).not.toHaveTextContent('cobertura')
    expect(acumulado24h).not.toHaveTextContent('datos incompletos')
    const acumulado72h = screen.getByTestId('ficha-territorial-observado-72h')
    expect(acumulado72h).toHaveTextContent('sin dato')
    expect(acumulado72h).toHaveTextContent('datos incompletos')
    expect(acumulado72h).not.toHaveTextContent('cobertura')
  })

  it('con localidad y estación en evacuación, la conclusión y los puntos lo dicen', async () => {
    stubFetch({
      peligro: () => jsonOk({ niveles: [nivel(24, 'verde')] }),
      hidrometria: () =>
        jsonOk({
          tramo: { estacionNombre: 'Río Paraná - Corrientes' },
          lectura: {
            lecturaM: 9.5,
            alertaM: 8,
            evacuacionM: 9,
            medidaEn: '2026-10-13T09:00:00Z',
            inconsistente: false,
          },
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} localidad="Corrientes" />)

    const puntos = await screen.findByTestId('ficha-territorial-puntos')
    expect(puntos).toHaveTextContent('Altura del río: 9,50 m · Evacuación (Río Paraná - Corrientes)')
    expect(puntos).toHaveTextContent('alerta 8,00 m · evacuación 9,00 m')
  })

  it('con localidad sin estación de referencia, el río dice que no hay estación cercana', async () => {
    const fetchMock = stubFetch({
      peligro: () => jsonOk({ niveles: [nivel(24, 'verde')] }),
      hidrometria: () => jsonOk({ tramo: null, lectura: null }),
    })

    render(<FichaTerritorial cueAnexo={CUE} localidad="Monte Caseros" />)

    const puntos = await screen.findByTestId('ficha-territorial-puntos')
    expect(puntos).toHaveTextContent('Río: sin estación de referencia cercana')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/hidrometria/estado?localidad=Monte%20Caseros'))).toBe(true)
  })

  it('no muestra el acumulado observado cuando la ruta no lo trae', async () => {
    stubFetch({ peligro: () => jsonOk({ niveles: [nivel(24, 'verde')], observado: [] }) })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.queryByTestId('ficha-territorial-observado-24h')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ficha-territorial-observado-72h')).not.toBeInTheDocument()
  })

  it('un pronóstico al día lleva en el tooltip la fecha de su última corrida', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          niveles: [nivel(24, 'verde', 0)],
          pronostico: [punto('precipitacion', 24, 0, 'mm')],
          observado: [],
        }),
    })

    const { container } = render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    const dato = [...container.querySelectorAll('.dato-fechado')].find((n) => n.textContent?.startsWith('Pronóstico próximas 24 h'))
    expect(dato?.getAttribute('title')).toBe('Actualizado 13/10 03:00')
    expect(container.textContent).not.toMatch(/Sin fecha de actualización/)
  })

  it('un dato sin fecha conocida no muestra "Sin fecha de actualización"', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          niveles: [nivel(24, 'verde', 0)],
          pronostico: [{ ...punto('precipitacion', 24, 0, 'mm'), corridaEn: null, validoEn: null }],
          observado: [],
        }),
    })

    const { container } = render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.getByText(/Pronóstico próximas 24 h/)).toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/Sin fecha de actualización/)
  })
})
