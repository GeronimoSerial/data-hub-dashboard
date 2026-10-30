// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FichaEscuela, type FichaEscuelaProps } from './ficha-escuela'
import { formatearARS } from '@/lib/reorganizacion/economia'
import type { EscuelaV29, OfertaNivel } from '@/lib/reorganizacion/tipos'

function crearEscuela(overrides: Partial<EscuelaV29> = {}): EscuelaV29 {
  return {
    cue: '1800027-00',
    nombre: 'Escuela Provincial N° 27',
    departamento: 'Capital',
    localidad: 'Corrientes',
    ambito: 'Urbano',
    cui: '18000270',
    jurisdiccion: 'Provincial',
    modalidad: 'Común',
    matricula: 7,
    historia: { 2024: 5, 2025: 6, 2026: 7 },
    lat: -27.47,
    lon: -58.83,
    pof: {},
    agentes: 0,
    zona: 'Zona 3',
    sueldosTotal: 1234567.5,
    personasSueldos: 4,
    clasificacionZonaSueldos: 'Zona desfavorable',
    ...overrides,
  }
}

const oferta: Record<string, OfertaNivel> = {
  Primario: {
    total: 7,
    turnos: { Mañana: 4, Tarde: 3 },
    modalidades: ['Común'],
    orientaciones: [],
  },
}

function crearProps(overrides: Partial<FichaEscuelaProps> = {}): FichaEscuelaProps {
  return {
    escuela: crearEscuela(),
    oferta,
    onCerrar: vi.fn(),
    onOrigen: vi.fn(),
    onDestino: vi.fn(),
    onAcercar: vi.fn(),
    recorridoActivo: false,
    ...overrides,
  }
}

/** Valor (dd) asociado a una etiqueta (dt) dentro de las listas de la ficha. */
function valorDe(etiqueta: string): string {
  const dt = screen.getAllByText(etiqueta, { selector: 'dt' })[0]
  return dt.nextElementSibling?.textContent ?? ''
}

describe('FichaEscuela', () => {
  afterEach(() => {
    cleanup()
  })

  it('muestra identificación, ubicación y matrícula del establecimiento', () => {
    render(<FichaEscuela {...crearProps()} />)

    expect(screen.getByRole('heading', { name: 'Escuela Provincial N° 27' })).toBeInTheDocument()
    expect(screen.getByText('CUE-Anexo 1800027-00')).toBeInTheDocument()
    expect(valorDe('Departamento')).toBe('Capital')
    expect(valorDe('Localidad')).toBe('Corrientes')
    expect(valorDe('Zona')).toBe('Zona 3')
    expect(valorDe('Matrícula primaria 2026')).toBe('7')
  })

  it('muestra la evolución 2023 a 2026 y marca el año faltante como sin dato, no como cero', () => {
    render(<FichaEscuela {...crearProps()} />)

    expect(valorDe('2023')).toBe('Sin dato')
    expect(screen.getAllByText('Sin dato').length).toBeGreaterThan(0)
    expect(valorDe('2024')).toContain('5 alumnos')
    expect(valorDe('2026')).toContain('7 alumnos')
  })

  it('muestra la oferta educativa con matrícula, turnos, modalidades y orientaciones', () => {
    render(<FichaEscuela {...crearProps()} />)

    expect(screen.getByRole('heading', { name: 'Primario' })).toBeInTheDocument()
    expect(valorDe('Matrícula agregada')).toBe('7')
    expect(valorDe('Turnos')).toBe('Mañana: 4 · Tarde: 3')
    expect(valorDe('Modalidades')).toBe('Común')
    expect(valorDe('Orientaciones')).toBe('Sin dato')
  })

  it('informa la ausencia de oferta cuando la fuente no tiene agregados', () => {
    render(<FichaEscuela {...crearProps({ oferta: undefined })} />)

    expect(screen.getByText('Sin datos de oferta')).toBeInTheDocument()
  })

  it('informa que la fuente no registra POF sin afirmar ausencia de personal', () => {
    render(<FichaEscuela {...crearProps()} />)

    expect(
      screen.getByText('La fuente no registra datos POF para este establecimiento. Esto no indica ausencia de personal.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/sin personal/i)).not.toBeInTheDocument()
  })

  it('muestra agentes y desglose por situación de revista cuando hay registros POF', () => {
    render(
      <FichaEscuela
        {...crearProps({
          escuela: crearEscuela({ agentes: 5, pof: { Docente: 4, Directivo: 1 } }),
        })}
      />,
    )

    expect(valorDe('Agentes')).toBe('5')
    expect(valorDe('Docente')).toBe('4')
    expect(valorDe('Directivo')).toBe('1')
    expect(screen.queryByText(/no registra datos POF/)).not.toBeInTheDocument()
  })

  it('muestra el importe mensual, el personal y la clasificación de zona de liquidaciones', () => {
    render(<FichaEscuela {...crearProps()} />)

    expect(valorDe('Importe mensual')).toBe(formatearARS(1234567.5))
    expect(valorDe('Período')).toBe('septiembre 2026')
    expect(valorDe('Personal informado')).toBe('4')
    expect(valorDe('Clasificación de zona')).toBe('Zona desfavorable')
  })

  it('indica sin importe informado cuando no hay costo salarial', () => {
    render(<FichaEscuela {...crearProps({ escuela: crearEscuela({ sueldosTotal: null, personasSueldos: null, clasificacionZonaSueldos: null }) })} />)

    expect(valorDe('Importe mensual')).toBe('Sin importe informado')
    expect(valorDe('Personal informado')).toBe('Sin dato')
    expect(valorDe('Clasificación de zona')).toBe('Sin dato')
  })

  it('no muestra botones de medición cuando el recorrido no está activo', () => {
    render(<FichaEscuela {...crearProps({ recorridoActivo: false })} />)

    expect(screen.queryByRole('button', { name: 'Medir desde aquí' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Medir hasta aquí' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acercar' })).toBeInTheDocument()
  })

  it('llama a onOrigen y onDestino con el CUE cuando el recorrido está activo', () => {
    const onOrigen = vi.fn()
    const onDestino = vi.fn()
    render(<FichaEscuela {...crearProps({ recorridoActivo: true, onOrigen, onDestino })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Medir desde aquí' }))
    fireEvent.click(screen.getByRole('button', { name: 'Medir hasta aquí' }))

    expect(onOrigen).toHaveBeenCalledExactlyOnceWith('1800027-00')
    expect(onDestino).toHaveBeenCalledExactlyOnceWith('1800027-00')
  })

  it('llama a onAcercar con el CUE', () => {
    const onAcercar = vi.fn()
    render(<FichaEscuela {...crearProps({ onAcercar })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Acercar' }))

    expect(onAcercar).toHaveBeenCalledExactlyOnceWith('1800027-00')
  })

  it('llama a onCerrar al presionar cerrar', () => {
    const onCerrar = vi.fn()
    render(<FichaEscuela {...crearProps({ onCerrar })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onCerrar).toHaveBeenCalledOnce()
  })
})
