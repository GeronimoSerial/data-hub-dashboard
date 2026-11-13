// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditoriaVisor, construirQueryAuditoria, fechaLocalAIso } from './auditoria-visor'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { __reiniciarIdiomaClienteParaPruebas } from '@/lib/i18n/idioma-cliente'
import type { Idioma } from '@/lib/i18n'
import { RegionProvider } from '@/lib/infraestructura/region/region-provider'
import { __reiniciarRegionPublicaClienteParaPruebas } from '@/lib/infraestructura/region/publica'
import { regionPublica } from '@/lib/infraestructura/region/esquema'
import { cargarRegion } from '@/lib/infraestructura/region/registro'

const BUENOS_AIRES = 'America/Argentina/Buenos_Aires'
const MANAUS = 'America/Manaus'
const ENDPOINT = '/api/infraestructura/auditoria'

function evento(sobrescribir: Record<string, unknown> = {}) {
  return {
    id: '0190b8c2-7a1e-7000-8000-000000000001',
    requestId: 'req-1',
    ocurridoEn: '2026-11-13T13:05:00.000Z',
    actorTipo: 'usuario',
    actorId: 'user-1',
    actorRol: 'admin',
    viaAcceso: 'sesion',
    accion: 'parte.guardar',
    metodo: 'POST',
    rutaPlantilla: '/api/infraestructura/parte',
    objetoTipo: 'parte',
    objetoId: 'parte-9',
    cueAnexo: '1234',
    resultado: 'exito',
    httpStatus: 200,
    duracionMs: 12,
    metadatos: { motivo: 'reenvio' },
    ...sobrescribir,
  }
}

