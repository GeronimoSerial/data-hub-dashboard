// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FichaZona } from './ficha-zona'
import { formatearARS } from '@/lib/reorganizacion/economia'
import type { EscuelaV29 } from '@/lib/reorganizacion/tipos'

afterEach(cleanup)

// El matcher de texto de Testing Library no normaliza el literal: el espacio
// no separable de los importes se pasa a espacio común para comparar.
const pesos = (valor: number) => formatearARS(valor).replace(/\s/g, ' ')

function escuela(parcial: Partial<EscuelaV29> & Pick<EscuelaV29, 'cue' | 'nombre'>): EscuelaV29 {
  return {
    departamento: 'CAPITAL',
    localidad: 'Corrientes',
    ambito: 'Urbano',
    cui: '',
    jurisdiccion: '',
    modalidad: 'Común',
    matricula: 100,
    historia: {},
    lat: -27.4,
    lon: -58.8,
    pof: {},
    agentes: 0,
    zona: 'Zona 12',
    sueldosTotal: null,
    personasSueldos: null,
    clasificacionZonaSueldos: null,
    ...parcial,
  }
}

const conComparables: EscuelaV29[] = [
  escuela({ cue: '1', nombre: 'Escuela Norte', matricula: 120, historia: { '2023': 100, '2026': 120 }, sueldosTotal: 500_000, personasSueldos: 10 }),
  escuela({ cue: '2', nombre: 'Escuela Sur', matricula: 80, historia: { '2023': 90, '2026': 80 }, sueldosTotal: 300_000, personasSueldos: 6 }),
  escuela({ cue: '3', nombre: 'Escuela Este', matricula: 50, historia: { '2026': 50 }, sueldosTotal: 200_000, personasSueldos: 4 }),
]

function renderFicha(miembros: EscuelaV29[], props: { onCerrar?: () => void; onSeleccionarEscuela?: (cue: string) => void } = {}) {
  const onCerrar = props.onCerrar ?? vi.fn()
  const onSeleccionarEscuela = props.onSeleccionarEscuela ?? vi.fn()
  render(
    <FichaZona etiqueta="Zona 12" miembros={miembros} onCerrar={onCerrar} onSeleccionarEscuela={onSeleccionarEscuela} />,
  )
  return { onCerrar, onSeleccionarEscuela }
}

