// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PanelSituacionActual } from './panel-situacion-actual'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'

const ahora = Date.parse('2026-10-05T15:00:00.000Z')

const escuelas: EscuelaMapaEnriquecida[] = [
  {
    cueAnexo: '100', nombre: 'Escuela Alta', departamento: 'GENERAL ALVEAR', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Primario', 'Inicial'], alumnos: 80, gravedad: 3, categoriaPrincipal: 'establecimiento',
    clases: 'sin', apoyo: 'virtual', sinActualizar: true, ultimaNovedad: '2026-10-05T12:00:00.000Z', alumnosSinClases: 50,
    situacionesHistoricas: 0,
  },
  {
    cueAnexo: '200', nombre: 'Escuela Parcial', departamento: 'Bella Vista', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Secundario'], alumnos: 60, gravedad: 3, categoriaPrincipal: 'alumnos',
    clases: 'parcial', apoyo: 'cuadernillo', sinActualizar: false, ultimaNovedad: '2026-10-05T14:00:00.000Z', alumnosSinClases: 10,
    situacionesHistoricas: 0,
  },
  {
    cueAnexo: '300', nombre: 'Escuela Baja', departamento: 'Goya', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Inicial'], alumnos: 30, gravedad: 1, categoriaPrincipal: 'establecimiento',
    clases: 'evacuado', apoyo: 'no', sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 30,
    situacionesHistoricas: 0,
  },
  {
    cueAnexo: '400', nombre: 'Escuela sin reporte', departamento: 'Ituzaingó', localidad: 'Centro', lat: null, lon: null,
    niveles: [], alumnos: 20, gravedad: 0, categoriaPrincipal: null,
    clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0,
    situacionesHistoricas: 0,
  },
  {
    cueAnexo: '500', nombre: 'Escuela sin dato', departamento: 'Esquina', localidad: 'Centro', lat: null, lon: null,
    niveles: [], alumnos: 20, gravedad: 0, categoriaPrincipal: null,
    clases: 'sin', apoyo: 'sin_dato', sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 20,
    situacionesHistoricas: 0,
  },
]

describe('PanelSituacionActual', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('muestra los totales, asistencia pedagógica y reportes ordenados por gravedad', () => {
    vi.spyOn(Date, 'now').mockReturnValue(ahora)
    const { container } = render(<PanelSituacionActual escuelas={escuelas} actualizadoEn="2026-10-05T14:30:00.000Z" onSeleccionar={vi.fn()} />)

    expect(screen.getByText('Escuelas con reporte').previousElementSibling).toHaveTextContent('3')
    expect(screen.getByText('Sin clases', { selector: '.map-sitact__kpi span' }).parentElement).toHaveTextContent('4')
    expect(screen.getByText('Alumnos sin clases').previousElementSibling).toHaveTextContent('110')
    expect(screen.getByText('Sin actualizar', { selector: '.map-sitact__kpi span' }).parentElement).toHaveTextContent('1')
    expect(container.querySelector('.map-sitact__apoyo p')).toHaveTextContent('2 de 4 escuelas sin clases brindan asistencia pedagógica')
    expect(container.querySelector('.map-sitact__apoyo')).toHaveTextContent('1 sin dato')
    expect(screen.getByRole('progressbar', { name: 'Escuelas sin clases que brindan asistencia pedagógica' })).toBeInTheDocument()

    const reportes = screen.getByRole('region', { name: /Reportes/ })
    const filas = within(reportes).getAllByRole('button')
    expect(filas.map((fila) => fila.getAttribute('aria-label'))).toEqual([
      'Escuela Parcial, Bella Vista · Secundario',
      'Escuela Alta, General Alvear · Primario, Inicial',
      'Escuela Baja, Goya · Inicial',
    ])
    expect(filas[1]).toHaveTextContent('General Alvear · Primario, Inicial')
    expect(filas[1]).toHaveTextContent('Sin clases')
    expect(filas[1]).toHaveTextContent('Asistencia pedagógica: clase virtual')
    expect(filas[1]).toHaveTextContent('Sin actualizar')
    expect(filas[1].textContent).toContain('hace 3\u00A0h')
    expect(within(reportes).queryByText('Escuela sin reporte')).not.toBeInTheDocument()
  })

  it('selecciona la escuela al activar su renglón', () => {
    const onSeleccionar = vi.fn()
    render(<PanelSituacionActual escuelas={escuelas} actualizadoEn={null} onSeleccionar={onSeleccionar} />)

    fireEvent.click(screen.getByRole('button', { name: /Escuela Alta/ }))

    expect(onSeleccionar).toHaveBeenCalledWith('100')
  })

  it('conserva el nombre completo y lo limita visualmente a dos líneas', () => {
    const nombre = 'ESCUELA Nº 276 "SERAFIN IBAÑEZ" - ANEXO DE PARAJE EL CARMEN'
    const escuela = { ...escuelas[0], cueAnexo: '500', nombre }
    const { container } = render(<PanelSituacionActual escuelas={[escuela]} actualizadoEn={null} onSeleccionar={vi.fn()} />)
    const elementoNombre = container.querySelector('.map-sitact__nombre')
    const css = readFileSync('app/globals.css', 'utf8')
    const reglaNombre = css.match(/\.map-sitact__nombre\s*\{[^}]*\}/)?.[0]

    expect(elementoNombre).toHaveTextContent(nombre)
    expect(elementoNombre).toHaveAttribute('title', nombre)
    expect(reglaNombre).toContain('line-clamp: 2')
  })

  it('muestra el vacío y omite la proporción cuando no hay escuelas sin clases', () => {
    render(<PanelSituacionActual escuelas={[escuelas[3]]} actualizadoEn={null} onSeleccionar={vi.fn()} />)

    expect(screen.getByText('Ninguna escuela con reporte para estos filtros.')).toBeInTheDocument()
    expect(screen.queryByText(/escuelas sin clases brindan asistencia pedagógica/)).not.toBeInTheDocument()
    expect(screen.getByText('Situación actual')).toBeInTheDocument()
  })
})
