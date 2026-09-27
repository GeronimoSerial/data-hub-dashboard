// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReplayPanel, ETIQUETA_VISTA, type ReplayPanelProps } from './replay-panel'
import type { RespuestaReplay } from '@/lib/infraestructura/use-replay'

function respuestaConCuadros(n: number, conVacios = false): RespuestaReplay {
  return {
    cuadros: Array.from({ length: n }, (_, i) => ({
      instante: new Date(Date.UTC(2026, 0, 1, i * 6)).toISOString(),
      afectacionesConfirmadas: [],
      snapshotRiesgo: null,
      nivelesPeligro: [],
      lluviaObservada: [],
      saludFuentes: [],
    })),
    vacios: Array.from({ length: n }, () => ({
      snapshotRiesgo: conVacios,
      peligro: conVacios,
      lluvia: conVacios,
    })),
    siguienteDesde: null,
  }
}

function props(overrides: Partial<ReplayPanelProps> = {}): ReplayPanelProps {
  return {
    departamentos: ['Capital', 'Goya'],
    territorioId: 'Capital',
    onTerritorioIdChange: vi.fn(),
    desde: '2026-01-01T00:00:00Z',
    hasta: '2026-01-02T00:00:00Z',
    onDesdeChange: vi.fn(),
    onHastaChange: vi.fn(),
    vista: 'conocido',
    onVistaChange: vi.fn(),
    paso: 6,
    data: null,
    loading: false,
    error: null,
    frameIndex: 0,
    onFrameIndexChange: vi.fn(),
    playing: false,
    onPlayingChange: vi.fn(),
    onVolver: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('ReplayPanel', () => {
  it('nunca arranca en reproducción: playing=false no dispara avance automático', async () => {
    const onFrameIndexChange = vi.fn()
    render(<ReplayPanel {...props({ data: respuestaConCuadros(3), onFrameIndexChange })} />)
    await vi.advanceTimersByTimeAsync(5000)
    expect(onFrameIndexChange).not.toHaveBeenCalled()
  })

  it('el botón Reproducir es operable por teclado y alterna playing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onPlayingChange = vi.fn()
    render(<ReplayPanel {...props({ data: respuestaConCuadros(3), onPlayingChange })} />)

    await user.tab()
    const botonPlay = screen.getByRole('button', { name: 'Reproducir' })
    // Tabea hasta el botón (timeline es tabIndex=0, el botón viene después).
    while (document.activeElement !== botonPlay) {
      await user.tab()
    }
    await user.keyboard('{Enter}')
    expect(onPlayingChange).toHaveBeenCalledWith(true)
  })

  it('paso adelante/atrás por click y por teclado (flechas en el grupo de línea de tiempo)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onFrameIndexChange = vi.fn()
    render(
      <ReplayPanel
        {...props({ data: respuestaConCuadros(3), frameIndex: 1, onFrameIndexChange })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Avanzar un cuadro' }))
    expect(onFrameIndexChange).toHaveBeenLastCalledWith(2)

    await user.click(screen.getByRole('button', { name: 'Retroceder un cuadro' }))
    expect(onFrameIndexChange).toHaveBeenLastCalledWith(0)

    const grupo = screen.getByRole('group', { name: /línea de tiempo/i })
    grupo.focus()
    await user.keyboard('{ArrowRight}')
    expect(onFrameIndexChange).toHaveBeenLastCalledWith(2)
    await user.keyboard('{ArrowLeft}')
    expect(onFrameIndexChange).toHaveBeenLastCalledWith(0)
  })

  it('detiene la reproducción sola al llegar al último cuadro (sin loop)', async () => {
    const onFrameIndexChange = vi.fn()
    const onPlayingChange = vi.fn()
    render(
      <ReplayPanel
        {...props({
          data: respuestaConCuadros(2),
          frameIndex: 0,
          playing: true,
          onFrameIndexChange,
          onPlayingChange,
        })}
      />,
    )
    await vi.advanceTimersByTimeAsync(1300)
    expect(onFrameIndexChange).toHaveBeenCalledWith(1)
    expect(onPlayingChange).toHaveBeenCalledWith(false)
  })

  it('muestra las dos etiquetas explicativas de vista y refleja la vista activa', () => {
    render(<ReplayPanel {...props({ vista: 'reconstruido' })} />)
    const botonConocido = screen.getByRole('button', { name: ETIQUETA_VISTA.conocido })
    const botonReconstruido = screen.getByRole('button', { name: ETIQUETA_VISTA.reconstruido })
    expect(botonConocido).toHaveAttribute('aria-pressed', 'false')
    expect(botonReconstruido).toHaveAttribute('aria-pressed', 'true')
  })

  it('cambia de vista al clickear la otra etiqueta', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onVistaChange = vi.fn()
    render(<ReplayPanel {...props({ onVistaChange })} />)
    await user.click(screen.getByRole('button', { name: ETIQUETA_VISTA.reconstruido }))
    expect(onVistaChange).toHaveBeenCalledWith('reconstruido')
  })

  it('muestra los vacíos temporales explícitos del cuadro activo, sin animarlos como continuidad', () => {
    render(<ReplayPanel {...props({ data: respuestaConCuadros(2, true), frameIndex: 0 })} />)
    const vacios = screen.getByTestId('replay-vacios')
    expect(vacios).toHaveTextContent('Sin dato de riesgo para este período.')
    expect(vacios).toHaveTextContent('Sin dato de peligro para este período.')
    expect(vacios).toHaveTextContent('Sin dato de lluvia observada para este período.')
  })

  // MENOR (revisión N1): `siguienteDesde` (cursor de paginación, tope 120
  // cuadros por consulta) llegaba en la respuesta pero nunca se leía en la
  // UI — una ventana de más de 30 días se truncaba en silencio.
  it('con siguienteDesde avisa que la ventana se truncó y hasta cuándo', () => {
    const datos = respuestaConCuadros(2)
    datos.siguienteDesde = '2026-01-03T00:00:00Z'
    render(<ReplayPanel {...props({ data: datos })} />)
    expect(screen.getByText(/supera el máximo de cuadros/i)).toBeInTheDocument()
  })

  it('sin siguienteDesde no muestra el aviso de ventana truncada', () => {
    render(<ReplayPanel {...props({ data: respuestaConCuadros(2) })} />)
    expect(screen.queryByText(/supera el máximo de cuadros/i)).not.toBeInTheDocument()
  })

  it('con un resultado sin cuadros no muestra el bloque de timeline y avisa "sin datos"', () => {
    render(<ReplayPanel {...props({ data: { cuadros: [], vacios: [], siguienteDesde: null } })} />)
    expect(screen.queryByRole('group', { name: /línea de tiempo/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('replay-sin-cuadros')).toBeInTheDocument()
  })

  it('el indicador siempre distingue historia del presente', () => {
    render(<ReplayPanel {...props({ data: respuestaConCuadros(1), frameIndex: 0 })} />)
    expect(screen.getByTestId('replay-indicador-historia')).toHaveTextContent(
      /Estás viendo historia:/,
    )
  })

  it('arma los enlaces de export CSV y JSON con los filtros activos', () => {
    render(<ReplayPanel {...props()} />)
    const csv = screen.getByTestId('replay-export-csv') as HTMLAnchorElement
    const json = screen.getByTestId('replay-export-json') as HTMLAnchorElement
    expect(csv.href).toContain('/api/infraestructura/replay/export?')
    expect(csv.href).toContain('formato=csv')
    expect(csv.href).toContain('territorioId=Capital')
    expect(json.href).toContain('formato=json')
  })

  it('sin territorioId no arma enlaces de export', () => {
    render(<ReplayPanel {...props({ territorioId: null })} />)
    expect(screen.queryByTestId('replay-export-csv')).not.toBeInTheDocument()
    expect(screen.queryByTestId('replay-export-json')).not.toBeInTheDocument()
  })

  it('el botón "Volver a la situación actual" invoca el callback', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onVolver = vi.fn()
    render(<ReplayPanel {...props({ onVolver })} />)
    await user.click(screen.getByRole('button', { name: 'Volver a la situación actual' }))
    expect(onVolver).toHaveBeenCalledTimes(1)
  })
})