describe('FichaZona', () => {
  it('muestra el nombre, el círculo de 20 km, los miembros y la matrícula total', () => {
    renderFicha(conComparables)

    expect(screen.getByRole('heading', { name: 'Zona 12' })).toBeTruthy()
    expect(screen.getByText('Círculo de 20 km de diámetro')).toBeTruthy()
    expect(screen.getByText('Matrícula total: 250 alumnos')).toBeTruthy()
    expect(screen.getByText('Escuela Norte')).toBeTruthy()
    expect(screen.getByText('CUE 2 · 80 alumnos')).toBeTruthy()
    expect(screen.getByText('Escuela Este')).toBeTruthy()
  })

  it('muestra la tendencia comparable con texto y cantidad de escuelas comparables', () => {
    renderFicha(conComparables)

    // Solo Norte y Sur tienen 2023 y 2026: 190 en 2023 y 200 en 2026.
    expect(screen.getByText('Aumentó')).toBeTruthy()
    expect(screen.getByText('2 escuelas comparables: 190 alumnos en 2023 y 200 en 2026.')).toBeTruthy()
    expect(screen.queryByText('Sin comparación')).toBeNull()
  })

  it('muestra "Sin comparación" cuando ningún miembro tiene historia 2023 y 2026', () => {
    renderFicha([
      escuela({ cue: '10', nombre: 'Sin historia A', historia: { '2026': 40 } }),
      escuela({ cue: '11', nombre: 'Sin historia B', historia: {} }),
    ])

    expect(screen.getByText('Sin comparación')).toBeTruthy()
    expect(screen.getByText('Ningún establecimiento tiene registro de 2023 y 2026.')).toBeTruthy()
  })

  it('muestra el resumen económico bajo un supuesto con la referencia retenida', () => {
    renderFicha(conComparables)

    expect(screen.getByText('Potencial bruto bajo un supuesto')).toBeTruthy()
    expect(screen.getByText('3 de 3')).toBeTruthy()
    expect(screen.getByText('20 personas')).toBeTruthy()
    // Costo 1.000.000; referencia Norte 500.000; potencial = 500.000 mensual y 6.000.000 anual.
    expect(screen.getByText(pesos(1_000_000))).toBeTruthy()
    expect(screen.getByText(`Escuela Norte (CUE 1): ${pesos(500_000)}`)).toBeTruthy()
    expect(screen.getByText(pesos(500_000))).toBeTruthy()
    expect(screen.getByText(pesos(6_000_000))).toBeTruthy()
    expect(screen.getByText(/Conservar como referencia el establecimiento con mayor costo salarial informado \(1\)/)).toBeTruthy()
  })

  it('no presenta el potencial como ahorro ni como cierre recomendado', () => {
    renderFicha(conComparables)

    expect(screen.getByText('Potencial bruto bajo un supuesto')).toBeTruthy()
    expect(screen.queryByText(/^Ahorro/)).toBeNull()
    expect(screen.queryByText(/cierre recomendado/i)).toBeNull()
  })

  it('indica "No calculable" con el motivo cuando hay un solo establecimiento', () => {
    renderFicha([escuela({ cue: '20', nombre: 'Única', sueldosTotal: 100_000 })])

    expect(screen.getByText('No calculable: menos de 2 establecimientos')).toBeTruthy()
    expect(screen.queryByText('Potencial bruto mensual')).toBeNull()
  })

  it('indica "No calculable" cuando falta un segundo importe positivo', () => {
    renderFicha([
      escuela({ cue: '30', nombre: 'Con importe', sueldosTotal: 100_000 }),
      escuela({ cue: '31', nombre: 'Sin importe', sueldosTotal: null }),
    ])

    expect(screen.getByText('No calculable: menos de 2 importes informados')).toBeTruthy()
  })

  it('avisa la cobertura parcial y no extrapola los importes faltantes', () => {
    renderFicha(conComparables.map((miembro) => (miembro.cue === '3' ? { ...miembro, sueldosTotal: null } : miembro)))

    expect(screen.getByText('Cobertura parcial: la cifra representa solo los importes disponibles.')).toBeTruthy()
    expect(screen.getByText('2 de 3')).toBeTruthy()
  })

  it('renderiza todas las advertencias metodológicas', () => {
    renderFicha(conComparables)

    expect(screen.getByText('Advertencias')).toBeTruthy()
    expect(
      screen.getByText(/no descuenta cargos a conservar o reubicar, transporte escolar, adecuaciones ni costos del receptor/),
    ).toBeTruthy()
    expect(screen.getByText('Cifra de potencial bruto bajo un supuesto, no ahorro confirmado ni recomendación de cierre.')).toBeTruthy()
  })

  it('muestra el estado vacío sin cifras cuando la zona no tiene miembros', () => {
    const { onCerrar } = renderFicha([])

    expect(screen.getByText('Sin establecimientos asignados')).toBeTruthy()
    expect(screen.queryByText('Advertencias')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('llama onSeleccionarEscuela con el CUE del establecimiento elegido', () => {
    const { onSeleccionarEscuela } = renderFicha(conComparables)

    fireEvent.click(screen.getByRole('button', { name: /Escuela Sur/ }))

    expect(onSeleccionarEscuela).toHaveBeenCalledTimes(1)
    expect(onSeleccionarEscuela).toHaveBeenCalledWith('2')
  })

  it('llama onCerrar al pulsar Cerrar', () => {
    const { onCerrar } = renderFicha(conComparables)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onCerrar).toHaveBeenCalledTimes(1)
  })
})
