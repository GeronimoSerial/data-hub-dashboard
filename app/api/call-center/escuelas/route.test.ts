import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { listarEscuelasSinActualizar, type EscuelaPendiente } from '@/lib/call-center/escuelas-pendientes'
import { registrarLlamada } from '@/lib/call-center/llamadas'
import { getSessionUser } from '@/lib/session'

// Mismo criterio que el test de motivos: staffGuard reimplementado para no
// arrastrar @/lib/auth -> @/lib/db antes de que DATA_DIR quede fijado.
vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
  staffGuard: (user: { banned: boolean; role: string } | null) => {
    if (!user) return { status: 401 as const, error: 'No autenticado' }
    if (user.banned || (user.role !== 'admin' && user.role !== 'editor')) {
      return { status: 403 as const, error: 'No tiene acceso a este recurso' }
    }
    return null
  },
}))

// El cálculo de partes vigentes es pesado (consulta del mapa): se mockea la lista.
vi.mock('@/lib/call-center/escuelas-pendientes', () => ({
  listarEscuelasSinActualizar: vi.fn(),
}))

usarDbTemporal('call-center-escuelas-route-')

const ACTUALIZADA_EN = '2026-11-01T10:00:00.000Z'
const CUE_CONTACTADA = '1111111-01'
const CUE_DESACTUALIZADA = '2222222-01'
const CUE_SIN_LLAMADAS = '3333333-01'

function escuela(cueAnexo: string): EscuelaPendiente {
  return {
    cueAnexo,
    nombre: `Escuela ${cueAnexo}`,
    departamento: 'Departamento',
    localidad: 'Localidad',
    actualizadaEn: ACTUALIZADA_EN,
    horasSinActualizar: 100,
  }
}

function admin() {
  return {
    id: 'admin-1',
    role: 'admin' as const,
    banned: false,
    nivelJurIds: [],
    accesoRecursos: 'todos' as const,
    recursoIds: [],
  }
}
function operadorEstablecimiento() {
  return {
    id: 'operador-1',
    role: 'operador_establecimiento' as const,
    banned: false,
    nivelJurIds: [],
    accesoRecursos: 'todos' as const,
    recursoIds: [],
  }
}

function llamada(cueAnexo: string, creadaEn: string, callerNombre = 'Ana Operadora') {
  return registrarLlamada(
    {
      cueAnexo,
      usuarioId: 'admin-1',
      callerNombre,
      justificacion: 'Director de licencia',
      respuestaDirector: 'Cargará el parte',
    },
    new Date(creadaEn),
  )
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(listarEscuelasSinActualizar).mockReset()
  vi.mocked(listarEscuelasSinActualizar).mockResolvedValue([])
})

async function consultar() {
  const { GET } = await import('./route')
  return GET(new Request('http://localhost/api/call-center/escuelas'))
}

describe('GET /api/call-center/escuelas', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await consultar()
    expect(res.status).toBe(401)
  })

  it('permite a un administrador de Gestión (admin_ge)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...admin(), id: 'ge-1', role: 'admin_ge' as never })
    const res = await consultar()
    expect(res.status).toBe(200)
  })

  it('rechaza a un operador de establecimiento con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(operadorEstablecimiento())
    const res = await consultar()
    expect(res.status).toBe(403)
  })

  it('devuelve escuelas y total con la forma esperada para admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    vi.mocked(listarEscuelasSinActualizar).mockResolvedValue([escuela(CUE_SIN_LLAMADAS)])

    const res = await consultar()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const data = await res.json()
    expect(data).toEqual({
      escuelas: [
        {
          ...escuela(CUE_SIN_LLAMADAS),
          contactada: false,
          ultimaLlamada: null,
        },
      ],
      total: 1,
    })
  })

  it('marca contactada cuando la llamada es posterior a actualizadaEn', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    vi.mocked(listarEscuelasSinActualizar).mockResolvedValue([escuela(CUE_CONTACTADA)])
    await llamada(CUE_CONTACTADA, '2026-11-05T12:00:00.000Z', 'Luis Caller')

    const data = await (await consultar()).json()
    expect(data.escuelas[0].contactada).toBe(true)
    expect(data.escuelas[0].ultimaLlamada).toEqual({
      creadaEn: '2026-11-05T12:00:00.000Z',
      callerNombre: 'Luis Caller',
    })
  })

  it('no marca contactada cuando la única llamada es anterior a actualizadaEn', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    vi.mocked(listarEscuelasSinActualizar).mockResolvedValue([escuela(CUE_DESACTUALIZADA)])
    await llamada(CUE_DESACTUALIZADA, '2026-10-30T12:00:00.000Z')

    const data = await (await consultar()).json()
    expect(data.escuelas[0].contactada).toBe(false)
    expect(data.escuelas[0].ultimaLlamada).not.toBeNull()
  })

  it('no incluye teléfonos en la respuesta', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    vi.mocked(listarEscuelasSinActualizar).mockResolvedValue([escuela(CUE_CONTACTADA)])
    await llamada(CUE_CONTACTADA, '2026-11-05T12:00:00.000Z')

    const data = await (await consultar()).json()
    const claves = Object.keys(data.escuelas[0])
    expect(claves).not.toContain('telefono')
    expect(claves).not.toContain('phone')
  })
})
