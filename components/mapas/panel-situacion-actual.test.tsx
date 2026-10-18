// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PanelSituacionActual } from './panel-situacion-actual'
import { ETIQUETA_SERVICIO } from '@/components/infraestructura/estado-actual-textos'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'

const ahora = Date.parse('2026-10-05T15:00:00.000Z')

const escuelas: EscuelaMapaEnriquecida[] = [
  {
    cueAnexo: '100', nombre: 'Escuela Alta', departamento: 'GENERAL ALVEAR', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Primario', 'Inicial'], alumnos: 80, gravedad: 3, categoriaPrincipal: 'establecimiento',
    clases: 'sin', apoyo: 'virtual', sinActualizar: true, ultimaNovedad: '2026-10-05T12:00:00.000Z', alumnosSinClases: 50,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
  {
    cueAnexo: '200', nombre: 'Escuela Parcial', departamento: 'Bella Vista', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Secundario'], alumnos: 60, gravedad: 3, categoriaPrincipal: 'alumnos',
    clases: 'parcial', apoyo: 'cuadernillo', sinActualizar: false, ultimaNovedad: '2026-10-05T14:00:00.000Z', alumnosSinClases: 10,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
  {
    cueAnexo: '300', nombre: 'Escuela Baja', departamento: 'Goya', localidad: 'Centro', lat: null, lon: null,
    niveles: ['Inicial'], alumnos: 30, gravedad: 1, categoriaPrincipal: 'establecimiento',
    clases: 'evacuado', apoyo: 'no', sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 30,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
  {
    cueAnexo: '400', nombre: 'Escuela sin reporte', departamento: 'Ituzaingó', localidad: 'Centro', lat: null, lon: null,
    niveles: [], alumnos: 20, gravedad: 0, categoriaPrincipal: null,
    clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
  {
    cueAnexo: '500', nombre: 'Escuela sin dato', departamento: 'Esquina', localidad: 'Centro', lat: null, lon: null,
    niveles: [], alumnos: 20, gravedad: 0, categoriaPrincipal: null,
    clases: 'sin', apoyo: 'sin_dato', sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 20,
    situacionesHistoricas: 0, solucionadasRecientes: 0,
  },
]

describe('PanelSituacionActual', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('muestra los totales, asistencia pedagógica y situaciones ordenadas por gravedad', () => {
    vi.spyOn(Date, 'now').mockReturnValue(ahora)
    const { container } = render(<PanelSituacionActual escuelas={escuelas} actualizadoEn="2026-10-05T14:30:00.000Z" onSeleccionar={vi.fn()} />)

    expect(screen.getByText('Escuelas sin clases').nextElementSibling).toHaveTextContent('4')
    expect(container.querySelector('.map-sitact__kpi--resaltado small')).toHaveTextContent('De 3 con situaciones abiertas')
    expect(screen.getByText('Alumnos sin clases').nextElementSibling).toHaveTextContent('110')
    expect(screen.getByText('Sin actualizar', { selector: 'dt' }).nextElementSibling).toHaveTextContent('1')
    expect(container.querySelector('.map-sitact__apoyo')).toHaveTextContent('Con asistencia pedagógica2 de 4')
    expect(container.querySelector('.map-sitact__apoyo')).toHaveTextContent('1 sin dato')

    const situaciones = screen.getByRole('region', { name: /Escuelas afectadas/ })
    const filas = within(situaciones).getAllByRole('button', { name: /^Escuela / })
    expect(filas.map((fila) => fila.getAttribute('aria-label'))).toEqual([
      'Escuela Parcial, Bella Vista · Secundario',
      'Escuela Alta, General Alvear · Primario, Inicial',
      'Escuela Baja, Goya · Inicial',
    ])
    expect(filas[1]).toHaveTextContent('General Alvear · Primario, Inicial')
    expect(filas[1]).toHaveTextContent(ETIQUETA_SERVICIO.suspendido)
    expect(filas[1]).toHaveTextContent('Asistencia pedagógica: clase virtual')
    expect(filas[1]).toHaveTextContent('Sin actualizar')
    expect(filas[1].textContent).toContain('hace 3\u00A0h')
    expect(within(situaciones).queryByText('Escuela sin reporte')).not.toBeInTheDocument()
  })

  it('muestra sólo las dos cifras principales como tarjetas', () => {
    const { container } = render(<PanelSituacionActual escuelas={escuelas} actualizadoEn={null} onSeleccionar={vi.fn()} />)
    const kpis = Array.from(container.querySelectorAll('.map-sitact__kpi'))

    expect(kpis.map((kpi) => kpi.querySelector('strong')?.textContent)).toEqual(['4', '110'])
    expect(kpis[0]).toHaveClass('map-sitact__kpi--resaltado')
  })

  it('filtra las escuelas afectadas con los chips', () => {
    render(<PanelSituacionActual escuelas={escuelas} actualizadoEn={null} onSeleccionar={vi.fn()} />)
    const situaciones = screen.getByRole('region', { name: /Escuelas afectadas/ })
    const filas = () => within(situaciones).queryAllByRole('button', { name: /^Escuela / })

    expect(within(situaciones).getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(situaciones).getByRole('button', { name: 'Sin actualizar' }))
    expect(filas().map((fila) => fila.getAttribute('aria-label'))).toEqual(['Escuela Alta, General Alvear · Primario, Inicial'])
    fireEvent.click(within(situaciones).getByRole('button', { name: 'Todas' }))
    expect(filas()).toHaveLength(3)
  })

  it('selecciona la escuela al activar su renglón', () => {
    const onSeleccionar = vi.fn()
    render(<PanelSituacionActual escuelas={escuelas} actualizadoEn={null} onSeleccionar={onSeleccionar} />)

    fireEvent.click(screen.getByRole('button', { name: /Escuela Alta/ }))

    expect(onSeleccionar).toHaveBeenCalledWith('100')
  })

  it('muestra KPI y escuelas con soluciones recientes sin situaciones abiertas', () => {
    const onSeleccionar = vi.fn()
    const solucionada = { ...escuelas[3], cueAnexo: '600', nombre: 'Escuela Solucionada', solucionadasRecientes: 2, ultimaNovedad: '2026-10-05T13:00:00.000Z' }
    const otraSolucionada = { ...escuelas[3], cueAnexo: '700', nombre: 'Escuela Otra', solucionadasRecientes: 1, ultimaNovedad: null }
    const tambienAbierta = { ...escuelas[0], cueAnexo: '800', nombre: 'Escuela Abierta y Solucionada', solucionadasRecientes: 1 }
    render(<PanelSituacionActual escuelas={[solucionada, otraSolucionada, tambienAbierta]} actualizadoEn={null} onSeleccionar={onSeleccionar} />)

    const seccion = screen.getByText('Solucionadas en los últimos 15 días').closest('details')!
    expect(seccion).not.toHaveAttribute('open')
    expect(seccion.querySelector('summary')).toHaveTextContent('2')
    const filas = within(seccion).getAllByRole('button')
    expect(filas.map((fila) => fila.getAttribute('aria-label'))).toEqual([
      'Escuela Solucionada, Ituzaingó',
      'Escuela Otra, Ituzaingó',
    ])
    expect(filas[0]).toHaveTextContent('Solucionada recientemente')
    expect(filas[0].querySelector('.map-sitact__franja')).not.toHaveAttribute('style')
    fireEvent.click(filas[0])
    expect(onSeleccionar).toHaveBeenCalledWith('600')
    expect(within(seccion).queryByRole('button', { name: /Abierta y Solucionada/ })).not.toBeInTheDocument()
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

  it('ubica la fecha junto a la meta y envuelve los chips largos con el nombre más extenso', () => {
    vi.spyOn(Date, 'now').mockReturnValue(ahora)
    const nombre = 'ESCUELA Nº 276 "SERAFIN IBAÑEZ" - ANEXO DE PARAJE EL CARMEN'
    const escuela = {
      ...escuelas[0], nombre, cueAnexo: '18000276-00', departamento: 'Goya', niveles: ['Primario'],
      clases: 'parcial' as const, apoyo: 'sin_dato' as const, sinActualizar: true,
      ultimaNovedad: '2026-10-04T15:00:00.000Z',
    }
    const { container } = render(<PanelSituacionActual escuelas={[escuela]} actualizadoEn={null} onSeleccionar={vi.fn()} />)
    const fila = screen.getByRole('button', { name: `${nombre}, Goya · Primario` })
    const contenido = fila.querySelector('.map-sitact__contenido-fila')
    const metaFila = fila.querySelector('.map-sitact__meta-fila')
    const chips = fila.querySelector('.map-sitact__chips')
    const cuando = fila.querySelector('.map-sitact__cuando')
    const css = readFileSync('app/globals.css', 'utf8')
    const reglaPill = css.match(/\.map-sitact__pill\s*\{[^}]*\}/)?.[0]
    const reglaCuando = css.match(/\.map-sitact__cuando\s*\{[^}]*\}/)?.[0]

    expect(fila).toHaveAttribute('aria-label', `${nombre}, Goya · Primario`)
    expect(metaFila?.parentElement).toBe(contenido)
    expect(metaFila?.nextElementSibling).toBe(chips)
    expect(metaFila?.querySelector('.map-sitact__meta')).toHaveTextContent('Goya · Primario')
    expect(metaFila?.querySelector('.map-sitact__cuando')).toHaveTextContent('hace 1 d')
    expect(cuando?.closest('.map-sitact__contenido-fila')).toBe(contenido)
    expect(container.querySelector('.map-sitact__pill--clases')).toHaveTextContent('Funcionamiento parcialmente interrumpido')
    expect(container.querySelector('.map-sitact__pill--neutro')).toHaveTextContent('Asistencia pedagógica sin dato')
    expect(container.querySelectorAll('.map-sitact__pill--neutro')[1]).toHaveTextContent('Sin actualizar')
    expect(reglaPill).toContain('white-space: normal')
    expect(reglaPill).not.toContain('white-space: nowrap')
    expect(reglaCuando).toMatch(/flex-shrink:\s*0/)
  })

  it('muestra el vacío y omite la proporción cuando no hay escuelas sin clases', () => {
    render(<PanelSituacionActual escuelas={[escuelas[3]]} actualizadoEn={null} onSeleccionar={vi.fn()} />)

    expect(screen.getByText('Ninguna escuela con situaciones abiertas para estos filtros.')).toBeInTheDocument()
    expect(screen.queryByText(/escuelas sin clases brindan asistencia pedagógica/)).not.toBeInTheDocument()
  })
})
