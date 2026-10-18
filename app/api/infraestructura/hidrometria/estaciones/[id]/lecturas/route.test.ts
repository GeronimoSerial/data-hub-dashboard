import { count } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { categorias, hidroLectura, infraPeriodo, niveles, recursos, tipos } from '@/lib/db/schema'
import type { SessionUser } from '@/lib/acl'
import { getSessionUser } from '@/lib/session'
import { USER } from '@/lib/infraestructura/riesgo/__fixtures__/motor-api'
import { estadoReferencias } from '@/lib/infraestructura/datasets/memoria'
import { guardarVersion } from '@/lib/infraestructura/datasets/repositorio'
import { obtenerEstacionesPrefectura } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

vi.mock('@/lib/db/seed', () => ({
  ensureSeeded: vi.fn(),
}))

usarDbTemporal('hidro-estacion-lecturas-route-', { seed: false })

const ESTACION = 'pna-corrientes'
const RECURSO_MAPA_ID = 'mapa-infraestructura'

function mockUsuario(user: SessionUser | null) {
  vi.mocked(getSessionUser).mockResolvedValue(user)
}

async function registrarRecursoMapaEnDbEfimera(estado: 'publicado' | 'borrador' = 'publicado') {
  const db = getDb()
  await db
    .insert(niveles)
    .values({ id: 'general', nombre: 'General', orden: 1 })
    .onConflictDoNothing()
  await db
    .insert(tipos)
    .values({ id: 'tablero', nombre: 'Tablero', aplicaA: ['general'] })
    .onConflictDoNothing()
  await db
    .insert(categorias)
    .values({ id: 'infraestructura', nombre: 'Infraestructura', color: '#881337' })
    .onConflictDoNothing()
  await db
    .insert(recursos)
    .values({
      id: RECURSO_MAPA_ID,
      titulo: 'Mapa de Infraestructura',
      descripcion: 'Mapa territorial',
      formato: 'INTERACTIVO',
      nivelId: 'general',
      tipoId: 'tablero',
      categoriaId: 'infraestructura',
      area: 'Infraestructura',
      actualizado: '2026-10-16',
      estado,
      ruta: '/mapas/infraestructura',
    })
}

beforeAll(async () => {
  await migrarDb()
})

beforeEach(async () => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(ensureSeeded).mockReset()
  const db = getDb()
  await db.delete(hidroLectura)
  await db.delete(recursos)
})

async function llamar(id: string, query: string) {
  const { GET } = await import('./route')
  return GET(
    new Request(`http://localhost/api/infraestructura/hidrometria/estaciones/${id}/lecturas${query}`),
    { params: Promise.resolve({ id }) },
  )
}

function filaLectura(
  id: string,
  estacionId: string,
  medidaEn: string,
  overrides: Partial<typeof hidroLectura.$inferInsert> = {},
) {
  return {
    id,
    estacionId,
    fuente: 'prefectura',
    lecturaM: 3.42,
    variacionM: 0.03,
    periodoHoras: 3,
    medidaEn,
    estadoPublicado: 'CRECE',
    lecturaAnteriorM: 3.39,
    medidaAnteriorEn: '2026-10-13T15:00:00.000Z',
    alertaM: 6.5,
    evacuacionM: 7.0,
    inconsistente: false,
    motivosInconsistencia: [],
    hashOriginal: id.padEnd(64, 'a').slice(0, 64),
    catalogoVersion: 'estaciones-prefectura-v2',
    capturadaEn: '2026-10-13T20:46:27.640Z',
    ...overrides,
  }
}

