// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  AislamientoEscuelaMapa,
  GeometriaAccesoRespuesta,
} from '@/lib/infraestructura/territorio-mapa'
import type { ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'
import { territorioCon } from '@/components/test-utils/territorio-mapa'

// Mock liviano de la ficha territorial pesada (hace fetches propios) para el
// test de gateo del modal. La sección bajo prueba es presentacional y no
// necesita red, así que se renderiza de verdad.
vi.mock('./ficha-territorial', () => ({
  FichaTerritorial: () => <div data-testid="ficha-territorial-stub" />,
}))

import { FichaAccesoTerritorial, type FichaAccesoTerritorialProps } from './ficha-acceso-territorial'

const CUE = '1801605-04'

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

function elementoFicha(overrides: Partial<FichaAccesoTerritorialProps> = {}) {
  return <FichaAccesoTerritorial {...props(overrides)} />
}

function renderFicha(overrides: Partial<FichaAccesoTerritorialProps> = {}) {
  return render(elementoFicha(overrides))
}

function geometriaNoDisponible(motivo: string | undefined): GeometriaAccesoRespuesta {
  return { cueAnexo: CUE, disponible: false, motivo }
}

const GEOMETRIA_DISPONIBLE: GeometriaAccesoRespuesta = {
  cueAnexo: CUE,
  disponible: true,
  resumen: { puente: 1, vado: 2, sinEvidencia: 3 },
}

function exposicion(overrides: Partial<ExposicionRutaRespuesta> = {}): ExposicionRutaRespuesta {
  return {
    cueAnexo: CUE, disponible: true, estado: 'con_profundidad', versionJob: '1',
    resumen: { celdasTotal: 4, celdasConDato: 3, celdasConProfundidad: 2, profundidadMaxM: 1.25, cobertura: 0.75 },
    celdasAfectadas: [], resolucionArcsec: 30, periodoRetornoAnios: 100,
    escenario: 'historico', fuente: 'WRI Aqueduct v2 vía OS-Climate physrisk',
    licencia: 'Apache-2.0', fechaCorrida: '2026-06-01', aviso: 'Indicador histórico y estático.',
    ...overrides,
  }
}

// Territorio completo: sirve para probar la ficha "llena" sin repetir el
// montaje de los metadatos en cada test.
const TERRITORIO_COMPLETO = territorioCon(
  { [CUE]: filaAislamiento({ nivel: 2, cruces: 2, conPuente: 1, sinPuente: 1 }) },
  { [CUE]: { inundacionFluvialM: 0.7, claseRio: null, juntoLaguna: null } },
)

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FichaAccesoTerritorial - estados', () => {
  it('el agua estimada se muestra sólo como tags, sin metros ni línea de exposición', () => {
    renderFicha({ territorio: TERRITORIO_COMPLETO, exposicion: exposicion() })
    expect(screen.getByTestId('ficha-acceso-susceptibilidad-valor').textContent).not.toMatch(/\d\s?m\b/)
    expect(screen.queryByTestId('ficha-acceso-exposicion-ruta')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ficha-acceso-exposicion-detalle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ficha-acceso-susceptibilidad-periodo')).not.toBeInTheDocument()
  })

  it('muestra el título y el estado de carga territorial', () => {
    renderFicha({ territorioLoading: true })

    expect(screen.getByTestId('ficha-acceso-territorial')).toHaveTextContent('Acceso por camino y agua estimada')
    expect(screen.getByRole('status')).toHaveTextContent('Cargando datos territoriales…')
  })

  it('muestra el error territorial en un role alert con el mensaje recibido', () => {
    renderFicha({ territorioError: 'No se pudieron cargar las capas territoriales.' })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las capas territoriales.',
    )
  })

  it('sin bloques importados dice las dos ausencias explícitas', () => {
    renderFicha({ territorio: territorioCon(null, null) })

    expect(screen.getByTestId('ficha-acceso-aislamiento-sin-datos')).toHaveTextContent(
      'Sin datos de caminos cargados.',
    )
    expect(screen.getByTestId('ficha-acceso-susceptibilidad-sin-datos')).toHaveTextContent(
      'Sin datos de agua estimada cargados.',
    )
  })

  it('sin ninguna capa importada no ofrece un detalle vacío', () => {
    renderFicha({ territorio: territorioCon(null, null) })

    expect(screen.queryByTestId('ficha-acceso-detalle')).not.toBeInTheDocument()
  })
})

