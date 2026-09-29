// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  ROTULO_NIVEL_PROVISORIO,
  RiskExplanationPanel as RiskExplanationPanelComponent,
  type NivelHorizontePanel,
  type RiskExplanationPanelProps,
} from './risk-explanation-panel'

// Sin `globals: true` el auto-cleanup de testing-library no se registra:
// limpiar el body entre tests evita testids duplicados entre casos.
afterEach(() => {
  document.body.innerHTML = ''
})

function nivelHorizonte(
  horizonteHoras: 24 | 72 | 240,
  nivel: NivelHorizontePanel['nivel'],
  base: NivelHorizontePanel['base'],
  extras: Partial<NivelHorizontePanel> = {},
): NivelHorizontePanel {
  return {
    horizonteHoras,
    nivel,
    base,
    precipitacionMm: null,
    percentilReferencia: null,
    emitidoEn: '2026-09-26T06:00:00Z',
    validoHasta: '2026-09-27T06:00:00Z',
    ...extras,
  }
}

type DepartamentoProps = Extract<RiskExplanationPanelProps, { tipo: 'departamento' }>
type EscuelaProps = Extract<RiskExplanationPanelProps, { tipo: 'escuela' }>

type PanelTestProps =
  | ({ tipo: 'departamento' } & Partial<Omit<DepartamentoProps, 'tipo'>>)
  | ({ tipo: 'escuela' } & Partial<Omit<EscuelaProps, 'tipo'>>)

function RiskExplanationPanel(props: PanelTestProps) {
  if (props.tipo === 'departamento') {
    const { tipo, ...overrides } = props
    return (
      <RiskExplanationPanelComponent
        tipo={tipo}
        departamento="Capital"
        niveles={[]}
        caudal={null}
        lluviaObservada={null}
        {...overrides}
      />
    )
  }
  const { tipo, ...overrides } = props
  return (
    <RiskExplanationPanelComponent
      tipo={tipo}
      cueAnexo="1801605-04"
      nivelRiesgo="alto"
      confianza="media"
      scoreAmenaza={0.6}
      scoreVulnerabilidad={0.2}
      {...overrides}
    />
  )
}

