// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { FichaTerritorial } from './ficha-territorial'

const CUE = '1801605-04'
const GEOMETRY_REF = 'celda-1801605-04'

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

function punto(variable: string, horizonteHoras: number, valor: number, unidad: string) {
  return {
    geometryRef: GEOMETRY_REF,
    provider: 'open-meteo',
    variable,
    corridaEn: '2026-08-01T06:00:00Z',
    validoEn: '2026-08-01T12:00:00Z',
    horizonteHoras,
    valor,
    unidad,
    pasoHoras: 12,
  }
}

function fuente(
  provider: string,
  estado: string,
  frescuraMinutos = 30,
  ttlMinutos = 60,
) {
  return {
    provider,
    estado,
    ultimoExitoEn: '2026-08-01T11:00:00Z',
    ttlMinutos,
    frescuraMinutos,
  }
}

function nivel(
  horizonteHoras: 24 | 72 | 240,
  nivel: 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'sin_dato',
  base: 'ensemble' | 'deterministico' | 'sin_dato' = 'ensemble',
) {
  return {
    geometryRef: GEOMETRY_REF,
    horizonteHoras,
    nivel,
    base,
    probabilidadP95: null,
    probabilidadP99: null,
    precipitacionMm: null,
    percentilReferencia: null,
    emitidoEn: '2026-08-01T06:00:00Z',
    validoHasta: '2026-08-02T06:00:00Z',
    versionRegla: 'v1',
  }
}

function observadoSatelital(overrides: Record<string, unknown> = {}) {
  return {
    geometryRef: GEOMETRY_REF,
    provider: 'nasa-imerg',
    variable: 'precipitacion_observada_satelital',
    valor: 12.4,
    unidad: 'mm',
    observadoEn: '2026-08-01T09:00:00Z',
    validoDesde: '2026-08-01T09:00:00Z',
    validoHasta: '2026-08-01T10:00:00Z',
    ...overrides,
  }
}