describe.skip('FichaAccesoTerritorial - exposición de la ruta', () => {
  it.skip('muestra celdas con profundidad, profundidad máxima y cobertura parcial', () => {
    renderFicha({ exposicion: exposicion() })
    expect(screen.getByTestId('ficha-acceso-exposicion-ruta')).toHaveTextContent(
      'Agua estimada junto al camino: 2 zonas de ~1 km (hasta 1,25 m). Dato en 75 % de la ruta.',
    )
  })

  it.skip('muestra sin profundidad cuando hay dato disponible sin celdas afectadas', () => {
    renderFicha({ exposicion: exposicion({ estado: 'sin_profundidad', resumen: { celdasTotal: 4, celdasConDato: 4, celdasConProfundidad: 0, profundidadMaxM: null, cobertura: 1 } }) })
    expect(screen.getByTestId('ficha-acceso-exposicion-ruta')).toHaveTextContent(
      'Agua estimada junto al camino: ninguna según el modelo.',
    )
  })

  it.skip('para exposición no disponible dice sin dato y nunca cero o sin inundación', () => {
    renderFicha({ exposicion: exposicion({ disponible: false, estado: 'sin_dato' }) })
    const linea = screen.getByTestId('ficha-acceso-exposicion-ruta')
    expect(linea).toHaveTextContent('Agua estimada junto al camino: sin dato.')
    expect(linea).not.toHaveTextContent(/0|sin inundación/)
  })

  it.skip('incluye resolución y límites del indicador en el detalle de referencia', () => {
    renderFicha({ exposicion: exposicion() })
    const detalle = screen.getByTestId('ficha-acceso-exposicion-detalle')
    expect(detalle).toHaveTextContent('30 arcsec (≈ 1 km): un valor por celda, no por tramo ni por cruce')
    expect(detalle).toHaveTextContent('WRI Aqueduct v2 vía OS-Climate physrisk (Apache-2.0)')
    expect(detalle).toHaveTextContent('No es un pronóstico, ni el estado del camino, ni el trazado de un río.')
    expect(detalle).not.toHaveTextContent('Indicador histórico/estático')
  })

  it('mantiene el comportamiento anterior cuando no recibe las props opcionales', () => {
    renderFicha()
    expect(screen.queryByTestId('ficha-acceso-exposicion-ruta')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ficha-acceso-exposicion-detalle')).not.toBeInTheDocument()
  })

  it.skip('muestra carga y error de exposición en la línea de ruta', () => {
    const { rerender } = renderFicha({ exposicionLoading: true })
    expect(screen.getByTestId('ficha-acceso-exposicion-ruta')).toHaveTextContent(
      'Agua estimada en el camino: cargando…',
    )
    rerender(elementoFicha({ exposicionError: 'falló' }))
    expect(screen.getByTestId('ficha-acceso-exposicion-ruta')).toHaveTextContent(
      'Agua estimada en el camino: sin dato.',
    )
  })
})

describe('FichaAccesoTerritorial - las tres líneas de siempre', () => {
  it.skip('muestra exactamente tres líneas, fuera del detalle y sin metodología', () => {
    renderFicha({ territorio: TERRITORIO_COMPLETO, geometria: GEOMETRIA_DISPONIBLE })

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
    renderFicha({ territorio: territorioCon({ [CUE]: filaAislamiento({ nivel }) }, null) })

    expect(screen.getByTestId('ficha-acceso-aislamiento-indice')).toHaveTextContent(
      `Llegar por camino: dificultad ${nombre}`,
    )
  })

  it('"sin_datos_red" es "no calculable", nunca un nivel 0', () => {
    renderFicha({
      territorio: territorioCon({ [CUE]: filaAislamiento({ nivel: 'sin_datos_red' }) }, null),
    })

    const indice = screen.getByTestId('ficha-acceso-aislamiento-indice')
    expect(indice).toHaveTextContent('Llegar por camino: no calculable')
    expect(indice).not.toHaveTextContent('de 3')
    expect(indice).not.toHaveTextContent('muy baja')
  })

  it('con cruces muestra el conteo y cuántos están sin puente registrado', () => {
    renderFicha({
      territorio: territorioCon(
        { [CUE]: filaAislamiento({ cruces: 2, conPuente: 1, sinPuente: 1 }) },
        null,
      ),
    })

    expect(screen.getByTestId('ficha-acceso-aislamiento-cruces')).toHaveTextContent(
      'Cruces de agua en el camino: 2 (1 sin puente registrado)',
    )
  })

  it('indica cuando todos los cruces tienen puente registrado', () => {
    renderFicha({
      territorio: territorioCon(
        { [CUE]: filaAislamiento({ cruces: 2, conPuente: 2, sinPuente: 0 }) },
        null,
      ),
    })
    expect(screen.getByTestId('ficha-acceso-aislamiento-cruces')).toHaveTextContent(
      'Cruces de agua en el camino: 2 (todos con puente registrado)',
    )
  })

  it('sin cruces lo dice sin un desglose en cero', () => {
    renderFicha({
      territorio: territorioCon(
        { [CUE]: filaAislamiento({ cruces: 0, conPuente: 0, sinPuente: 0 }) },
        null,
      ),
    })

    const cruces = screen.getByTestId('ficha-acceso-aislamiento-cruces')
    expect(cruces).toHaveTextContent('Sin cruces de agua en el camino')
    expect(cruces).not.toHaveTextContent('sin puente registrado')
  })

  it.skip('con la escuela fuera del archivo importado las tres líneas dicen "sin dato"', () => {
    renderFicha({ territorio: territorioCon({}, {}) })

    const acceso = screen.getByTestId('ficha-acceso-aislamiento-sin-cobertura')
    expect(acceso).toHaveTextContent('Llegar por camino: sin dato')
    expect(acceso).not.toHaveTextContent('0')
    expect(screen.getByTestId('ficha-acceso-aislamiento-cruces')).toHaveTextContent(
      'Cruces de agua: sin dato',
    )
    const inundacion = screen.getByTestId('ficha-acceso-susceptibilidad-sin-cobertura')
    expect(inundacion).toHaveTextContent('Agua estimada en la escuela: sin dato')
    expect(inundacion).not.toHaveTextContent('0,00')
  })

  it.skip('0 m es "sin agua estimada", nunca "0,00 m"', () => {
    renderFicha({ territorio: territorioCon(null, { [CUE]: { inundacionFluvialM: 0, claseRio: null, juntoLaguna: null } }) })

    const valor = screen.getByTestId('ficha-acceso-susceptibilidad-valor')
    expect(valor).toHaveTextContent('Agua estimada en la escuela: ninguna según el modelo')
    expect(valor).not.toHaveTextContent('0,00')
  })

  it.skip.each([
    [1.234, '1,23 m de agua estimada'],
    [0.3, '0,30 m de agua estimada'],
    [0.7, '0,70 m de agua estimada'],
  ] as const)('formatea %s m como "%s"', (profundidad, esperado) => {
    renderFicha({ territorio: territorioCon(null, { [CUE]: { inundacionFluvialM: profundidad, claseRio: null, juntoLaguna: null } }) })

    const agua = screen.getByTestId('ficha-acceso-susceptibilidad-valor')
    expect(agua).toHaveTextContent(
      `Agua estimada en la escuela: ${esperado.replace(" de agua estimada", "")} en una crecida muy poco frecuente (modelo, no es agua de hoy)`,
    )
    expect(agua).not.toHaveTextContent(/camino|recorrido|ruta/i)
  })

  it.skip('sin valor physrisk lo dice explícitamente y no imputa 0', () => {
    renderFicha({ territorio: territorioCon(null, { [CUE]: { inundacionFluvialM: null, claseRio: null, juntoLaguna: null } }) })

    expect(screen.getByTestId('ficha-acceso-susceptibilidad-sin-valor')).toHaveTextContent(
      'Agua estimada en la escuela: sin dato',
    )
    expect(screen.queryByTestId('ficha-acceso-susceptibilidad-valor')).not.toBeInTheDocument()
  })
})

describe('FichaAccesoTerritorial - acción "Ver recorrido"', () => {
  it('el botón llama una sola vez a `onVerRutaEnMapa`', async () => {
    const onVerRutaEnMapa = vi.fn()
    renderFicha({
      territorio: TERRITORIO_COMPLETO,
      geometria: GEOMETRIA_DISPONIBLE,
      onVerRutaEnMapa,
    })

    await userEvent.click(screen.getByTestId('ficha-acceso-ver-ruta'))
    expect(onVerRutaEnMapa).toHaveBeenCalledTimes(1)
  })

  it('sin `onVerRutaEnMapa` no hay botón, aunque haya recorrido', () => {
    renderFicha({ territorio: TERRITORIO_COMPLETO, geometria: GEOMETRIA_DISPONIBLE })

    expect(screen.queryByTestId('ficha-acceso-ver-ruta')).not.toBeInTheDocument()
  })

  it('mientras carga el recorrido el botón está deshabilitado', () => {
    renderFicha({
      territorio: TERRITORIO_COMPLETO,
      geometriaLoading: true,
      onVerRutaEnMapa: () => {},
    })

    const boton = screen.getByTestId('ficha-acceso-ver-ruta')
    expect(boton).toBeDisabled()
    expect(boton).toHaveTextContent('Cargando recorrido…')
  })

  it('sin recorrido por falta de conexión a la red no ofrece botón y explica el motivo', () => {
    renderFicha({
      territorio: TERRITORIO_COMPLETO,
      geometria: geometriaNoDisponible('sin_conexion_red'),
      onVerRutaEnMapa: () => {},
    })

    expect(screen.queryByTestId('ficha-acceso-ver-ruta')).not.toBeInTheDocument()
    expect(screen.getByTestId('ficha-acceso-sin-ruta')).toHaveTextContent(
      'Sin recorrido para mostrar',
    )
    expect(screen.getByTestId('ficha-acceso-sin-ruta')).toHaveTextContent(
      'La escuela no conecta con la red de caminos hasta la ciudad cabecera',
    )
  })

  it.each([
    ['sin_geometria_importada', 'Todavía no se cargó el recorrido de esta escuela.'],
    ['ruta_degenerada', 'La escuela está junto a la ciudad cabecera de su departamento: no hay recorrido para dibujar.'],
    ['coordenada_fuera_de_departamento', 'La ubicación cargada de la escuela cae fuera de su departamento.'],
    ['red_vial_no_conectada', 'Hay un camino a menos de 5 km, pero no se conecta con los caminos principales ni llega a la ciudad cabecera, así que no se dibuja un recorrido. Es falta de dato: no significa que la escuela sea inaccesible.'],
    ['sin_via_osm_cercana', 'No hay caminos cargados en OpenStreetMap a menos de 5 km de la escuela'],
    ['sin_geometria', 'No hay recorrido calculado para esta escuela.'],
    [undefined, 'No hay recorrido calculado para esta escuela.'],
  ] as const)('motivo "%s" -> "%s"', (motivo, esperado) => {
    renderFicha({
      territorio: TERRITORIO_COMPLETO,
      geometria: geometriaNoDisponible(motivo),
      onVerRutaEnMapa: () => {},
    })

    expect(screen.getByTestId('ficha-acceso-sin-ruta')).toHaveTextContent(esperado)
  })

  it('con error de geometría muestra el error recibido y no ofrece botón', () => {
    renderFicha({
      territorio: TERRITORIO_COMPLETO,
      geometriaError: 'Falló la geometría.',
      onVerRutaEnMapa: () => {},
    })

    expect(screen.getByTestId('ficha-acceso-ruta-error')).toHaveTextContent('Falló la geometría.')
    expect(screen.queryByTestId('ficha-acceso-ver-ruta')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ficha-acceso-sin-ruta')).not.toBeInTheDocument()
  })

  it('sin geometría todavía no anuncia que no hay recorrido', () => {
    renderFicha({ territorio: TERRITORIO_COMPLETO, onVerRutaEnMapa: () => {} })

    expect(screen.queryByTestId('ficha-acceso-sin-ruta')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ficha-acceso-ruta-error')).not.toBeInTheDocument()
  })
})

describe('FichaAccesoTerritorial - detalle secundario', () => {
  it.skip('el detalle está cerrado y concentra escala, período, fuentes y descargos', () => {
    renderFicha({ territorio: TERRITORIO_COMPLETO, geometria: GEOMETRIA_DISPONIBLE })

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
      'Período de retorno: 100 años',
    )
    expect(screen.getByTestId('ficha-acceso-aislamiento-fuente')).toHaveTextContent(
      'Fuente: OpenStreetMap (© OpenStreetMap contributors, ODbL) · extracto 2026-06-01 · job v3',
    )
    expect(screen.getByTestId('ficha-acceso-susceptibilidad-fuente')).toHaveTextContent(
      'Fuente: OS-Climate physrisk (Apache-2.0) · corrida 2026-05-01',
    )
    // Los descargos de las DOS capas, y ninguno dice que esto sea un pronóstico.
    expect(detalle).toHaveTextContent('No dice si hoy el camino está cortado, no es un pronóstico')
    expect(detalle).toHaveTextContent('no muestra el río, no muestra el camino ni dice si hoy hay agua')
  })

  it('resume la ruta dibujada sólo cuando la geometría está disponible', () => {
    renderFicha({ territorio: TERRITORIO_COMPLETO, geometria: GEOMETRIA_DISPONIBLE })

    expect(screen.getByTestId('ficha-acceso-ruta')).toHaveTextContent(
      'Cruces en el camino dibujado: 1 con puente · 2 vado · 3 sin puente registrado.',
    )
  })

  it('sin geometría no inventa un resumen de ruta', () => {
    renderFicha({ territorio: TERRITORIO_COMPLETO })

    expect(screen.queryByTestId('ficha-acceso-ruta')).not.toBeInTheDocument()
  })

  it.each([
    [null, 'Sin dato'],
    [true, 'Sí'],
    [false, 'No'],
  ] as const)('alternativa sin cruce %s -> "%s"', (alternativa, texto) => {
    renderFicha({
      territorio: territorioCon(
        { [CUE]: filaAislamiento({ alternativaSinCruce: alternativa }) },
        null,
      ),
    })

    expect(screen.getByTestId('ficha-acceso-aislamiento-alternativa')).toHaveTextContent(
      `Camino alternativo sin cruces: ${texto}`,
    )
  })

  it.skip('con 0 m explica en el detalle que el modelo no estima agua ahí', () => {
    renderFicha({ territorio: territorioCon(null, { [CUE]: { inundacionFluvialM: 0, claseRio: null, juntoLaguna: null } }) })

    expect(screen.getByTestId('ficha-acceso-susceptibilidad-sin-profundidad')).toHaveTextContent(
      'El modelo no estima agua en ese punto (0 m).',
    )
  })

  it.skip('sin dato de physrisk explica en el detalle que no se calcula nada', () => {
    renderFicha({ territorio: territorioCon({}, {}) })

    expect(screen.getByTestId('ficha-acceso-detalle-sin-cobertura')).toHaveTextContent(
      'Sin dato: esta escuela no está en los datos calculados',
    )
  })

  it('expone la fuente y las fechas del aislamiento', () => {
    renderFicha({ territorio: territorioCon({ [CUE]: filaAislamiento({ nivel: 3 }) }, null) })

    const fuente = screen.getByTestId('ficha-acceso-aislamiento-fuente')
    expect(fuente).toHaveTextContent('OpenStreetMap')
    expect(fuente).toHaveTextContent('© OpenStreetMap contributors')
    expect(fuente).toHaveTextContent('ODbL')
    expect(fuente).toHaveTextContent('2026-06-01')
    expect(fuente).toHaveTextContent('job v3')
  })

  it('no duplica la atribución cuando `licencia` ya la contiene', () => {
    const territorio = territorioCon(
      { [CUE]: filaAislamiento({ nivel: 1 }) },
      null,
      { aislamiento: { licencia: '© OpenStreetMap contributors, ODbL' } },
    )
    renderFicha({ territorio })

    const fuente = screen.getByTestId('ficha-acceso-aislamiento-fuente')
    expect(fuente).toHaveTextContent(
      'Fuente: OpenStreetMap (© OpenStreetMap contributors, ODbL) · extracto 2026-06-01 · job v3',
    )
    const ocurrencias = (fuente.textContent?.match(/OpenStreetMap contributors/g) ?? []).length
    expect(ocurrencias).toBe(1)
  })

  it.skip('la palabra "pronóstico" sólo aparece negada, y cierra con la nota de contexto', () => {
    const { container } = renderFicha({
      territorio: TERRITORIO_COMPLETO,
      geometria: GEOMETRIA_DISPONIBLE,
    })

    const texto = container.querySelector('[data-testid="ficha-acceso-detalle"]')?.textContent ?? ''
    const ocurrencias = (texto.match(/\bpronóstico\b/gi) ?? []).length
    // `TEXTOS_ACCESOS` abre cada descargo con "No es un pronóstico" (mayúscula
    // inicial), así que la negación se cuenta sin distinguir mayúsculas: si
    // alguna vez se cuela un "pronóstico" sin negar, el conteo no cierra.
    const negadas = (texto.match(/(?:no es|ni) un pronóstico/gi) ?? []).length
    expect(ocurrencias).toBeGreaterThan(0)
    expect(negadas).toBe(ocurrencias)

    expect(screen.getByTestId('ficha-acceso-nota')).toHaveTextContent(
      'Datos calculados con mapas y modelos; no reemplazan el parte ni confirman el estado del edificio.',
    )
  })

  it.skip('mantiene los términos técnicos dentro del detalle', () => {
    const { container } = renderFicha({
      territorio: TERRITORIO_COMPLETO,
      geometria: GEOMETRIA_DISPONIBLE,
    })
    const detalle = container.querySelector('details')
    const visible = (container.textContent ?? '').replace(detalle?.textContent ?? '', '')
    expect(visible).not.toMatch(/OSM|OpenStreetMap|physrisk|período de retorno|escenario/i)
  })
})