describe('RiskExplanationPanel — variante departamento', () => {
  it('muestra las tres filas de horizonte con su nivel como texto', () => {
    render(
      <RiskExplanationPanel
        tipo="departamento"
        niveles={[
          nivelHorizonte(24, 'verde', 'ensemble'),
          nivelHorizonte(72, 'naranja', 'deterministico', {
            precipitacionMm: 42,
            percentilReferencia: 'P95',
          }),
          nivelHorizonte(240, 'rojo', 'ensemble'),
        ]}
      />,
    )

    const fila24 = screen.getByTestId('risk-explanation-horizonte-24')
    const fila72 = screen.getByTestId('risk-explanation-horizonte-72')
    const fila240 = screen.getByTestId('risk-explanation-horizonte-240')

    expect(within(fila24).getByText('Bajo')).toBeInTheDocument()
    expect(within(fila72).getByText('Alto')).toBeInTheDocument()
    expect(within(fila240).getByText('Muy alto')).toBeInTheDocument()

    // El nivel se lee como texto (no depende del color) y la base queda explícita.
    expect(within(fila72).getByText('(determinístico)')).toBeInTheDocument()
    expect(fila72).toHaveTextContent('Percentil de referencia: P95')
  })

  it('P1: muestra el rótulo de nivel provisorio cuando el método es umbral_provisorio', () => {
    render(
      <RiskExplanationPanel
        tipo="departamento"
        niveles={[
          nivelHorizonte(24, 'naranja', 'deterministico', {
            metodo: 'umbral_provisorio',
            precipitacionMm: 100,
          }),
        ]}
      />,
    )

    const fila24 = screen.getByTestId('risk-explanation-horizonte-24')
    expect(within(fila24).getByText(ROTULO_NIVEL_PROVISORIO)).toBeInTheDocument()
  })

  it('P1: NO muestra el rótulo de nivel provisorio cuando el método es percentiles (o no está presente)', () => {
    render(
      <RiskExplanationPanel
        tipo="departamento"
        niveles={[
          nivelHorizonte(24, 'naranja', 'deterministico', {
            metodo: 'percentiles',
            precipitacionMm: 100,
          }),
          nivelHorizonte(72, 'verde', 'ensemble'),
        ]}
      />,
    )

    expect(screen.queryByText(ROTULO_NIVEL_PROVISORIO)).not.toBeInTheDocument()
  })

  it('muestra explícito un horizonte sin dato de amenaza, no lo omite', () => {
    render(
      <RiskExplanationPanel
        tipo="departamento"
        niveles={[
          nivelHorizonte(24, 'verde', 'ensemble'),
          nivelHorizonte(72, 'sin_dato', 'sin_dato'),
          nivelHorizonte(240, 'sin_dato', 'sin_dato'),
        ]}
      />,
    )

    const fila72 = screen.getByTestId('risk-explanation-horizonte-72')
    expect(within(fila72).getByText('Sin dato')).toBeInTheDocument()
    expect(within(fila72).getByText('(Sin dato)')).toBeInTheDocument()
  })

  it('muestra "No disponible" para caudal y lluvia nulos, nunca 0', () => {
    render(
      <RiskExplanationPanel
        tipo="departamento"
        niveles={[nivelHorizonte(24, 'verde', 'ensemble')]}
      />,
    )

    expect(screen.getByTestId('risk-explanation-caudal')).toHaveTextContent('No disponible')
    expect(screen.getByTestId('risk-explanation-lluvia-observada')).toHaveTextContent(
      'No disponible',
    )
    expect(screen.queryByText(/^0 mm$/)).toBeNull()
  })

  it('muestra "sin dato" por acumulado ausente sin convertirlo en 0', () => {
    render(
      <RiskExplanationPanel
        tipo="departamento"
        niveles={[nivelHorizonte(24, 'verde', 'ensemble')]}
        caudal={{ nivel: 'amarillo', percentilActual: 90, emitidoEn: '2026-09-26T06:00:00Z' }}
        lluviaObservada={{ acumuladoMm24h: null, acumuladoMm72h: 18, observadoEn: null }}
      />,
    )

    const lluvia = screen.getByTestId('risk-explanation-lluvia-observada')
    expect(lluvia).toHaveTextContent('24 h sin dato')
    expect(lluvia).toHaveTextContent('72 h 18 mm')
    expect(screen.getByTestId('risk-explanation-caudal')).toHaveTextContent('percentil 90')
  })

  it('con cargando muestra un estado accesible role=status', () => {
    render(
      <RiskExplanationPanel
        tipo="departamento"
        departamento="Capital"
        niveles={[]}
        caudal={null}
        lluviaObservada={null}
        cargando
      />,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('RiskExplanationPanel — variante escuela', () => {
  it('sin factores no rompe y no inventa factores', () => {
    render(
      <RiskExplanationPanel
        tipo="escuela"
        cueAnexo="1801605-04"
        nivelRiesgo="muy_alto"
        confianza="alta"
        scoreAmenaza={0.82}
        scoreVulnerabilidad={0.4}
      />,
    )

    expect(screen.getByTestId('risk-explanation-nivel-riesgo')).toHaveTextContent('Muy alto')
    expect(screen.getByTestId('risk-explanation-confianza')).toHaveTextContent('Confianza: Alta')
    expect(screen.getByTestId('risk-explanation-amenaza')).toHaveTextContent('0.8')
    expect(screen.getByTestId('risk-explanation-vulnerabilidad')).toHaveTextContent('0.4')
    expect(screen.queryByTestId('risk-explanation-factores')).toBeNull()
  })

  it('con factores provistos los lista con fuente, valor, contribución y fecha', () => {
    render(
      <RiskExplanationPanel
        tipo="escuela"
        scoreVulnerabilidad={null}
        factores={[
          {
            tipo: 'Amenaza',
            fuente: 'ensemble ECMWF',
            valor: 42,
            unidad: 'mm',
            contribucion: 0.35,
            observadoEn: '2026-09-26T06:00:00Z',
          },
        ]}
      />,
    )

    const factores = screen.getByTestId('risk-explanation-factores')
    expect(within(factores).getByText(/ensemble ECMWF/)).toBeInTheDocument()
    expect(within(factores).getByText(/42 mm/)).toBeInTheDocument()
    // formatearNumero redondea a 1 decimal, mismo criterio que el resto del panel.
    expect(within(factores).getByText(/contribución: 0.4/)).toBeInTheDocument()
    // Un score nulo se lee como "sin dato", nunca como 0.
    expect(screen.getByTestId('risk-explanation-vulnerabilidad')).toHaveTextContent('sin dato')
  })

  it('un valor de factor ausente se lee "sin dato", nunca 0', () => {
    render(
      <RiskExplanationPanel
        tipo="escuela"
        factores={[
          {
            tipo: 'Vulnerabilidad',
            fuente: 'padrón',
            valor: null,
            unidad: null,
            contribucion: 0.1,
            observadoEn: null,
          },
        ]}
      />,
    )

    const factores = screen.getByTestId('risk-explanation-factores')
    expect(within(factores).getByText(/valor: sin dato/)).toBeInTheDocument()
    expect(within(factores).getByText(/observado en: sin dato/)).toBeInTheDocument()
  })

  it('mientras carga muestra un estado accesible role=status y no la lista', () => {
    render(
      <RiskExplanationPanel
        tipo="escuela"
        factoresCargando
      />,
    )

    expect(screen.getByTestId('risk-explanation-factores-cargando')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.queryByTestId('risk-explanation-factores')).toBeNull()
  })

  it('si el pedido de factores falla muestra un estado accesible role=alert', () => {
    render(
      <RiskExplanationPanel
        tipo="escuela"
        factoresError="No se pudo cargar el detalle del riesgo."
      />,
    )

    const error = screen.getByTestId('risk-explanation-factores-error')
    expect(error).toHaveAttribute('role', 'alert')
    expect(error).toHaveTextContent('No se pudo cargar el detalle del riesgo.')
  })

  it('un array de factores vacío (ya consultado) muestra "Sin dato" explícito, no en silencio ni en verde', () => {
    render(
      <RiskExplanationPanel
        tipo="escuela"
        factores={[]}
      />,
    )

    const sinDato = screen.getByTestId('risk-explanation-factores-sin-dato')
    expect(sinDato).toHaveTextContent('Sin dato')
    // Nunca lleva una clase de nivel (esas son sólo `risk-explanation-panel__nivel--*`,
    // reservadas al peligro por horizonte del panel de departamento).
    expect(sinDato.className).not.toMatch(/nivel--/)
  })

  it('nivel de riesgo nulo se muestra como "Sin dato"', () => {
    render(
      <RiskExplanationPanel
        tipo="escuela"
        cueAnexo="1801605-04"
        nivelRiesgo={null}
        confianza="baja"
        scoreAmenaza={null}
        scoreVulnerabilidad={null}
      />,
    )
    expect(screen.getByTestId('risk-explanation-nivel-riesgo')).toHaveTextContent('Sin dato')
  })

  it('sin la prop riesgoAcceso no renderiza la sección "Acceso"', () => {
    render(
      <RiskExplanationPanel
        tipo="escuela"
        cueAnexo="1801605-04"
        nivelRiesgo="alto"
        confianza="alta"
        scoreAmenaza={0.6}
        scoreVulnerabilidad={0.2}
      />,
    )
    expect(screen.queryByTestId('risk-explanation-acceso')).toBeNull()
  })

  it('con riesgoAcceso definido muestra una sección "Acceso" propia con nivel en texto y explicación', () => {
    render(
      <RiskExplanationPanel
        tipo="escuela"
        cueAnexo="1801605-04"
        nivelRiesgo="alto"
        confianza="alta"
        scoreAmenaza={0.6}
        scoreVulnerabilidad={0.2}
        riesgoAcceso={{
          nivel: 'alto',
          confianza: 'media',
          explicacion: 'aislamiento OSM 3/3, sin alternativa sin cruce',
        }}
      />,
    )

    const acceso = screen.getByTestId('risk-explanation-acceso')
    expect(acceso).toHaveTextContent('Acceso')
    expect(screen.getByTestId('risk-explanation-acceso-nivel')).toHaveTextContent(
      'Riesgo pronosticado de llegar: Alto',
    )
    expect(screen.getByTestId('risk-explanation-acceso-explicacion')).toHaveTextContent(
      'aislamiento OSM 3/3',
    )
    expect(screen.getByTestId('risk-explanation-acceso-confianza')).toHaveTextContent(
      'Confianza: Media',
    )
  })

  it('un riesgoAcceso con nivel null muestra "Sin dato", nunca "Bajo"', () => {
    render(
      <RiskExplanationPanel
        tipo="escuela"
        cueAnexo="1801605-04"
        nivelRiesgo="alto"
        confianza="alta"
        scoreAmenaza={0.6}
        scoreVulnerabilidad={0.2}
        riesgoAcceso={{ nivel: null, confianza: 'baja', explicacion: 'sin índice OSM' }}
      />,
    )

    const acceso = screen.getByTestId('risk-explanation-acceso')
    expect(screen.getByTestId('risk-explanation-acceso-nivel')).toHaveTextContent(
      'Sin dato',
    )
    expect(acceso).not.toHaveTextContent('Bajo')
  })
})

describe('RiskExplanationPanel — tarjeta "Perspectiva 30-90 días" (SEASONAL)', () => {
  it('no se muestra si tendenciaEstacional no se pasa (flag apagado)', () => {
    render(
      <RiskExplanationPanel
        tipo="departamento"
      />,
    )
    expect(screen.queryByTestId('risk-explanation-seasonal')).not.toBeInTheDocument()
  })

  it('no se muestra si tendenciaEstacional es null (consultada, sin datos)', () => {
    render(
      <RiskExplanationPanel
        tipo="departamento"
        tendenciaEstacional={null}
      />,
    )
    expect(screen.queryByTestId('risk-explanation-seasonal')).not.toBeInTheDocument()
  })

  it('etiqueta explícitamente como pronóstico regional, con fecha de emisión y "no es un valor por escuela"', () => {
    render(
      <RiskExplanationPanel
        tipo="departamento"
        tendenciaEstacional={{
          emisionEn: '2026-09-27',
          validoDesde: '2026-10-27',
          validoHasta: '2026-12-26',
          miembrosTotal: 51,
          miembrosValidos: 51,
          probabilidadSobreNormal: 0.42,
          mediaMm: 120.5,
        }}
      />,
    )

    const tarjeta = screen.getByTestId('risk-explanation-seasonal')
    expect(tarjeta).toHaveTextContent('Perspectiva 30–90 días')
    expect(tarjeta).toHaveTextContent('pronóstico probabilístico regional')
    expect(screen.getByTestId('risk-explanation-seasonal-aviso')).toHaveTextContent(
      'no es un valor por escuela',
    )
    // El nivel/valor siempre se lee como texto: probabilidad numérica + conteo
    // de miembros, nunca sólo un color/badge.
    expect(screen.getByTestId('risk-explanation-seasonal-probabilidad')).toHaveTextContent('42%')
    expect(screen.getByTestId('risk-explanation-seasonal-probabilidad')).toHaveTextContent(
      '51 de 51 miembros',
    )
    expect(screen.getByTestId('risk-explanation-seasonal-emision')).toHaveTextContent('Emitido el')
  })

  it('probabilidadSobreNormal null se muestra como "sin dato", nunca como 0%', () => {
    render(
      <RiskExplanationPanel
        tipo="departamento"
        tendenciaEstacional={{
          emisionEn: '2026-09-27',
          validoDesde: '2026-10-27',
          validoHasta: '2026-12-26',
          miembrosTotal: 51,
          miembrosValidos: 0,
          probabilidadSobreNormal: null,
          mediaMm: null,
        }}
      />,
    )
    expect(screen.getByTestId('risk-explanation-seasonal-probabilidad')).toHaveTextContent(
      'sin dato',
    )
  })
})
