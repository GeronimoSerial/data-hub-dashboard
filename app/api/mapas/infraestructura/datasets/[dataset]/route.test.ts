import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { leerVersion, listarVersiones } from '@/lib/infraestructura/datasets/repositorio'
import { GET } from './route'

vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn() }))
vi.mock('@/lib/infraestructura/datasets/repositorio', () => ({ leerVersion: vi.fn(), listarVersiones: vi.fn() }))
const hash = 'a'.repeat(64)
const parametros = { params: Promise.resolve({ dataset: 'departamentos' }) }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: { id: 'u', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] } })
  vi.mocked(leerVersion).mockResolvedValue({ version: { id: hash }, documento: { type: 'FeatureCollection', features: [] } } as never)
})

describe('datasets del mapa', () => {
  it('aplica autorización antes de leer datos', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 401 })
    expect((await GET(new Request('http://localhost/datasets/departamentos'), parametros)).status).toBe(401)
    expect(leerVersion).not.toHaveBeenCalled()
  })
  it('sirve una versión histórica explícita con su identificador', async () => {
    const respuesta = await GET(new Request(`http://localhost/datasets/departamentos?version=${hash}`), parametros)
    expect(respuesta.status).toBe(200)
    expect(leerVersion).toHaveBeenCalledWith('departamentos', hash)
    expect(respuesta.headers.get('X-Dataset-Version')).toBe(hash)
  })
  it('responde 304 si el cliente ya tiene la versión', async () => {
    const respuesta = await GET(new Request('http://localhost/datasets/departamentos', { headers: { 'If-None-Match': `W/"${hash}"` } }), parametros)
    expect(respuesta.status).toBe(304)
  })
  it('rechaza identificadores inválidos sin consultar la DB', async () => {
    const respuesta = await GET(new Request('http://localhost/datasets/departamentos?version=invalida'), parametros)
    expect(respuesta.status).toBe(400)
    expect(leerVersion).not.toHaveBeenCalled()
  })
  it('expone el historial sin caché compartido', async () => {
    vi.mocked(listarVersiones).mockResolvedValue([])
    const respuesta = await GET(new Request('http://localhost/datasets/departamentos?historial=1'), parametros)
    expect(await respuesta.json()).toEqual([])
    expect(respuesta.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
