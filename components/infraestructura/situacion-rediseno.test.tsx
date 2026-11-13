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

  it('se abre solo cuando hay más fuentes sin datos que al día', () => {
    render(<SituacionClient estadoInicial={estado(estadoDatos([item('a', 'sin_datos'), item('b', 'sin_datos'), item('c', 'deshabilitado')]))} />)
    expect(screen.getByTestId('estado-datos')).toHaveAttribute('open')
  })

  it('también cuando sólo una fuente está al día pero hay más sin datos', () => {
    render(<SituacionClient estadoInicial={estado(estadoDatos([item('a', 'ok'), item('b', 'sin_datos'), item('c', 'sin_datos')]))} />)
    expect(screen.getByTestId('estado-datos')).toHaveAttribute('open')
  })

  it('sigue cerrado si hay tantas o más fuentes al día que sin datos y ninguna falló', () => {
    render(<SituacionClient estadoInicial={estado(SIN_FALLA)} />)
    expect(screen.getByTestId('estado-datos')).not.toHaveAttribute('open')
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

describe('Centro de Situación: lista de cambios', () => {
  const cambio = (id: string, cue: string) => ({
    id, tipo: 'afectacion' as const, ocurreEn: '2026-09-27T11:00:00.000Z', departamento: 'CAPITAL', cueAnexo: cue,
    descripcion: 'Situación: Inundación',
  })

  function conCambios(lista: ReturnType<typeof cambio>[], nombres: Record<string, string> = {}) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/situacion/cambios')) return { ok: true, json: async () => ({ porRegistro: lista, porVigencia: lista }) }
      if (url.includes('/situacion/escuelas')) return { ok: true, json: async () => ({ nombres }) }
      return { ok: true, json: async () => ({}) }
    }))
  }

  it('agrupa cambios idénticos consecutivos y se expande con el nombre de cada escuela', async () => {
    const user = userEvent.setup()
    conCambios(
      [cambio('1', '1800001-00'), cambio('2', '1800002-00'), cambio('3', '1800003-00')],
      { '1800001-00': 'Escuela Uno', '1800002-00': 'Escuela Dos', '1800003-00': 'Escuela Tres' },
    )
    render(<SituacionClient estadoInicial={estado(SIN_FALLA)} />)
    const items = await screen.findAllByTestId('situacion-timeline-item')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('3 escuelas')
    expect(items[0]).toHaveTextContent('CAPITAL')
    await user.click(screen.getByRole('button', { name: /3 escuelas/ }))
    expect(await screen.findByText('Escuela Dos')).toBeInTheDocument()
  })

  it('un cambio suelto muestra el nombre de la escuela, no sólo el departamento', async () => {
    conCambios([cambio('1', '1800001-00')], { '1800001-00': 'Escuela Uno' })
    render(<SituacionClient estadoInicial={estado(SIN_FALLA)} />)
    const item = await screen.findByTestId('situacion-timeline-item')
    expect(await within(item).findByText('Escuela Uno')).toBeInTheDocument()
  })

  it('cambios distintos no se agrupan', async () => {
    conCambios([cambio('1', '1800001-00'), { ...cambio('2', '1800002-00'), descripcion: 'Situación: Sin clases' }])
    render(<SituacionClient estadoInicial={estado(SIN_FALLA)} />)
    expect(await screen.findAllByTestId('situacion-timeline-item')).toHaveLength(2)
  })

  it('el resumen del briefing es texto plano, no una lista con viñeta', () => {
    const { container } = render(<SituacionClient estadoInicial={estado(SIN_FALLA)} />)
    expect(screen.getByText('Línea 1.')).toBeInTheDocument()
    expect(container.querySelector('.situacion-briefing ul')).toBeNull()
  })
})
