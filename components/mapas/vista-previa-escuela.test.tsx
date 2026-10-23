// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { VistaPreviaEscuela } from './vista-previa-escuela'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'

function crearEscuelaBase(
  overrides: Partial<EscuelaMapaEnriquecida & { parte?: ParteMapa; ubicacionDisponible?: boolean }> = {},
) {
  return {
    cueAnexo: '1800123-00',
    nombre: 'Escuela N° 42 Belgrano',
    departamento: 'CAPITAL',
    localidad: 'Corrientes',
    lat: -27.47,
    lon: -58.83,
    niveles: ['Primaria'],
    alumnos: 310,
    gravedad: 0 as const,
    categoriaPrincipal: null,
    clases: 'normal' as const,
    apoyo: null,
    sinActualizar: false,
    ultimaNovedad: null,
    alumnosSinClases: 0,
    situacionesHistoricas: 0,
    solucionadasRecientes: 0,
    ...overrides,
  }
}

describe('VistaPreviaEscuela', () => {
  it.each(['Media', null] as const)('muestra la prioridad %s del parte actualizado en lugar de la gravedad anterior', (prioridad) => {
    const escuela = crearEscuelaBase({
      gravedad: 4, categoriaPrincipal: 'alumnos',
      parte: {
        parteId: 'p1', cueAnexo: '1800123-00', nombre: 'Escuela', departamento: 'Capital', localidad: 'Corrientes',
        lat: -27.47, lon: -58.83, servicio: 'normal', estadoEstablecimiento: 'habitual', peorSeveridad: 'Crítica',
        categorias: ['alumnos'], seccionesAlcanzadas: 1, alumnosDelHecho: 3, alumnosAlcanzados: 3,
        rigeDesde: '2026-04-09T10:00:00Z', actualizadaEn: '2026-04-09T10:00:00Z',
        afectaciones: [{
          id: 'a1', motivo: 'Camino anegado', categoria: 'alumnos', severidad: 'Crítica', descripcion: null,
          rigeDesde: '2026-04-09T10:00:00Z', creadaEn: '2026-04-09T10:00:00Z',
          impactoAlumnos: { afectados: 3, matricula: prioridad ? 5 : null, porcentaje: prioridad ? 60 : null, prioridad, corteId: 1, version: 1 },
        }],
      },
    })
    render(<VistaPreviaEscuela escuela={escuela} urlFichaCompleta="/mapas/infraestructura/escuelas/1800123-00" onCerrarVistaPrevia={vi.fn()} onQuitarSeleccion={vi.fn()} />)
    const situacion = screen.getByTestId('preview-bloque-situacion')
    expect(situacion).toHaveTextContent(prioridad ? 'Prioridad Media' : 'Sin datos para calcular la prioridad')
    expect(situacion).not.toHaveTextContent('Crítica')
  })
  afterEach(() => {
    cleanup()
  })
  it('muestra situación activa reportada, vigencia y bloque separado de exposición', () => {
    const onCerrar = vi.fn()
    const onQuitar = vi.fn()
    const onAbrir = vi.fn()

    const escuela = crearEscuelaBase({
      gravedad: 3,
      categoriaPrincipal: 'establecimiento',
      clases: 'sin',
      apoyo: 'virtual',
      sinActualizar: true,
      ultimaNovedad: '2026-04-10T12:00:00Z',
      situacionesHistoricas: 4,
      solucionadasRecientes: 1,
      parte: {
        parteId: 'p-1',
        cueAnexo: '1800123-00',
        nombre: 'Escuela N° 42 Belgrano',
        departamento: 'CAPITAL',
        localidad: 'Corrientes',
        lat: -27.47,
        lon: -58.83,
        servicio: 'suspendido',
        estadoEstablecimiento: 'evacuado',
        peorSeveridad: 'Alta',
        categorias: ['establecimiento'],
        afectaciones: [
          {
            id: 'af-1',
            motivo: 'Inundación del patio',
            categoria: 'establecimiento',
            severidad: 'Alta',
            descripcion: 'Agua en ingreso',
            rigeDesde: '2026-04-09T10:00:00Z',
            creadaEn: '2026-04-09T10:00:00Z',
          },
        ],
        seccionesAlcanzadas: 4,
        alumnosDelHecho: 310,
        alumnosAlcanzados: 310,
        rigeDesde: '2026-04-09T10:00:00Z',
        actualizadaEn: '2026-04-10T12:00:00Z',
      },
    })

    render(
      <VistaPreviaEscuela
        escuela={escuela}
        urlFichaCompleta="/mapas/infraestructura/escuelas/1800123-00?origen=mapa"
        onCerrarVistaPrevia={onCerrar}
        onQuitarSeleccion={onQuitar}
        onAbrirFichaCompleta={onAbrir}
      />,
    )

    expect(screen.getByText('Escuela N° 42 Belgrano')).toBeDefined()
    expect(screen.getByText(/CUE 1800123-00/)).toBeDefined()
    expect(screen.getByText('Inundación del patio')).toBeDefined()
    expect(screen.getByTestId('observacion-reporte')).toHaveTextContent('Observación registrada en el reporte:')
    expect(screen.getByTestId('observacion-reporte').querySelector('blockquote p')?.textContent).toBe('Agua en ingreso')
    expect(screen.getByText('Gravedad Alta')).toBeDefined()
    expect(screen.getByTestId('chip-sin-actualizar').textContent).toContain('Sin actualizar (>72 h)')
    expect(screen.getByTestId('preview-bloque-riesgo').textContent).toContain('4 situaciones históricas')

    const link = screen.getByTestId('abrir-ficha-completa')
    expect(link.getAttribute('href')).toBe('/mapas/infraestructura/escuelas/1800123-00?origen=mapa')
    fireEvent.click(link)
    expect(onAbrir).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('cerrar-preview'))
    expect(onCerrar).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('preview-quitar-seleccion'))
    expect(onQuitar).toHaveBeenCalledTimes(1)
  })

  it('no muestra la categoría como motivo mientras carga el parte', () => {
    const escuela = { ...crearEscuelaBase(), gravedad: 3 as const, categoriaPrincipal: 'establecimiento' as const }

    render(
      <VistaPreviaEscuela
        escuela={escuela}
        urlFichaCompleta="/mapas/infraestructura/escuelas/1800123-00"
        onCerrarVistaPrevia={vi.fn()}
        onQuitarSeleccion={vi.fn()}
        cargandoParte
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando situación…')
    expect(screen.queryByText('Afecta al establecimiento')).toBeNull()
  })

  it('muestra el nivel de aislamiento solo cuando la escuela tiene dato', () => {
    const props = {
      escuela: crearEscuelaBase(),
      urlFichaCompleta: '/mapas/infraestructura/escuelas/1800123-00',
      onCerrarVistaPrevia: vi.fn(),
      onQuitarSeleccion: vi.fn(),
    }
    const { rerender } = render(<VistaPreviaEscuela {...props} aislamiento={3} />)
    expect(screen.getByTestId('preview-aislamiento')).toHaveTextContent('AislamientoAlta')

    rerender(<VistaPreviaEscuela {...props} distanciaLocalidad={{ nombre: 'Goya', km: 12.4 }} />)
    expect(screen.queryByTestId('preview-aislamiento')).toBeNull()
    expect(screen.getByTestId('preview-distancia-localidad')).toHaveTextContent('12 km por caminoGoya')

    rerender(<VistaPreviaEscuela {...props} distanciaLocalidad={{ nombre: 'Goya', km: 12.4, superficie: 'ripio' }} />)
    expect(screen.getByTestId('preview-distancia-localidad')).toHaveTextContent('12 km por camino de ripioGoya')

    rerender(<VistaPreviaEscuela {...props} distanciaLocalidad={{ nombre: 'Goya', km: 12.4, superficie: 'ripio', desglose: '8 km pavimentado · 4,4 km de ripio' }} />)
    expect(screen.getByTestId('preview-distancia-localidad')).toHaveTextContent('12 km por caminoGoya8 km pavimentado · 4,4 km de ripio')
  })

  it('muestra alumnos afectados sobre la matrícula y su porcentaje', () => {
    const escuela = { ...crearEscuelaBase(), clases: 'sin' as const, alumnosSinClases: 124 }

    render(
      <VistaPreviaEscuela
        escuela={escuela}
        urlFichaCompleta="/mapas/infraestructura/escuelas/1800123-00"
        onCerrarVistaPrevia={vi.fn()}
        onQuitarSeleccion={vi.fn()}
      />,
    )

    const impacto = screen.getByTestId('preview-bloque-impacto')
    expect(impacto).toHaveTextContent('124alumnos afectados')
    expect(impacto).toHaveTextContent('40% de 310 alumnos de la escuela')
    expect(screen.getByRole('img', { name: '40% de la matrícula afectada' })).toBeInTheDocument()
  })

  it('distingue explícitamente la ausencia de reporte activo de la normalidad confirmada', () => {
    const escuela = crearEscuelaBase()

    render(
      <VistaPreviaEscuela
        escuela={escuela}
        urlFichaCompleta="/mapas/infraestructura/escuelas/1800123-00"
        onCerrarVistaPrevia={vi.fn()}
        onQuitarSeleccion={vi.fn()}
      />,
    )

    expect(screen.getByTestId('preview-sin-reporte').textContent).toContain(
      'Sin reporte activo (la ausencia de reporte no confirma normalidad)',
    )
    expect(screen.queryByTestId('badge-sin-ubicacion')).toBeNull()
  })

  it('muestra aviso explícito cuando la escuela no tiene ubicación georreferenciada', () => {
    const escuela = crearEscuelaBase({
      lat: null,
      lon: null,
      ubicacionDisponible: false,
    })

    render(
      <VistaPreviaEscuela
        escuela={escuela}
        urlFichaCompleta="/mapas/infraestructura/escuelas/1800123-00"
        onCerrarVistaPrevia={vi.fn()}
        onQuitarSeleccion={vi.fn()}
      />,
    )

    expect(screen.getByTestId('badge-sin-ubicacion').textContent).toContain(
      'Ubicación no disponible en el mapa',
    )
  })
})
