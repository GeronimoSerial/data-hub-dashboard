// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

// Territorio completo: sirve para probar la ficha "llena" sin repetir el
// montaje de los metadatos en cada test.
const TERRITORIO_COMPLETO = territorioCon(
  { [CUE]: filaAislamiento({ nivel: 2, cruces: 2, conPuente: 1, sinPuente: 1 }) },
  { [CUE]: { inundacionFluvialM: 0.7 } },
)

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FichaAccesoTerritorial - estados', () => {
  it('muestra el título y el estado de carga territorial', () => {
    render(<FichaAccesoTerritorial {...props({ territorioLoading: true })} />)

    expect(screen.getByTestId('ficha-acceso-territorial')).toHaveTextContent('Contexto territorial')
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

  it('sin ninguna capa importada no ofrece un detalle vacío', () => {
    render(<FichaAccesoTerritorial {...props({ territorio: territorioCon(null, null) })} />)

    expect(screen.queryByTestId('ficha-acceso-detalle')).not.toBeInTheDocument()
  })
})

describe('FichaAccesoTerritorial - las tres líneas de siempre', () => {
  it('muestra exactamente tres líneas, fuera del detalle y sin metodología', () => {
    render(
      <FichaAccesoTerritorial
        {...props({ territorio: TERRITORIO_COMPLETO, geometria: GEOMETRIA_DISPONIBLE })}
      />,
    )

    const detalle = screen.getByTestId('ficha-acceso-detalle')
    const lineas = [
      screen.getByTestId('ficha-acceso-aislamiento-indice'),
      screen.getByTestId('ficha-acceso-aislamiento-cruces'),
      screen.getByTestId('ficha-acceso-susceptibilidad-valor'),
    ]
    for (const linea of lineas) {
      expect(linea.tagName).toBe('P')
      // Lo visible no puede depender de abrir el detalle.
      expect(detalle).not.toContainElement(linea)
      // Ni esconder la escala, el período de retorno o la fuente.
      expect(linea).not.toHaveTextContent('3 de 3')
      expect(linea).not.toHaveTextContent('100')
      expect(linea).not.toHaveTextContent('OpenStreetMap')
    }
  })

  it.each([
    [0, 'muy baja'],
    [1, 'baja'],
    [2, 'media'],
    [3, 'alta'],
  ] as const)('etiqueta el nivel %i como dificultad "%s"', (nivel, nombre) => {
    render(
      <FichaAccesoTerritorial
        {...props({ territorio: territorioCon({ [CUE]: filaAislamiento({ nivel }) }, null) })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-aislamiento-indice')).toHaveTextContent(
      `Acceso por camino: dificultad ${nombre}`,
    )
  })

  it('"sin_datos_red" es "no calculable", nunca un nivel 0', () => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon({ [CUE]: filaAislamiento({ nivel: 'sin_datos_red' }) }, null),
        })}
      />,
    )

    const indice = screen.getByTestId('ficha-acceso-aislamiento-indice')
    expect(indice).toHaveTextContent('Acceso por camino: no calculable')
    expect(indice).not.toHaveTextContent('de 3')
    expect(indice).not.toHaveTextContent('muy baja')
  })

  it('con cruces muestra el conteo y cuántos están sin puente registrado', () => {
    render(
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
      'Cruces de agua: 2 (1 sin puente registrado)',
    )
  })

  it('sin cruces lo dice sin un desglose en cero', () => {
    render(
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
    expect(cruces).toHaveTextContent('Sin cruces de agua en la ruta')
    expect(cruces).not.toHaveTextContent('sin puente registrado')
  })

  it('con la escuela fuera del archivo importado las tres líneas dicen "sin dato"', () => {
    render(<FichaAccesoTerritorial {...props({ territorio: territorioCon({}, {}) })} />)

    const acceso = screen.getByTestId('ficha-acceso-aislamiento-sin-cobertura')
    expect(acceso).toHaveTextContent('Acceso por camino: sin dato')
    expect(acceso).not.toHaveTextContent('0')
    expect(screen.getByTestId('ficha-acceso-aislamiento-cruces')).toHaveTextContent(
      'Cruces de agua: sin dato',
    )
    const inundacion = screen.getByTestId('ficha-acceso-susceptibilidad-sin-cobertura')
    expect(inundacion).toHaveTextContent('Inundación histórica en la escuela: sin dato')
    expect(inundacion).not.toHaveTextContent('0,00')
  })

  it('0 m es "sin agua estimada", nunca "0,00 m"', () => {
    render(
      <FichaAccesoTerritorial
        {...props({ territorio: territorioCon(null, { [CUE]: { inundacionFluvialM: 0 } }) })}
      />,
    )

    const valor = screen.getByTestId('ficha-acceso-susceptibilidad-valor')
    expect(valor).toHaveTextContent('Inundación histórica en la escuela: sin agua estimada')
    expect(valor).not.toHaveTextContent('0,00')
  })

  it.each([
    [1.234, '1,23 m de agua estimada'],
    [0.3, '0,30 m de agua estimada'],
    [0.7, '0,70 m de agua estimada'],
  ] as const)('formatea %s m como "%s"', (profundidad, esperado) => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: territorioCon(null, { [CUE]: { inundacionFluvialM: profundidad } }),
        })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-susceptibilidad-valor')).toHaveTextContent(
      `Inundación histórica en la escuela: ${esperado}`,
    )
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
      'Inundación histórica en la escuela: sin dato',
    )
    expect(screen.queryByTestId('ficha-acceso-susceptibilidad-valor')).not.toBeInTheDocument()
  })
})

