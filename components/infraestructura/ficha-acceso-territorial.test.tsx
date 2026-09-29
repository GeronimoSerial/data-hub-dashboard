// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type {
  AislamientoEscuelaMapa,
  GeometriaAccesoRespuesta,
  SusceptibilidadEscuelaMapa,
  TerritorioMapa,
} from '@/lib/infraestructura/territorio-mapa'

// Mock liviano de la ficha territorial pesada (hace fetches propios) para el
// test de gateo del modal. La sección bajo prueba es presentacional y no
// necesita red, así que se renderiza de verdad.
vi.mock('./ficha-territorial', () => ({
  FichaTerritorial: () => <div data-testid="ficha-territorial-stub" />,
}))

import { FichaAccesoTerritorial, type FichaAccesoTerritorialProps } from './ficha-acceso-territorial'
import { FichaParteModal } from './ficha-parte-modal'

const CUE = '1801605-04'

const AISLAMIENTO_META = {
  fuente: 'OpenStreetMap' as const,
  atribucion: '© OpenStreetMap contributors' as const,
  licencia: 'ODbL',
  fechaExtractoOsm: '2026-06-01',
  versionJob: '3',
}

const SUSCEPTIBILIDAD_META = {
  fuente: 'physrisk' as const,
  indicador: 'inundacion_fluvial' as const,
  escenario: 'historico' as const,
  unidad: 'm' as const,
  periodoRetornoAnios: 100,
  fechaCorrida: '2026-05-01',
  licencia: 'Apache-2.0',
}

function territorioCon(
  aislamiento: Record<string, AislamientoEscuelaMapa> | null,
  susceptibilidad: Record<string, SusceptibilidadEscuelaMapa> | null,
): TerritorioMapa {
  return {
    aislamiento:
      aislamiento === null ? null : { ...AISLAMIENTO_META, escuelas: aislamiento },
    susceptibilidad:
      susceptibilidad === null ? null : { ...SUSCEPTIBILIDAD_META, escuelas: susceptibilidad },
  }
}

function filaAislamiento(overrides: Partial<AislamientoEscuelaMapa> = {}): AislamientoEscuelaMapa {
  return {
    nivel: 0,
    cruces: 0,
    conPuente: 0,
    sinPuente: 0,
    alternativaSinCruce: null,
    ...overrides,
  }
}

function props(overrides: Partial<FichaAccesoTerritorialProps> = {}): FichaAccesoTerritorialProps {
  return {
    territorio: null,
    territorioLoading: false,
    territorioError: null,
    cueAnexo: CUE,
    geometria: null,
    geometriaLoading: false,
    geometriaError: null,
    ...overrides,
  }
}

function geometriaNoDisponible(motivo: string | undefined): GeometriaAccesoRespuesta {
  return { cueAnexo: CUE, disponible: false, motivo }
}

