import { describe, expect, it, vi } from 'vitest'
import { listarPartesVigentes } from '@/lib/infraestructura/parte-mapa'
import { esParteSinActualizar, listarEscuelasSinActualizar } from './escuelas-pendientes'

vi.mock('@/lib/infraestructura/parte-mapa', () => ({
  listarPartesVigentes: vi.fn(),
}))

const AHORA_MS = Date.parse('2026-11-11T12:00:00.000Z')
const HORA_MS = 3600000

function parteEn(cueAnexo: string, horasAtras: number, extra: Record<string, unknown> = {}) {
  return {
    parteId: `parte-${cueAnexo}`,
    cueAnexo,
    nombre: `Escuela ${cueAnexo}`,
    departamento: 'Capital',
    localidad: 'Centro',
    telefono: '000-secreto',
    actualizadaEn: new Date(AHORA_MS - horasAtras * HORA_MS).toISOString(),
    ...extra,
  }
}

describe('esParteSinActualizar', () => {
  it('no marca como sin actualizar un parte exactamente de 72 h', () => {
    const actualizadaEn = new Date(AHORA_MS - 72 * HORA_MS).toISOString()
    expect(esParteSinActualizar(actualizadaEn, AHORA_MS)).toBe(false)
  })

  it('marca como sin actualizar un parte de 72 h mas 1 ms', () => {
    const actualizadaEn = new Date(AHORA_MS - 72 * HORA_MS - 1).toISOString()
    expect(esParteSinActualizar(actualizadaEn, AHORA_MS)).toBe(true)
  })
})

describe('listarEscuelasSinActualizar', () => {
  it('descarta los partes vigentes (no sin actualizar)', async () => {
    vi.mocked(listarPartesVigentes).mockResolvedValueOnce({
      partes: [parteEn('1001', 10), parteEn('1002', 80)] as never,
      indicadores: {} as never,
    })

    const escuelas = await listarEscuelasSinActualizar(AHORA_MS)

    expect(escuelas.map((e) => e.cueAnexo)).toEqual(['1002'])
  })

  it('ordena por horas sin actualizar de mayor a menor', async () => {
    vi.mocked(listarPartesVigentes).mockResolvedValueOnce({
      partes: [parteEn('1001', 73), parteEn('1002', 100), parteEn('1003', 90)] as never,
      indicadores: {} as never,
    })

    const escuelas = await listarEscuelasSinActualizar(AHORA_MS)

    expect(escuelas.map((e) => e.cueAnexo)).toEqual(['1002', '1003', '1001'])
  })

  it('devuelve solo los campos de la escuela, sin telefono ni datos de alumnos', async () => {
    vi.mocked(listarPartesVigentes).mockResolvedValueOnce({
      partes: [parteEn('1001', 80.5, { alumnosAlcanzados: 300 })] as never,
      indicadores: {} as never,
    })

    const escuelas = await listarEscuelasSinActualizar(AHORA_MS)

    expect(escuelas).toEqual([
      {
        cueAnexo: '1001',
        nombre: 'Escuela 1001',
        departamento: 'Capital',
        localidad: 'Centro',
        actualizadaEn: new Date(AHORA_MS - 80.5 * HORA_MS).toISOString(),
        horasSinActualizar: 80,
      },
    ])
  })
})