describe('FichaAccesoTerritorial - acción "Ver recorrido"', () => {
  it('el botón llama una sola vez a `onVerRutaEnMapa`', async () => {
    const onVerRutaEnMapa = vi.fn()
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: TERRITORIO_COMPLETO,
          geometria: GEOMETRIA_DISPONIBLE,
          onVerRutaEnMapa,
        })}
      />,
    )

    await userEvent.click(screen.getByTestId('ficha-acceso-ver-ruta'))
    expect(onVerRutaEnMapa).toHaveBeenCalledTimes(1)
  })

  it('sin `onVerRutaEnMapa` no hay botón, aunque haya recorrido', () => {
    render(
      <FichaAccesoTerritorial
        {...props({ territorio: TERRITORIO_COMPLETO, geometria: GEOMETRIA_DISPONIBLE })}
      />,
    )

    expect(screen.queryByTestId('ficha-acceso-ver-ruta')).not.toBeInTheDocument()
  })

  it('mientras carga el recorrido el botón está deshabilitado', () => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: TERRITORIO_COMPLETO,
          geometriaLoading: true,
          onVerRutaEnMapa: () => {},
        })}
      />,
    )

    const boton = screen.getByTestId('ficha-acceso-ver-ruta')
    expect(boton).toBeDisabled()
    expect(boton).toHaveTextContent('Cargando recorrido…')
  })

  it('sin recorrido por falta de conexión a la red no ofrece botón y explica el motivo', () => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: TERRITORIO_COMPLETO,
          geometria: geometriaNoDisponible('sin_conexion_red'),
          onVerRutaEnMapa: () => {},
        })}
      />,
    )

    expect(screen.queryByTestId('ficha-acceso-ver-ruta')).not.toBeInTheDocument()
    expect(screen.getByTestId('ficha-acceso-sin-ruta')).toHaveTextContent(
      'Sin recorrido para mostrar',
    )
    expect(screen.getByTestId('ficha-acceso-sin-ruta')).toHaveTextContent(
      'la escuela está a más de 5 km del camino más cercano cargado en OpenStreetMap',
    )
  })

  it.each([
    ['sin_geometria_importada', 'el recorrido no está importado para esta escuela.'],
    ['ruta_degenerada', 'la escuela está junto a la cabecera departamental.'],
    ['sin_geometria', 'no hay recorrido calculado para esta escuela.'],
    [undefined, 'no hay recorrido calculado para esta escuela.'],
  ] as const)('motivo "%s" -> "%s"', (motivo, esperado) => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: TERRITORIO_COMPLETO,
          geometria: geometriaNoDisponible(motivo),
          onVerRutaEnMapa: () => {},
        })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-sin-ruta')).toHaveTextContent(esperado)
  })

  it('con error de geometría muestra el error recibido y no ofrece botón', () => {
    render(
      <FichaAccesoTerritorial
        {...props({
          territorio: TERRITORIO_COMPLETO,
          geometriaError: 'Falló la geometría.',
          onVerRutaEnMapa: () => {},
        })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-ruta-error')).toHaveTextContent('Falló la geometría.')
    expect(screen.queryByTestId('ficha-acceso-ver-ruta')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ficha-acceso-sin-ruta')).not.toBeInTheDocument()
  })

  it('sin geometría todavía no anuncia que no hay recorrido', () => {
    render(
      <FichaAccesoTerritorial
        {...props({ territorio: TERRITORIO_COMPLETO, onVerRutaEnMapa: () => {} })}
      />,
    )

    expect(screen.queryByTestId('ficha-acceso-sin-ruta')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ficha-acceso-ruta-error')).not.toBeInTheDocument()
  })
})

describe('FichaAccesoTerritorial - detalle secundario', () => {
  it('el detalle está cerrado y concentra escala, período, fuentes y descargos', () => {
    render(
      <FichaAccesoTerritorial
        {...props({ territorio: TERRITORIO_COMPLETO, geometria: GEOMETRIA_DISPONIBLE })}
      />,
    )

    const detalle = screen.getByTestId('ficha-acceso-detalle')
    expect(detalle).not.toHaveAttribute('open')
    expect(detalle).toHaveTextContent('Detalle, metodología y fuentes')

    expect(screen.getByTestId('ficha-acceso-detalle-indice')).toHaveTextContent(
      'Índice de dificultad: 2 de 3',
    )
    expect(detalle).toHaveTextContent(
      'Hay al menos un cruce de agua sin puente registrado, pero existe otro camino que lo evita.',
    )
    expect(screen.getByTestId('ficha-acceso-susceptibilidad-periodo')).toHaveTextContent(
      'Período de retorno 100 años · escenario histórico',
    )
    expect(screen.getByTestId('ficha-acceso-aislamiento-fuente')).toHaveTextContent(
      'Fuente: OpenStreetMap (© OpenStreetMap contributors, ODbL) · extracto 2026-06-01 · job v3',
    )
    expect(screen.getByTestId('ficha-acceso-susceptibilidad-fuente')).toHaveTextContent(
      'Fuente: OS-Climate physrisk (Apache-2.0) · corrida 2026-05-01',
    )
    // Los descargos de las DOS capas, y ninguno dice que esto sea un pronóstico.
    expect(detalle).toHaveTextContent('No es un pronóstico, no indica si hoy el camino está cortado')
    expect(detalle).toHaveTextContent('No es un pronóstico, no indica que hoy haya agua')
  })

  it('resume la ruta dibujada sólo cuando la geometría está disponible', () => {
    render(
      <FichaAccesoTerritorial
        {...props({ territorio: TERRITORIO_COMPLETO, geometria: GEOMETRIA_DISPONIBLE })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-ruta')).toHaveTextContent(
      'Ruta en el mapa: 1 con puente · 2 vado · 3 sin puente registrado.',
    )
  })

  it('sin geometría no inventa un resumen de ruta', () => {
    render(<FichaAccesoTerritorial {...props({ territorio: TERRITORIO_COMPLETO })} />)

    expect(screen.queryByTestId('ficha-acceso-ruta')).not.toBeInTheDocument()
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

  it('con 0 m explica en el detalle que el modelo no estima agua ahí', () => {
    render(
      <FichaAccesoTerritorial
        {...props({ territorio: territorioCon(null, { [CUE]: { inundacionFluvialM: 0 } }) })}
      />,
    )

    expect(screen.getByTestId('ficha-acceso-susceptibilidad-sin-profundidad')).toHaveTextContent(
      'El modelo no estima agua en ese punto (0 m).',
    )
  })

  it('sin dato de physrisk explica en el detalle que no se calcula nada', () => {
    render(<FichaAccesoTerritorial {...props({ territorio: territorioCon({}, {}) })} />)

    expect(screen.getByTestId('ficha-acceso-detalle-sin-cobertura')).toHaveTextContent(
      'Sin dato: la escuela no figura en el archivo importado.',
    )
  })

  it('expone la fuente y las fechas del aislamiento', () => {
    render(
      <FichaAccesoTerritorial
        {...props({ territorio: territorioCon({ [CUE]: filaAislamiento({ nivel: 3 }) }, null) })}
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

  it('la palabra "pronóstico" sólo aparece negada, y cierra con la nota de contexto', () => {
    const { container } = render(
      <FichaAccesoTerritorial
        {...props({
          territorio: TERRITORIO_COMPLETO,
          geometria: GEOMETRIA_DISPONIBLE,
        })}
      />,
    )

    const texto = container.textContent ?? ''
    const ocurrencias = (texto.match(/pronóstico/g) ?? []).length
    // `TEXTOS_ACCESOS` abre cada descargo con "No es un pronóstico" (mayúscula
    // inicial), así que la negación se cuenta sin distinguir mayúsculas: si
    // alguna vez se cuela un "pronóstico" sin negar, el conteo no cierra.
    const negadas = (texto.match(/no es un pronóstico/gi) ?? []).length
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