const GEOMETRIA_DISPONIBLE: GeometriaAccesoRespuesta = {
  cueAnexo: CUE,
  disponible: true,
  resumen: { puente: 1, vado: 2, sinEvidencia: 3 },
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FichaAccesoTerritorial', () => {
  it('muestra el título y el estado de carga territorial', () => {
    render(<FichaAccesoTerritorial {...props({ territorioLoading: true })} />)

    expect(screen.getByTestId('ficha-acceso-territorial')).toHaveTextContent(
      'Acceso y susceptibilidad territorial (estático)',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Cargando datos territoriales…')
  })

  it('muestra el error territorial en un role alert con el mensaje recibido', () => {
    render(
      <FichaAccesoTerritorial
        {...props({ territorioError: 'No se pudieron cargar las capas territoriales.' })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las capas territoriales.',
    )
  })

  it('sin bloques importados dice las dos ausencias explícitas', () => {
    render(<FichaAccesoTerritorial {...props({ territorio: territorioCon(null, null) })} />)

    expect(screen.getByTestId('ficha-acceso-aislamiento-sin-datos')).toHaveTextContent(
      'Sin datos de aislamiento OSM importados.',
    )
    expect(screen.getByTestId('ficha-acceso-susceptibilidad-sin-datos')).toHaveTextContent(
      'Sin datos physrisk importados.',
    )
  })

  it('con bloques presentes pero sin fila del CUE dice "sin cobertura", nunca índice 0', () => {
    render(
      <FichaAccesoTerritorial
        {...props({ territorio: territorioCon({}, {}) })}
      />,
    )

    const aislamiento = screen.getByTestId('ficha-acceso-aislamiento-sin-cobertura')
    expect(aislamiento).toHaveTextContent('Sin cobertura OSM para esta escuela.')
    expect(aislamiento).not.toHaveTextContent('0')
    expect(screen.getByTestId('ficha-acceso-susceptibilidad-sin-cobertura')).toHaveTextContent(
      'Sin cobertura physrisk para esta escuela.',
    )
  })

  it.each([
    [0, 'Muy bajo (0/3)'],
    [1, 'Bajo (1/3)'],
    [2, 'Medio (2/3)'],
    [3, 'Alto (3/3)'],
  ] as const)('etiqueta el nivel %i como "%s"', (nivel, etiqueta) => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon({ [CUE]: filaAislamiento({ nivel }) }, null),
        })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-aislamiento-indice')).toHaveTextContent(
      `Índice de aislamiento: ${etiqueta}`,
    )
  })

  it('etiqueta "sin_datos_red" sin sufijo numérico', () => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon({ [CUE]: filaAislamiento({ nivel: 'sin_datos_red' }) }, null),
        })}
      />,
    )

    const indice = screen.getByTestId('ficha-acceso-aislamiento-indice')
    expect(indice).toHaveTextContent('Sin conexión a la red OSM')
    expect(indice).not.toHaveTextContent('/3')
  })

  it('muestra los cruces con desglose sólo cuando hay más de cero', () => {
    const { rerender } = render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon(
            { [CUE]: filaAislamiento({ cruces: 2, conPuente: 1, sinPuente: 1 }) },
            null,
          ),
        })}
      />,
    )
    expect(screen.getByTestId('ficha-acceso-aislamiento-cruces')).toHaveTextContent(
      'Cruces de agua en la ruta a la cabecera: 2 · con puente 1 · sin puente confirmado 1',
    )

    rerender(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon(
            { [CUE]: filaAislamiento({ cruces: 0, conPuente: 0, sinPuente: 0 }) },
            null,
          ),
        })}
      />,
    )
    const cruces = screen.getByTestId('ficha-acceso-aislamiento-cruces')
    expect(cruces).toHaveTextContent('Cruces de agua en la ruta a la cabecera: 0')
    expect(cruces).not.toHaveTextContent('con puente')
  })

  it.each([
    [null, 'Desconocida'],
    [true, 'Sí'],
    [false, 'No'],
  ] as const)('alternativa sin cruce %s -> "%s"', (alternativa, texto) => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon(
            { [CUE]: filaAislamiento({ alternativaSinCruce: alternativa }) },
            null,
          ),
        })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-aislamiento-alternativa')).toHaveTextContent(
      `Alternativa sin cruce: ${texto}`,
    )
  })

  it('expone la fuente y las fechas del aislamiento', () => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon({ [CUE]: filaAislamiento({ nivel: 3 }) }, null),
        })}
      />,
    )

    const fuente = screen.getByTestId('ficha-acceso-aislamiento-fuente')
    expect(fuente).toHaveTextContent('OpenStreetMap')
    expect(fuente).toHaveTextContent('© OpenStreetMap contributors')
    expect(fuente).toHaveTextContent('ODbL')
    expect(fuente).toHaveTextContent('2026-06-01')
    expect(fuente).toHaveTextContent('job v3')
  })

  it('no duplica la atribución cuando `licencia` ya la contiene', () => {
    const territorio: TerritorioMapa = {
      aislamiento: {
        ...AISLAMIENTO_META,
        licencia: '© OpenStreetMap contributors, ODbL',
        escuelas: { [CUE]: filaAislamiento({ nivel: 1 }) },
      },
      susceptibilidad: null,
    }
    render(<FichaAccesoTerritorial {...props({ territorio })} />)

    const fuente = screen.getByTestId('ficha-acceso-aislamiento-fuente')
    expect(fuente).toHaveTextContent(
      'Fuente: OpenStreetMap (© OpenStreetMap contributors, ODbL) · extracto 2026-06-01 · job v3',
    )
    const ocurrencias = (fuente.textContent?.match(/OpenStreetMap contributors/g) ?? []).length
    expect(ocurrencias).toBe(1)
  })

  it('muestra el estado de carga de la ruta', () => {
    render(<FichaAccesoTerritorial {...props({ geometriaLoading: true })} />)

    expect(screen.getByTestId('ficha-acceso-ruta')).toHaveTextContent('Cargando ruta de acceso…')
  })

  it('muestra el error de la ruta', () => {
    render(<FichaAccesoTerritorial {...props({ geometriaError: 'Falló la geometría.' })} />)

    expect(screen.getByTestId('ficha-acceso-ruta')).toHaveTextContent('Falló la geometría.')
  })

  it('cuando la ruta está disponible resume puentes, vados y sin evidencia', () => {
    render(<FichaAccesoTerritorial {...props({ geometria: GEOMETRIA_DISPONIBLE })} />)

    expect(screen.getByTestId('ficha-acceso-ruta')).toHaveTextContent(
      'Ruta y cruces dibujados en el mapa: 1 puente(s), 2 vado(s), 3 sin evidencia de puente.',
    )
  })

  it.each([
    ['sin_geometria_importada', 'La geometría de accesos no está importada para esta escuela.'],
    ['sin_conexion_red', 'La escuela no conecta con la red vial OSM: no hay ruta calculada.'],
    [
      'ruta_degenerada',
      'La escuela está junto a la cabecera departamental: no hay ruta que dibujar.',
    ],
    ['sin_geometria', 'Sin geometría de acceso para esta escuela.'],
    [undefined, 'Sin geometría de acceso para esta escuela.'],
  ] as const)('ruta no disponible con motivo "%s" -> texto de leyenda', (motivo, texto) => {
    render(<FichaAccesoTerritorial {...props({ geometria: geometriaNoDisponible(motivo) })} />)

    expect(screen.getByTestId('ficha-acceso-ruta')).toHaveTextContent(texto)
  })

  it('sin geometría y sin loading no renderiza la línea de ruta', () => {
    render(<FichaAccesoTerritorial {...props({ geometria: null })} />)

    expect(screen.queryByTestId('ficha-acceso-ruta')).not.toBeInTheDocument()
  })

  it('sin valor physrisk lo dice explícitamente y no imputa 0', () => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon(null, { [CUE]: { inundacionFluvialM: null } }),
        })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-susceptibilidad-sin-valor')).toHaveTextContent(
      'Sin valor physrisk para esta escuela.',
    )
    expect(screen.queryByTestId('ficha-acceso-susceptibilidad-valor')).not.toBeInTheDocument()
  })

  it('formatea 0 m como "sin profundidad estimada"', () => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon(null, { [CUE]: { inundacionFluvialM: 0 } }),
        })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-susceptibilidad-valor')).toHaveTextContent(
      'Profundidad estimada de inundación fluvial: 0 m (sin profundidad estimada)',
    )
  })

  it.each([
    [1.234, '1,23 m (≥ 1 m)'],
    [0.3, '0,30 m (< 0,5 m)'],
    [0.7, '0,70 m (0,5 – 1 m)'],
  ] as const)('formatea %s m como "%s"', (valor, esperado) => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon(null, { [CUE]: { inundacionFluvialM: valor } }),
        })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-susceptibilidad-valor')).toHaveTextContent(
      `Profundidad estimada de inundación fluvial: ${esperado}`,
    )
  })

  it('siempre acompaña el bloque physrisk con período de retorno, escenario y fuente', () => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon(null, { [CUE]: { inundacionFluvialM: 0.7 } }),
        })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-susceptibilidad-periodo')).toHaveTextContent(
      'Período de retorno 100 años · escenario histórico.',
    )
    expect(screen.getByTestId('ficha-acceso-susceptibilidad-fuente')).toHaveTextContent(
      'Fuente: OS-Climate physrisk (Apache-2.0) · corrida 2026-05-01',
    )
  })

  it('la palabra "pronóstico" sólo aparece negada, y cierra con la nota de contexto', () => {
    const { container } = render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon(
            { [CUE]: filaAislamiento({ nivel: 2 }) },
            { [CUE]: { inundacionFluvialM: 1.5 } },
          ),
          geometria: GEOMETRIA_DISPONIBLE,
        })}
      />,
    )

    const texto = container.textContent ?? ''
    const ocurrencias = (texto.match(/pronóstico/g) ?? []).length
    const negadas = (texto.match(/no es un pronóstico/g) ?? []).length
    expect(ocurrencias).toBeGreaterThan(0)
    expect(negadas).toBe(ocurrencias)

    expect(screen.getByTestId('ficha-acceso-nota')).toHaveTextContent(
      'Contexto territorial: no reemplaza el parte ni confirma el estado del edificio.',
    )
  })
})

describe('FichaParteModal - gateo de la sección de acceso territorial', () => {
  function stubFetch() {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/parte?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, periodo: null, parte: null, afectaciones: [] }),
        } as Response)
      }
      if (url.includes('/historial?')) {
        return Promise.resolve({ ok: true, json: async () => ({ movimientos: [] }) } as Response)
      }
      return Promise.reject(new Error(`URL inesperada: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const accesoTerritorial = props({
    territorio: territorioCon({ [CUE]: filaAislamiento({ nivel: 1 }) }, null),
  })

  function renderModal(habilitado: boolean) {
    return render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={null}
        escuela={null}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
        habilitado={habilitado}
        accesoTerritorial={accesoTerritorial}
      />,
    )
  }

  it('no renderiza la sección con `habilitado` en false', () => {
    stubFetch()
    renderModal(false)

    expect(screen.queryByTestId('ficha-acceso-territorial')).not.toBeInTheDocument()
  })

  it('renderiza la sección con `habilitado` en true', () => {
    stubFetch()
    renderModal(true)

    expect(screen.getByTestId('ficha-acceso-territorial')).toBeInTheDocument()
  })
})