function respuesta(cuerpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as Response
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

function urlLlamada(indice: number): URL {
  return new URL(String(fetchMock.mock.calls[indice]![0]), 'http://localhost')
}

function renderVisor({ idioma = 'es', region = 'corrientes' }: { idioma?: Idioma; region?: 'corrientes' | 'manaos' } = {}) {
  return render(
    <RegionProvider region={regionPublica(cargarRegion(region))}>
      <IdiomaProvider idioma={idioma}>
        <AuditoriaVisor />
      </IdiomaProvider>
    </RegionProvider>,
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  __reiniciarIdiomaClienteParaPruebas()
  __reiniciarRegionPublicaClienteParaPruebas()
})

describe('fechaLocalAIso', () => {
  it('convierte la hora de pared de Corrientes con su desplazamiento real', () => {
    expect(fechaLocalAIso('2026-11-13T10:00', BUENOS_AIRES)).toBe('2026-11-13T13:00:00.000Z')
  })

  it('convierte la hora de pared de Manaos con -04:00, no con el de Corrientes', () => {
    expect(fechaLocalAIso('2026-11-13T10:00', MANAUS)).toBe('2026-11-13T14:00:00.000Z')
  })

  it('rechaza valores que no son una fecha local completa', () => {
    expect(fechaLocalAIso('13/11/2026', BUENOS_AIRES)).toBeNull()
    expect(fechaLocalAIso('', BUENOS_AIRES)).toBeNull()
  })
})

describe('construirQueryAuditoria', () => {
  it('omite los filtros vacíos, recorta el texto y agrega el cursor', () => {
    const query = construirQueryAuditoria(
      { actorId: ' user_1 ', accion: '', cueAnexo: '', objetoId: '', resultado: 'rechazado', desde: '2026-11-13T10:00', hasta: '' },
      BUENOS_AIRES,
      'abc',
    )
    const params = new URLSearchParams(query)
    expect(params.get('limite')).toBe('50')
    expect(params.get('actorId')).toBe('user_1')
    expect(params.get('resultado')).toBe('rechazado')
    expect(params.get('desde')).toBe('2026-11-13T13:00:00.000Z')
    expect(params.has('accion')).toBe(false)
    expect(params.has('hasta')).toBe(false)
    expect(params.get('cursor')).toBe('abc')
  })
})

describe('AuditoriaVisor (es, Corrientes)', () => {
  it('carga al abrirse con el límite de 50 y muestra el estado de carga', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    renderVisor()
    expect(screen.getByRole('status')).toHaveTextContent('Cargando historial…')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0]![0]).toBe(`${ENDPOINT}?limite=50`)
  })

  it('muestra las operaciones con etiquetas traducidas y la hora de la región', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [evento()], nextCursor: null }))
    renderVisor()
    expect(await screen.findByText('Guardado de parte')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Éxito')).toBeInTheDocument()
    expect(screen.getByText('Usuario: user-1 (admin)')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Resultado' })).toBeInTheDocument()
    expect(document.querySelector('time')).toHaveAttribute('datetime', '2026-11-13T13:05:00.000Z')
  })

  it('muestra el código crudo cuando la acción no está en el diccionario', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [evento({ accion: 'job.futuro_nuevo' })], nextCursor: null }))
    renderVisor()
    expect(await screen.findByText('job.futuro_nuevo')).toBeInTheDocument()
  })

  it('muestra el estado vacío cuando la página no trae operaciones', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [], nextCursor: null }))
    renderVisor()
    expect(await screen.findByText('No hay operaciones para estos filtros.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('muestra error con reintento y vuelve a pedir la página al reintentar', async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta({ error: 'boom' }, 500))
      .mockResolvedValueOnce(respuesta({ items: [evento()], nextCursor: null }))
    renderVisor()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el historial.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Guardado de parte')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('explica el 403 sin ofrecer reintento', async () => {
    fetchMock.mockResolvedValue(respuesta({ error: 'forbidden' }, 403))
    renderVisor()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para consultar la auditoría.')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('explica el 400 como filtros a revisar', async () => {
    fetchMock.mockResolvedValue(respuesta({ error: 'bad' }, 400))
    renderVisor()
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisá los filtros')
  })

  it('aplica los filtros al consultar y los manda como query', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [], nextCursor: null }))
    renderVisor()
    await screen.findByText('No hay operaciones para estos filtros.')
    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'parte.guardar' } })
    fireEvent.change(screen.getByLabelText('Usuario (ID)'), { target: { value: 'user_1' } })
    const usuario = userEvent.setup()
    await usuario.click(screen.getByRole('combobox', { name: 'Resultado' }))
    await usuario.click(await screen.findByRole('option', { name: 'Rechazado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const params = urlLlamada(1).searchParams
    expect(params.get('accion')).toBe('parte.guardar')
    expect(params.get('actorId')).toBe('user_1')
    expect(params.get('resultado')).toBe('rechazado')
    expect(params.get('limite')).toBe('50')
    expect(params.has('cursor')).toBe(false)
  })

  it('pagina hacia adelante con el cursor y vuelve atrás con la pila de cursores', async () => {
    const pagina = (accion: string, id: string, nextCursor: string | null) => respuesta({ items: [evento({ accion, id })], nextCursor })
    fetchMock
      .mockResolvedValueOnce(pagina('parte.guardar', '0190b8c2-7a1e-7000-8000-000000000001', 'cursor-2'))
      .mockResolvedValueOnce(pagina('enlace.crear', '0190b8c2-7a1e-7000-8000-000000000002', 'cursor-3'))
      .mockResolvedValueOnce(pagina('usuario.crear', '0190b8c2-7a1e-7000-8000-000000000003', null))
      .mockResolvedValueOnce(pagina('enlace.crear', '0190b8c2-7a1e-7000-8000-000000000002', 'cursor-3'))
      .mockResolvedValueOnce(pagina('parte.guardar', '0190b8c2-7a1e-7000-8000-000000000001', 'cursor-2'))
    renderVisor()
    await screen.findByText('Guardado de parte')
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByText('Enlace creado')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Usuario creado')).toBeInTheDocument()
    expect(urlLlamada(2).searchParams.get('cursor')).toBe('cursor-3')
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    await screen.findByText('Enlace creado')
    expect(urlLlamada(3).searchParams.get('cursor')).toBe('cursor-2')
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    await screen.findByText('Guardado de parte')
    expect(urlLlamada(4).searchParams.has('cursor')).toBe(false)
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
  })

  it('muestra el texto de sin datos cuando el evento no trae metadatos', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [evento({ metadatos: null })], nextCursor: null }))
    const { container } = renderVisor()
    await screen.findByText('Guardado de parte')
    expect(container.querySelector('details')!.textContent).toContain('Sin datos adicionales')
  })

  it('no muestra las llaves de metadatos hasta expandir el detalle y acota los valores', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [evento({ metadatos: { motivo: 'reenvio', nota: 'x'.repeat(500) } })], nextCursor: null }))
    const { container } = renderVisor()
    await screen.findByText('Guardado de parte')
    const detalle = container.querySelector('details')!
    expect(detalle).not.toHaveAttribute('open')
    expect(within(detalle).getByText('Ver detalles')).toBeInTheDocument()
    const texto = detalle.textContent ?? ''
    expect(texto).toContain('motivo')
    expect(texto).toContain('reenvio')
    expect(texto).not.toContain('x'.repeat(200))
  })

  it('convierte las fechas de los filtros con el huso de la región', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [], nextCursor: null }))
    renderVisor({ region: 'manaos' })
    await screen.findByText('No hay operaciones para estos filtros.')
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-13T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(urlLlamada(1).searchParams.get('desde')).toBe('2026-11-13T14:00:00.000Z')
  })
})

