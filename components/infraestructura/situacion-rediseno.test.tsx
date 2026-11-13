// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EstadoDatos, EstadoDato, ItemEstadoDato } from '@/lib/infraestructura/riesgo/estado-datos/clasificar'
import { SituacionClient, type EstadoSituacionCliente } from './situacion-client'

function item(id: string, estado: EstadoDato, extra: Partial<ItemEstadoDato> = {}): ItemEstadoDato {
  return {
    id, grupo: 'riesgo', nombre: id, estado, motivo: 'Motivo.', ultimoExitoEn: '2026-09-27T09:00:00.000Z',
    ultimoIntentoEn: null, ultimoError: null, edadMinutos: 60, intervaloMinutos: 360, ...extra,
  }
}

function estadoDatos(items: ItemEstadoDato[]): EstadoDatos {
  return {
    items,
    problemas: items.filter((i) => i.estado !== 'ok' && i.estado !== 'deshabilitado').length,
    generadoEn: '2026-09-27T12:00:00.000Z',
  }
}

function estado(datos: EstadoDatos): EstadoSituacionCliente {
  return {
    corte: {
      id: 'c1', generadoEn: '2026-09-27T12:00:00.000Z',
      kpis: { escuelasAfectacionConfirmadaVigente: 107, escuelasRiesgoAlto24h: 6, fuentesVencidas: 13 },
      conteosPorNivelRiesgo: {}, fuentesSalud: [], episodiosAbiertos: 0, episodiosCerradosDesdeAnterior: 0, cobertura: null,
    },
    briefing: ['Línea 1.'],
    atraso: { texto: 'al día', atrasado: false, desactivadoPorConfig: false },
    prioridades: [{ cueAnexo: '1801081-00', departamento: 'GOYA', nivelRiesgo: 'alto', scoreRiesgo: 0.8 }],
    sinRun: false,
    estadoDatos: datos,
  }
}

const SIN_FALLA = estadoDatos([
  item('a', 'ok', { nombre: 'Fuente sana' }),
  item('b', 'deshabilitado', { nombre: 'Fuente estática' }),
  item('c', 'atrasado', { nombre: 'Fuente atrasada' }),
  item('d', 'sin_datos', { nombre: 'Fuente sin datos' }),
])
const CON_FALLA = estadoDatos([...SIN_FALLA.items, item('e', 'fallido', { nombre: 'Fuente caída', ultimoError: 'HTTP 429' })])

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ porRegistro: [], porVigencia: [] }) })))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Centro de Situación: situación primero', () => {
  it('muestra KPIs y prioridades antes del estado de los datos', () => {
    render(<SituacionClient estadoInicial={estado(SIN_FALLA)} />)
    const kpi = screen.getByTestId('situacion-kpi-Fuentes vencidas')
    const prioridades = screen.getByTestId('situacion-prioridades')
    const datos = screen.getByTestId('estado-datos')
    expect(kpi.compareDocumentPosition(prioridades) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(prioridades.compareDocumentPosition(datos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('no usa ningún <select> nativo', () => {
    const { container } = render(<SituacionClient estadoInicial={estado(SIN_FALLA)} />)
    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Rango de cambios' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Mostrar por' })).toBeInTheDocument()
  })

  it('el selector custom mantiene las opciones y cambia el rango', async () => {
    const user = userEvent.setup()
    render(<SituacionClient estadoInicial={estado(SIN_FALLA)} nombresEscuelas={{}} />)
    await user.click(screen.getByRole('combobox', { name: 'Rango de cambios' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Última hora', 'Últimas 24 horas', 'Últimos 7 días'])
    await user.click(screen.getByRole('option', { name: 'Últimos 7 días' }))
    const llamadas = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))
    expect(llamadas.length).toBeGreaterThan(1)
  })

  it('prioridades: nombre de la escuela, departamento, nivel y enlace a la ficha', () => {
    render(<SituacionClient estadoInicial={estado(SIN_FALLA)} nombresEscuelas={{ '1801081-00': 'Escuela N° 1' }} />)
    const fila = within(screen.getByTestId('situacion-prioridades')).getByTestId('situacion-prioridad-fila')
    expect(fila).toHaveTextContent('Escuela N° 1')
    expect(fila).toHaveTextContent('1801081-00')
    expect(fila).toHaveTextContent('GOYA')
    expect(fila).toHaveTextContent('Alto')
    expect(within(fila).getByRole('link')).toHaveAttribute('href', '/mapas/infraestructura/escuelas/1801081-00')
  })

  it('prioridades sin nombre resuelto: cae al CUE', () => {
    render(<SituacionClient estadoInicial={estado(SIN_FALLA)} />)
    expect(screen.getByTestId('situacion-prioridad-fila')).toHaveTextContent('1801081-00')
  })

  it('estado de los datos: una línea de conteos y cerrado por defecto sin fallas', () => {
    render(<SituacionClient estadoInicial={estado(SIN_FALLA)} />)
    const panel = screen.getByTestId('estado-datos')
    expect(panel).not.toHaveAttribute('open')
    expect(screen.getByTestId('estado-datos-conteos')).toHaveTextContent('1 al día · 1 desactualizada · 1 sin datos · 1 no programada')
  })

  it('se abre solo cuando una fuente falló y muestra el error', () => {
    render(<SituacionClient estadoInicial={estado(CON_FALLA)} />)
    const panel = screen.getByTestId('estado-datos')
    expect(panel).toHaveAttribute('open')
    expect(panel).toHaveTextContent('HTTP 429')
    expect(screen.getByTestId('estado-datos-conteos')).toHaveTextContent('1 falló')
  })

  it('las fuentes al día y no programadas quedan ocultas tras "Ver todas las fuentes"', async () => {
    const user = userEvent.setup()
    render(<SituacionClient estadoInicial={estado(CON_FALLA)} />)
    const panel = screen.getByTestId('estado-datos')
    expect(screen.getByText('Fuente sana')).not.toBeVisible()
    expect(screen.getByText('Fuente estática')).not.toBeVisible()
    expect(within(panel).getByText('Fuente caída')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Ver todas las fuentes' }))
    expect(screen.getByText('Fuente sana')).toBeVisible()
    expect(screen.getByText('Fuente estática')).toBeVisible()
  })

  it('rojo sólo para Falló y ámbar para Desactualizado', () => {
    render(<SituacionClient estadoInicial={estado(CON_FALLA)} />)
    const clase = (nombre: string) => screen.getByText(nombre).closest('li')?.querySelector('.badge')?.className
    expect(clase('Fuente caída')).toContain('badge--danger')
    expect(clase('Fuente atrasada')).toContain('badge--warning')
    expect(clase('Fuente sin datos')).toContain('badge--neutral')
    expect(clase('Fuente estática')).toContain('badge--neutral')
  })
})
