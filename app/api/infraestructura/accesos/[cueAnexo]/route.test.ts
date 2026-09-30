import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type { SessionUser } from '@/lib/acl'
import { getSessionUser } from '@/lib/session'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR (mismo patrón que situacion/export).
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

const CUE_CON_DATOS = '1801605-04'
const CUE_SIN_AISLAMIENTO = '1801605-05'
const CUE_INEXISTENTE = '9999999-99'

function admin(): SessionUser {
  return { id: 'admin-1', role: 'admin', banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

function consulta(): SessionUser {
  return { id: 'user-1', role: 'consulta', banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

usarDbTemporal('accesos-route-')

beforeAll(async () => {
  const { getDb } = await import('@/lib/db')
  const { infraGeoProfile, infraAislamientoOsm } = await import('@/lib/db/schema')

  await getDb().insert(infraGeoProfile).values([
    {
      cueAnexo: CUE_CON_DATOS,
      lat: -31.7,
      lon: -60.5,
      geoCalidad: 'alta',
      departamento: 'Parana',
      geometryRef: '-31.7_-60.5',
      motivoExclusion: null,
      perfilVersion: 'v1',
      calculadoEn: '2026-01-01T00:00:00Z',
    },
    {
      cueAnexo: CUE_SIN_AISLAMIENTO,
      lat: -31.8,
      lon: -60.6,
      geoCalidad: 'alta',
      departamento: 'Parana',
      geometryRef: '-31.8_-60.6',
      motivoExclusion: null,
      perfilVersion: 'v1',
      calculadoEn: '2026-01-01T00:00:00Z',
    },
  ])

  // `tieneAlternativaSinCruce: null` = DESCONOCIDO: la respuesta debe devolver
  // null tal cual, nunca traducirlo a true ("segura").
  await getDb().insert(infraAislamientoOsm).values({
    cueAnexo: CUE_CON_DATOS,
    versionJob: '1',
    distanciaViaPavimentadaM: 1200,
    distanciaCabeceraDepartamentalM: 34000,
    tramosSinPavimentarCount: 3,
    crucesAguaCount: 5,
    crucesAguaConPuenteCount: 1,
    crucesAguaConVadoCount: 0,
    tieneAlternativaSinCruce: null,
    indiceAislamiento: 2,
    motivoSinDatos: null,
    snapDistanciaM: 85,
    fechaExtractoOsm: '2026-01-01',
    licencia: 'ODbL-1.0',
    importadoEn: '2026-01-01T00:00:00Z',
  })
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function ctx(cueAnexo: string) {
  return { params: Promise.resolve({ cueAnexo }) }
}

function req(cueAnexo = CUE_CON_DATOS) {
  return new Request(`http://localhost/api/infraestructura/accesos/${cueAnexo}`)
}

// Regresión explícita: este endpoint NUNCA debe filtrar datos nominales de
// alumnos/personas. Si alguien agrega un campo así, este test falla.
const CLAVES_PROHIBIDAS = /alumno|matr[ií]cula|nombre|apellido|persona|docente|seccion|contacto/i

function claves(obj: unknown, acc: string[] = []): string[] {
  if (Array.isArray(obj)) {
    for (const item of obj) claves(item, acc)
  } else if (obj !== null && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      acc.push(k)
      claves(v, acc)
    }
  }
  return acc
}

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

describe('GET /api/infraestructura/accesos/[cueAnexo]', () => {
  it.each([
    ['rechaza sin sesión con 401 (y no-store)', null, 401, 'No autenticado'],
    ['rechaza con sesión no-staff con 403 (y no-store)', consulta(), 403, 'No tiene acceso a este recurso'],
  ] as const)('%s', async (_titulo, user, status, error) => {
    vi.mocked(getSessionUser).mockResolvedValue(user)
    const res = await GET(req(), ctx(CUE_CON_DATOS))
    expect(res.status).toBe(status)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.error).toBe(error)
  })

  it('rechaza cueAnexo inválido (vacío) con 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    const res = await GET(req(''), ctx(''))
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('con staff y datos presentes devuelve el shape completo y null se preserva', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    const res = await GET(req(), ctx(CUE_CON_DATOS))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body).toEqual({
      cueAnexo: CUE_CON_DATOS,
      disponible: true,
      indice: 2,
      cruces: { total: 5, conPuente: 1, conVado: 0 },
      rutaAlternativaSinCruce: null,
      fechaExtractoOsm: '2026-01-01',
      licencia: 'ODbL-1.0',
      atribucion: '© OpenStreetMap contributors',
    })
    // Explícito: null NUNCA se convierte a true ("segura").
    expect(body.rutaAlternativaSinCruce).toBeNull()
    expect(body.rutaAlternativaSinCruce).not.toBe(true)
  })

  it('sin fila de aislamiento responde 200 con disponible false (nunca 404)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    const res = await GET(req(CUE_SIN_AISLAMIENTO), ctx(CUE_SIN_AISLAMIENTO))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body).toEqual({
      cueAnexo: CUE_SIN_AISLAMIENTO,
      disponible: false,
      motivo: 'sin_cobertura_osm',
    })
  })

  it('con cueAnexo que no existe en el padrón territorial devuelve 404', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    const res = await GET(req(CUE_INEXISTENTE), ctx(CUE_INEXISTENTE))
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.error).toBe('Escuela no encontrada')
  })

  it('nunca incluye campos nominales de alumnos/matrícula/personas', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    for (const cue of [CUE_CON_DATOS, CUE_SIN_AISLAMIENTO]) {
      const res = await GET(req(cue), ctx(cue))
      const body = await res.json()
      const prohibidas = claves(body).filter((k) => CLAVES_PROHIBIDAS.test(k))
      expect(prohibidas).toEqual([])
      expect(JSON.stringify(body)).not.toMatch(CLAVES_PROHIBIDAS)
    }
  })
})
