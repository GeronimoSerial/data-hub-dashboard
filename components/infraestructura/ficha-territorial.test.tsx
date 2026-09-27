// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