describe('AuditoriaVisor (pt, Manaos)', () => {
  it('muestra todo el visor en portugués con la región de Manaos', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    renderVisor({ idioma: 'pt', region: 'manaos' })
    expect(screen.getByRole('status')).toHaveTextContent('Carregando histórico…')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Auditoria de infraestrutura')
  })

  it('traduce acciones, resultados y columnas al portugués', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [evento({ resultado: 'exito' })], nextCursor: null }))
    renderVisor({ idioma: 'pt', region: 'manaos' })
    expect(await screen.findByText('Gravação de relatório')).toBeInTheDocument()
    expect(screen.getByText('Sucesso')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Desfecho' })).toBeInTheDocument()
    expect(screen.queryByText('Guardado de parte')).not.toBeInTheDocument()
  })
})

describe('columna Quién, filtro Resultado y columna Fecha', () => {
  it('muestra el nombre del usuario como texto principal y su id como texto secundario', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [evento({ actorNombre: 'Ana Pérez', actorCorreo: 'ana@ejemplo.test' })], nextCursor: null }))
    renderVisor()
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez')).not.toHaveClass('ui-hint')
    expect(screen.getByText('Usuario: user-1 (admin)')).toHaveClass('ui-hint')
    expect(screen.queryByText('ana@ejemplo.test')).not.toBeInTheDocument()
  })

  it('usa el correo como texto principal cuando el usuario no tiene nombre', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [evento({ actorNombre: null, actorCorreo: 'ana@ejemplo.test' })], nextCursor: null }))
    renderVisor()
    expect(await screen.findByText('ana@ejemplo.test')).toBeInTheDocument()
    expect(screen.getByText('Usuario: user-1 (admin)')).toHaveClass('ui-hint')
  })

  it('deja el texto de siempre cuando el actor no es un usuario registrado', async () => {
    fetchMock.mockResolvedValue(respuesta({
      items: [evento({ actorTipo: 'enlace', actorId: 'enlace-7', actorRol: null, actorNombre: null, actorCorreo: null })],
      nextCursor: null,
    }))
    renderVisor()
    expect(await screen.findByText('Enlace: enlace-7')).toBeInTheDocument()
  })

  it('no renderiza ningún select nativo: el filtro Resultado es el componente personalizado', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [evento()], nextCursor: null }))
    const { container } = renderVisor()
    expect(await screen.findByText('Guardado de parte')).toBeInTheDocument()
    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Resultado' })).toBeInTheDocument()
  })

  it('impide que la fecha se parta en dos líneas en escritorio', async () => {
    fetchMock.mockResolvedValue(respuesta({ items: [evento()], nextCursor: null }))
    const { container } = renderVisor()
    expect(await screen.findByText('Guardado de parte')).toBeInTheDocument()
    const celdaFecha = container.querySelector('td[data-label="Fecha"]')
    expect(celdaFecha).toHaveClass('auditoria-fecha')
    expect(celdaFecha?.querySelector('time')).not.toBeNull()
  })
})
