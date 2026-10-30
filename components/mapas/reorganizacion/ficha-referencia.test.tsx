// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FichaReferencia, type FichaReferenciaProps } from './ficha-referencia'
import type { OfertaNivel, ReferenciaV29 } from '@/lib/reorganizacion/tipos'

function crearReferencia(overrides: Partial<ReferenciaV29> = {}): ReferenciaV29 {
  return {
    cue: '1800100-00',
    nombre: 'Escuela Provincial de Referencia N° 100',
    lat: -28.1,
    lon: -58.2,
    primaria: true,
    secundaria: false,
    matriculaPrimaria: 1250,
    localidad: 'Mercedes',
    departamento: 'Mercedes',
    ...overrides,
  }
}

const ofertaCompleta: Record<string, OfertaNivel> = {
  Primario: {
    total: 1250,
    turnos: { Tarde: 600, Mañana: 650 },
    modalidades: ['Común'],
    orientaciones: [],
  },
  Secundario: {
    total: 340,
    turnos: { Mañana: 340 },
    modalidades: ['Común'],
    orientaciones: ['Ciencias Naturales'],
  },
}

function crearProps(overrides: Partial<FichaReferenciaProps> = {}): FichaReferenciaProps {
  return {
    referencia: crearReferencia(),
    oferta: ofertaCompleta,
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

describe('FichaReferencia', () => {
  afterEach(cleanup)

  it('muestra nombre, CUE-Anexo, ubicación y la aclaración de referencia', () => {
    render(<FichaReferencia {...crearProps()} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Escuela Provincial de Referencia N° 100' })).toBeTruthy()
    expect(screen.getByText('CUE-Anexo 1800100-00')).toBeTruthy()
    expect(valorDe('Localidad')).toBe('Mercedes')
    expect(valorDe('Departamento')).toBe('Mercedes')
    expect(
      screen.getByText('Establecimiento de referencia: no integra el universo de hasta 10 alumnos'),
    ).toBeTruthy()
  })

  it('formatea la matrícula primaria y muestra "Sin dato" cuando la fuente no la informa', () => {
    const { unmount } = render(<FichaReferencia {...crearProps()} />)
    expect(valorDe('Matrícula primaria 2026')).toBe('1.250')
    unmount()

    render(<FichaReferencia {...crearProps({ referencia: crearReferencia({ matriculaPrimaria: null }) })} />)
    expect(valorDe('Matrícula primaria 2026')).toBe('Sin dato')
    expect(valorDe('Matrícula primaria 2026')).not.toBe('0')
  })

  it('lista los dos niveles cuando el establecimiento ofrece Primaria y Secundaria', () => {
    render(
      <FichaReferencia
        {...crearProps({ referencia: crearReferencia({ primaria: true, secundaria: true }) })}
      />,
    )
    expect(valorDe('Niveles que ofrece')).toBe('Primaria, Secundaria')
  })

  it('lista solo Secundaria cuando la bandera de primaria es falsa', () => {
    render(
      <FichaReferencia
        {...crearProps({
          referencia: crearReferencia({ primaria: false, secundaria: true, matriculaPrimaria: null }),
        })}
      />,
    )
    expect(valorDe('Niveles que ofrece')).toBe('Secundaria')
  })

  it('muestra la oferta agregada de cada nivel', () => {
    render(<FichaReferencia {...crearProps()} />)

    expect(screen.getByRole('heading', { level: 4, name: 'Primario' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 4, name: 'Secundario' })).toBeTruthy()
    expect(screen.getByText('Ciencias Naturales')).toBeTruthy()
    expect(screen.getByText('Mañana: 650 · Tarde: 600')).toBeTruthy()
    expect(screen.getByText('340')).toBeTruthy()
  })

  it('indica la falta de oferta cuando la fuente no tiene agregados', () => {
    render(<FichaReferencia {...crearProps({ oferta: undefined })} />)
    expect(screen.getByText('Sin datos de oferta')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 4 })).toBeNull()
  })

  it('oculta los botones de medición mientras no hay un recorrido activo', () => {
    render(<FichaReferencia {...crearProps({ recorridoActivo: false })} />)
    expect(screen.queryByRole('button', { name: 'Medir desde aquí' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Medir hasta aquí' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Acercar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeTruthy()
  })

  it('muestra los botones de medición y los conecta con el CUE cuando el recorrido está activo', () => {
    const onOrigen = vi.fn()
    const onDestino = vi.fn()
    render(<FichaReferencia {...crearProps({ recorridoActivo: true, onOrigen, onDestino })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Medir desde aquí' }))
    expect(onOrigen).toHaveBeenCalledWith('1800100-00')
    expect(onDestino).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Medir hasta aquí' }))
    expect(onDestino).toHaveBeenCalledWith('1800100-00')
  })

  it('llama a onAcercar con el CUE y a onCerrar al pulsar Cerrar', () => {
    const onAcercar = vi.fn()
    const onCerrar = vi.fn()
    render(<FichaReferencia {...crearProps({ onAcercar, onCerrar })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Acercar' }))
    expect(onAcercar).toHaveBeenCalledWith('1800100-00')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })
})