describe('GET /api/infraestructura/hidrometria/estaciones/[id]/lecturas', () => {
  it('carga el catálogo publicado en una entrada directa sin referencias en memoria', async () => {
    mockUsuario(USER)
    await registrarRecursoMapaEnDbEfimera()
    const catalogoVersion = await guardarVersion({
      datasetId: 'estaciones-prefectura',
      nombre: 'Estaciones Prefectura',
      revision: 'entrada-directa',
      fuente: 'fixture',
      formato: 'array',
      clave: 'estacionId',
      datos: obtenerEstacionesPrefectura().map((estacion) => ({ ...estacion })),
    })
    const estado = estadoReferencias()
    const referenciasAnteriores = estado.referencias
    const cargadoEnAnterior = estado.cargadoEn
    estado.referencias = new Map()
    estado.cargadoEn = 0
    try {
      const res = await llamar(ESTACION, '?desde=2026-10-13T00:00:00Z&hasta=2026-10-16T00:00:00Z')
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({
        estacion: { estacionId: ESTACION, catalogoVersion },
        lecturas: [],
      })
    } finally {
      estado.referencias = referenciasAnteriores
      estado.cargadoEn = cargadoEnAnterior
    }
  })

  it('rechaza sin sesión con 401 sin invocar ensureSeeded ni escribir en la base', async () => {
    mockUsuario(null)
    const res = await llamar(
      ESTACION,
      '?desde=2026-10-13T00:00:00.000Z&hasta=2026-10-16T23:59:59.000Z',
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.lecturas).toBeUndefined()
    expect(body.error).toBe('No autenticado')
    expect(ensureSeeded).not.toHaveBeenCalled()
  })

  it('rechaza con 403 cuando el usuario no tiene permiso al recurso en la BD efímera', async () => {
    await registrarRecursoMapaEnDbEfimera('publicado')
    mockUsuario({
      ...USER,
      role: 'consulta',
      accesoRecursos: 'seleccionados',
      recursoIds: [],
    })

    const res = await llamar(
      ESTACION,
      '?desde=2026-10-13T00:00:00.000Z&hasta=2026-10-16T23:59:59.000Z',
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.lecturas).toBeUndefined()
    expect(body.error).toBe('No tiene acceso a este recurso')
    expect(ensureSeeded).not.toHaveBeenCalled()
  })

  it('es estrictamente de solo lectura: sin recurso sembrado responde 403 en vez de ejecutar ensureSeeded', async () => {
    mockUsuario(USER)
    const db = getDb()

    const [recursosAntes] = await db.select({ n: count() }).from(recursos)
    const [periodosAntes] = await db.select({ n: count() }).from(infraPeriodo)
    const [lecturasAntes] = await db.select({ n: count() }).from(hidroLectura)

    expect(Number(recursosAntes?.n ?? 0)).toBe(0)
    expect(Number(periodosAntes?.n ?? 0)).toBe(0)

    const resSinRecurso = await llamar(
      ESTACION,
      '?desde=2026-10-13T00:00:00.000Z&hasta=2026-10-16T23:59:59.000Z',
    )
    expect(resSinRecurso.status).toBe(403)
    expect(ensureSeeded).not.toHaveBeenCalled()

    await registrarRecursoMapaEnDbEfimera('publicado')
    const resConRecurso = await llamar(
      ESTACION,
      '?desde=2026-10-13T00:00:00.000Z&hasta=2026-10-16T23:59:59.000Z',
    )
    expect(resConRecurso.status).toBe(200)
    expect(ensureSeeded).not.toHaveBeenCalled()

    const [recursosDespues] = await db.select({ n: count() }).from(recursos)
    const [periodosDespues] = await db.select({ n: count() }).from(infraPeriodo)
    const [lecturasDespues] = await db.select({ n: count() }).from(hidroLectura)

    expect(Number(recursosDespues?.n ?? 0)).toBe(1)
    expect(Number(periodosDespues?.n ?? 0)).toBe(0)
    expect(Number(lecturasDespues?.n ?? 0)).toBe(Number(lecturasAntes?.n ?? 0))
  })

  it('responde 400 cuando el id de estación tiene formato inválido', async () => {
    await registrarRecursoMapaEnDbEfimera('publicado')
    mockUsuario(USER)
    const res = await llamar(
      'ESTACION_INVALIDA!',
      '?desde=2026-10-13T00:00:00.000Z&hasta=2026-10-16T23:59:59.000Z',
    )
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.codigo).toBe('estacion_id_invalido')
  })

  it('responde 404 cuando la estación no pertenece al catálogo PNA', async () => {
    await registrarRecursoMapaEnDbEfimera('publicado')
    mockUsuario(USER)
    const res = await llamar(
      'pna-fuera-de-catalogo',
      '?desde=2026-10-13T00:00:00.000Z&hasta=2026-10-16T23:59:59.000Z',
    )
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.codigo).toBe('estacion_no_encontrada')
  })

  it.each([
    ['sin parámetros', ''],
    ['sin hasta', '?desde=2026-10-13T00:00:00.000Z'],
    ['sin desde', '?hasta=2026-10-16T00:00:00.000Z'],
    ['fecha no ISO', '?desde=13-10-2026&hasta=16-10-2026'],
    ['desde mayor que hasta', '?desde=2026-10-16T12:00:00.000Z&hasta=2026-10-13T12:00:00.000Z'],
  ])('responde 400 cuando el rango desde/hasta es inválido: %s', async (_caso, query) => {
    await registrarRecursoMapaEnDbEfimera('publicado')
    mockUsuario(USER)
    const res = await llamar(ESTACION, query)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.codigo).toBe('rango_invalido')
  })

  it('responde 400 cuando el rango supera los 90 días permitidos', async () => {
    await registrarRecursoMapaEnDbEfimera('publicado')
    mockUsuario(USER)
    const res = await llamar(
      ESTACION,
      '?desde=2026-06-01T00:00:00.000Z&hasta=2026-10-16T00:00:00.000Z',
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.codigo).toBe('rango_excesivo')
  })

  it('responde 400 cuando limite es inválido o excede el máximo', async () => {
    await registrarRecursoMapaEnDbEfimera('publicado')
    mockUsuario(USER)
    const res = await llamar(
      ESTACION,
      '?desde=2026-10-13T00:00:00.000Z&hasta=2026-10-16T00:00:00.000Z&limite=99999',
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.codigo).toBe('limite_invalido')
  })

  it('responde 200 con lecturas vacías y cobertura explícita cuando no hay observaciones en el rango', async () => {
    await registrarRecursoMapaEnDbEfimera('publicado')
    mockUsuario(USER)
    const res = await llamar(
      ESTACION,
      '?desde=2026-10-13T00:00:00.000Z&hasta=2026-10-16T00:00:00.000Z',
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.estacion).toMatchObject({
      estacionId: ESTACION,
      nombre: 'CORRIENTES',
      rio: 'parana',
      rol: 'corrientes',
      coordenadasVerificadas: false,
    })
    expect(body.lecturas).toEqual([])
    expect(body.cobertura).toMatchObject({
      sinLecturas: true,
      totalEnVentana: 0,
      puntosDevueltos: 0,
      truncada: false,
      huecos: [],
      disponibleEstacion: {
        totalLecturas: 0,
        primeraMedidaEn: null,
        ultimaMedidaEn: null,
        horasDisponibles: 0,
      },
    })
  })

  it('devuelve serie ordenada, metadatos de cobertura/calidad/fuente, huecos y truncamiento explícito', async () => {
    await registrarRecursoMapaEnDbEfimera('publicado')
    await getDb()
      .insert(hidroLectura)
      .values([
        filaLectura('l-3', ESTACION, '2026-10-15T18:00:00.000Z', {
          lecturaM: 6.6,
          variacionM: -0.05,
          estadoPublicado: 'BAJA',
          alertaM: 6.5,
          evacuacionM: 7.0,
        }),
        filaLectura('l-1', ESTACION, '2026-10-13T18:00:00.000Z', {
          lecturaM: 6.2,
          variacionM: 0.08,
          estadoPublicado: 'CRECE',
          alertaM: 6.5,
          evacuacionM: 7.0,
        }),
        filaLectura('l-2', ESTACION, '2026-10-14T18:00:00.000Z', {
          lecturaM: 0,
          variacionM: 0.1,
          estadoPublicado: 'CRECE',
          inconsistente: true,
          motivosInconsistencia: ['lectura_cero_con_crece'],
          alertaM: 6.5,
          evacuacionM: 7.0,
        }),
        filaLectura('l-otra', 'pna-goya', '2026-10-14T18:00:00.000Z', {
          lecturaM: 4.0,
        }),
      ])

    mockUsuario(USER)
    const res = await llamar(
      ESTACION,
      '?desde=2026-10-13T00:00:00.000Z&hasta=2026-10-16T00:00:00.000Z',
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.lecturas).toHaveLength(3)
    expect(body.lecturas.map((l: { medidaEn: string }) => l.medidaEn)).toEqual([
      '2026-10-13T18:00:00.000Z',
      '2026-10-14T18:00:00.000Z',
      '2026-10-15T18:00:00.000Z',
    ])

    expect(body.lecturas[1]).toMatchObject({
      estadoNivel: 'sin_dato',
      calidad: 'inconsistente',
      huecoPrevio: true,
      brechaDesdeAnteriorHoras: 24,
      variacionPublicada: {
        variacionM: 0.1,
        tendencia: 'sin_dato',
        confiable: false,
      },
    })

    expect(body.lecturas[2]).toMatchObject({
      estadoNivel: 'alerta',
      calidad: 'valida',
      huecoPrevio: true,
      brechaDesdeAnteriorHoras: 24,
      variacionPublicada: {
        variacionM: -0.05,
        tendencia: 'baja',
        confiable: true,
      },
    })

    expect(body.umbrales).toEqual({
      alertaM: 6.5,
      evacuacionM: 7.0,
      referenciaMedidaEn: '2026-10-15T18:00:00.000Z',
      variaronEnVentana: false,
    })

    expect(body.cobertura).toMatchObject({
      sinLecturas: false,
      totalEnVentana: 3,
      puntosDevueltos: 3,
      truncada: false,
      horasCubiertas: 48,
      brechaMinHoras: 24,
      brechaMaxHoras: 24,
    })
    expect(body.cobertura.huecos).toHaveLength(2)
    expect(body.fuente).toMatchObject({
      codigo: 'prefectura',
      tabla: 'hidro_lectura',
      unidadAltura: 'm',
    })
  })
})