function urlPeligro(fetchMock: ReturnType<typeof stubFetch>): string {
  const llamada = fetchMock.mock.calls.find(([input]) => String(input).includes('/peligro?'))
  return llamada ? String(llamada[0]) : ''
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

interface Handlers {
  perfil?: () => Response | Promise<Response>
  peligro?: () => Response | Promise<Response>
  fuentes?: () => Response | Promise<Response>
}

function stubFetch(handlers: Handlers = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/geo-perfiles/')) {
      return Promise.resolve(handlers.perfil ? handlers.perfil() : jsonOk(perfilValido()))
    }
    if (url.includes('/peligro?')) {
      return Promise.resolve(
        handlers.peligro ? handlers.peligro() : jsonOk({ pronostico: [], climatologia: [] }),
      )
    }
    if (url.includes('/fuentes')) {
      return Promise.resolve(
        handlers.fuentes ? handlers.fuentes() : jsonOk({ fuentes: [fuente('open-meteo', 'ok')] }),
      )
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
  it('muestra "Sin cobertura geográfica" con el motivo traducido y no pide peligro', async () => {
    const fetchMock = stubFetch({
      perfil: () =>
        jsonOk(perfilValido({ geometryRef: null, motivoExclusion: 'sin_coordenadas' })),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    const sinCobertura = await screen.findByTestId('ficha-territorial-sin-cobertura')
    expect(sinCobertura).toHaveTextContent('Sin cobertura geográfica')
    expect(sinCobertura).toHaveTextContent('no tiene coordenadas cargadas')
    // Un solo request: el perfil. Sin geometryRef no se consulta el peligro.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('traduce "coordenada_invalida"', async () => {
    stubFetch({
      perfil: () =>
        jsonOk(perfilValido({ geometryRef: null, motivoExclusion: 'coordenada_invalida' })),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    expect(await screen.findByTestId('ficha-territorial-sin-cobertura')).toHaveTextContent(
      'coordenada fuera del rango esperado',
    )
  })

  it('muestra el texto de sin perfil cuando el perfil responde 404 y no sigue pidiendo', async () => {
    const fetchMock = stubFetch({ perfil: () => json404() })

    render(<FichaTerritorial cueAnexo={CUE} />)

    expect(await screen.findByTestId('ficha-territorial-sin-perfil')).toHaveTextContent(
      'Sin perfil geográfico registrado para esta escuela.',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('con perfil válido pero sin puntos muestra departamento, celda y "Sin peligro estimado"', async () => {
    stubFetch({
      perfil: () => jsonOk(perfilValido()),
      peligro: () => jsonOk({ pronostico: [], climatologia: [] }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    const datos = await screen.findByTestId('ficha-territorial-datos')
    expect(datos).toHaveTextContent('Capital')
    expect(datos).toHaveTextContent(GEOMETRY_REF)
    expect(datos).toHaveTextContent('exacta')
    expect(screen.getByTestId('ficha-territorial-sin-peligro')).toHaveTextContent(
      'Sin peligro estimado',
    )
    expect(screen.queryByTestId('ficha-territorial-fuente-vencida')).not.toBeInTheDocument()
  })

  it('con puntos resume lluvia acumulada, ráfagas máximas y el caudal más próximo', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          pronostico: [
            punto('precipitacion', 24, 10, 'mm'),
            punto('precipitacion', 48, 5, 'mm'),
            punto('rafagas', 24, 62, 'km/h'),
            punto('caudal', 12, 120, 'm3/s'),
            punto('caudal', 36, 150, 'm3/s'),
          ],
          climatologia: [],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    expect(await screen.findByText(/Lluvia acumulada próximas 72h: 15 mm/)).toBeInTheDocument()
    expect(screen.getByText(/Ráfagas máximas próximas 72h: 62 km\/h/)).toBeInTheDocument()
    expect(screen.getByText(/Caudal del punto de río: 120 m3\/s/)).toBeInTheDocument()
    expect(screen.queryByTestId('ficha-territorial-sin-peligro')).not.toBeInTheDocument()
  })

  it('marca "Fuente vencida" por FRESCURA real (frescuraMinutos > ttlMinutos), no sólo por estado', async () => {
    // Corrección de revisión (hallazgo H6): un provider 'degradado' pero con
    // dato todavía fresco (frescura < ttl) NO debe mostrarse como vencido.
    stubFetch({
      peligro: () => jsonOk({ pronostico: [punto('precipitacion', 12, 8, 'mm')], climatologia: [] }),
      fuentes: () => jsonOk({ fuentes: [fuente('open-meteo', 'degradado', 30, 60)] }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.queryByTestId('ficha-territorial-fuente-vencida')).not.toBeInTheDocument()
  })

  it('marca "Fuente vencida" cuando la frescura real supera el TTL, con el provider afectado, y muestra igual los datos', async () => {
    stubFetch({
      peligro: () => jsonOk({ pronostico: [punto('precipitacion', 12, 8, 'mm')], climatologia: [] }),
      // 'ok' pero con dato de 90 minutos de antigüedad sobre un TTL de 60:
      // vencida igual, pese a que el último intento haya sido exitoso.
      fuentes: () => jsonOk({ fuentes: [fuente('open-meteo', 'ok', 90, 60)] }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    const aviso = await screen.findByTestId('ficha-territorial-fuente-vencida')
    expect(aviso).toHaveTextContent('Fuente vencida')
    expect(aviso).toHaveTextContent('open-meteo')
    // El dato viejo nunca se oculta: se muestra aunque la fuente esté vencida.
    expect(screen.getByText(/Lluvia acumulada próximas 72h: 8 mm/)).toBeInTheDocument()
  })

  it('muestra el aviso de error si el fetch falla y no reintenta', async () => {
    const fetchMock = stubFetch({
      perfil: () => Promise.reject(new Error('red caída')),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    expect(await screen.findByTestId('ficha-territorial-error')).toHaveTextContent(
      'No se pudo obtener el contexto territorial en este momento.',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('agrega puntoRioId a la URL de /peligro cuando el perfil trae un punto de río asociado', async () => {
    const fetchMock = stubFetch({
      perfil: () =>
        jsonOk(
          perfilValido({ rioAsociacion: { puntoRioId: 'rio-1801', distanciaKm: 12.5 } }),
        ),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(urlPeligro(fetchMock)).toContain('puntoRioId=rio-1801')
    // Una sola request a /peligro: el punto de río viaja en la misma llamada.
    const llamadasPeligro = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/peligro?'),
    )
    expect(llamadasPeligro).toHaveLength(1)
  })

  it('sin job de asociación (rioAsociacion: null) no agrega puntoRioId ni muestra caudal', async () => {
    const fetchMock = stubFetch({
      perfil: () => jsonOk(perfilValido({ rioAsociacion: null })),
      peligro: () =>
        jsonOk({ pronostico: [], climatologia: [], niveles: [], caudal: null, observado: [] }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(urlPeligro(fetchMock)).not.toContain('puntoRioId')
    expect(screen.queryByTestId('ficha-territorial-caudal')).not.toBeInTheDocument()
  })

  it('con fila de asociación pero sin punto en radio (puntoRioId: null) tampoco muestra caudal', async () => {
    const fetchMock = stubFetch({
      perfil: () =>
        jsonOk(perfilValido({ rioAsociacion: { puntoRioId: null, distanciaKm: null } })),
      peligro: () =>
        jsonOk({ pronostico: [], climatologia: [], niveles: [], caudal: null, observado: [] }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(urlPeligro(fetchMock)).not.toContain('puntoRioId')
    expect(screen.queryByTestId('ficha-territorial-caudal')).not.toBeInTheDocument()
  })

  it('muestra cada nivel con su texto explícito por horizonte, no sólo color', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          pronostico: [],
          niveles: [
            nivel(24, 'rojo', 'ensemble'),
            nivel(72, 'amarillo', 'deterministico'),
            nivel(240, 'sin_dato', 'sin_dato'),
          ],
          observado: [],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    const filas = screen.getAllByTestId('ficha-territorial-nivel-peligro')
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent('Próximas 24h (riesgo inmediato)')
    expect(filas[0]).toHaveTextContent('Rojo')
    expect(filas[0]).toHaveTextContent('(ensemble)')
    expect(filas[1]).toHaveTextContent('Próximas 72h (riesgo probable)')
    expect(filas[1]).toHaveTextContent('Amarillo')
    expect(filas[1]).toHaveTextContent('(determinístico)')
    expect(filas[2]).toHaveTextContent('7-10 días (tendencia)')
    expect(filas[2]).toHaveTextContent('Sin dato')
  })

  it('colapsa a un único "sin dato" cuando los tres horizontes vienen sin dato', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          pronostico: [],
          niveles: [nivel(24, 'sin_dato'), nivel(72, 'sin_dato'), nivel(240, 'sin_dato')],
          observado: [],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    const filas = screen.getAllByTestId('ficha-territorial-nivel-peligro')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toHaveTextContent('sin dato')
  })

  it('muestra el caudal con percentil y nivel cuando la respuesta lo trae', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          pronostico: [],
          niveles: [],
          caudal: {
            puntoId: 'rio-1801',
            percentilActual: 0.92,
            nivel: 'naranja',
            emitidoEn: '2026-08-01T06:00:00Z',
            validoHasta: '2026-08-02T06:00:00Z',
          },
          observado: [],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    const linea = screen.getByTestId('ficha-territorial-caudal')
    expect(linea).toHaveTextContent('percentil 0.92')
    expect(linea).toHaveTextContent('nivel Naranja')
  })

  it('muestra "Caudal del río: sin dato" cuando hay punto asociado pero todavía no hay caudal', async () => {
    stubFetch({
      perfil: () =>
        jsonOk(perfilValido({ rioAsociacion: { puntoRioId: 'rio-1801', distanciaKm: 8 } })),
      peligro: () =>
        jsonOk({ pronostico: [], niveles: [], caudal: null, observado: [] }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.getByTestId('ficha-territorial-caudal')).toHaveTextContent(
      'Caudal del río: sin dato',
    )
  })

  it('muestra la lluvia observada satelital con su rótulo completo y la fecha', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          pronostico: [],
          niveles: [],
          observado: [observadoSatelital()],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    const linea = screen.getByTestId('ficha-territorial-lluvia-observada')
    expect(linea).toHaveTextContent('Lluvia observada estimada por satélite')
    expect(linea).toHaveTextContent('12.4 mm')
    expect(linea).toHaveTextContent(/01\/08\/2026/)
  })

  it('no muestra la línea de lluvia observada cuando no hay filas de IMERG', async () => {
    stubFetch({
      peligro: () => jsonOk({ pronostico: [], niveles: [], observado: [] }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.queryByTestId('ficha-territorial-lluvia-observada')).not.toBeInTheDocument()
  })

  it('muestra el acumulado observado 24h/72h con cobertura cuando hay dato', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          pronostico: [],
          niveles: [],
          observado: [],
          observadoAcumulado: [
            {
              geometryRef: GEOMETRY_REF,
              horizonteHoras: 24,
              acumuladoMm: 18.5,
              granulosEncontrados: 48,
              granulosEsperados: 48,
              cobertura: 1,
              masRecienteEn: '2026-08-01T09:00:00Z',
            },
            {
              geometryRef: GEOMETRY_REF,
              horizonteHoras: 72,
              acumuladoMm: null,
              granulosEncontrados: 60,
              granulosEsperados: 144,
              cobertura: 60 / 144,
              masRecienteEn: '2026-08-01T09:00:00Z',
            },
          ],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.getByTestId('ficha-territorial-observado-24h')).toHaveTextContent(
      '24 h: 18.5 mm (cobertura 100%)',
    )
    // Cobertura insuficiente -> "sin dato" explícito, nunca un número que
    // subestima.
    expect(screen.getByTestId('ficha-territorial-observado-72h')).toHaveTextContent('sin dato')
    expect(screen.getByTestId('ficha-territorial-observado-72h')).toHaveTextContent('60/144')
  })

  it('no muestra la sección de acumulado observado cuando la ruta no la trae (backward compatible)', async () => {
    stubFetch({
      peligro: () => jsonOk({ pronostico: [], niveles: [], observado: [] }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.queryByTestId('ficha-territorial-observado-24h')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ficha-territorial-observado-72h')).not.toBeInTheDocument()
  })

  it('muestra A LA VEZ "edificio sin daño" y "acceso en riesgo alto" (nunca colapsa uno en el otro)', async () => {
    stubFetch()

    render(
      <FichaTerritorial
        cueAnexo={CUE}
        estadoEdificio="sin_afectacion_reportada"
        riesgoAcceso={{ nivel: 'alto', explicacion: 'aislamiento OSM 3/3' }}
      />,
    )

    await screen.findByTestId('ficha-territorial-datos')
    // Los dos estados coexisten y son visibles a la vez.
    expect(screen.getByTestId('ficha-territorial-estado-edificio')).toHaveTextContent(
      'Sin afectación reportada',
    )
    const acceso = screen.getByTestId('ficha-territorial-riesgo-acceso')
    expect(acceso).toHaveTextContent('Acceso')
    expect(acceso).toHaveTextContent('Riesgo de acceso: Alto')
    expect(acceso).toHaveTextContent('aislamiento OSM 3/3')
  })

  it('acceso sin datos se muestra explícito, nunca como "Bajo"', async () => {
    stubFetch()

    render(
      <FichaTerritorial
        cueAnexo={CUE}
        riesgoAcceso={{ nivel: null, explicacion: 'sin índice OSM' }}
      />,
    )

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.getByTestId('ficha-territorial-acceso-sin-dato')).toHaveTextContent(
      'Sin datos de acceso',
    )
    expect(screen.getByTestId('ficha-territorial-riesgo-acceso')).not.toHaveTextContent('Bajo')
  })

  it('sin las props de acceso no inventa secciones de estado del edificio ni de acceso', async () => {
    stubFetch()

    render(<FichaTerritorial cueAnexo={CUE} />)

    await screen.findByTestId('ficha-territorial-datos')
    expect(screen.queryByTestId('ficha-territorial-estado-edificio')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ficha-territorial-riesgo-acceso')).not.toBeInTheDocument()
  })

  it('muestra "Umbrales climatológicos" con P90, P95 y P99 de la variable, junto al pronóstico actual del horizonte más corto', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
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
    expect(bloque).toHaveTextContent('Umbrales climatológicos')
    expect(bloque).toHaveTextContent('P90')
    expect(bloque).toHaveTextContent('P95')
    expect(bloque).toHaveTextContent('P99')
    expect(bloque).toHaveTextContent('15 mm')
    expect(bloque).toHaveTextContent('22.5 mm')
    expect(bloque).toHaveTextContent('40 mm')
    // Pronóstico actual = horizonte más corto (12 h -> 8 mm), no el de 36 h.
    expect(bloque).toHaveTextContent('Pronóstico actual: 8 mm')
    expect(bloque).not.toHaveTextContent('20 mm')
    expect(bloque).toHaveTextContent(
      'Umbrales de referencia relativos a la climatología local; no son probabilidades.',
    )
  })

  it('muestra "Sin dato" para una variable sin climatología, nunca "Bajo"', async () => {
    stubFetch({
      peligro: () =>
        jsonOk({
          pronostico: [punto('rafagas', 12, 45, 'km/h')],
          climatologia: [climatologia('precipitacion', 'p90', 15, 'mm')],
        }),
    })

    render(<FichaTerritorial cueAnexo={CUE} />)

    const bloque = await screen.findByTestId('ficha-territorial-umbrales')
    const filaRafagas = within(bloque).getByTestId('ficha-territorial-umbral-rafagas')
    expect(filaRafagas).toHaveTextContent('Sin dato')
    expect(filaRafagas).not.toHaveTextContent('Bajo')
    expect(bloque).not.toHaveTextContent(/\bBajo\b/)
  })
})
