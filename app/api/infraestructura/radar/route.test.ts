import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import {
  hazardClimatology,
  hazardEnsembleProb,
  hazardForecast,
  infraGeoProfile,
  infraRiskFactor,
  infraRiskRun,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerNivelesPeligro } from '@/lib/infraestructura/riesgo/peligro/nivel'
import type * as NivelPeligroModule from '@/lib/infraestructura/riesgo/peligro/nivel'
import {
  mockAcceso,
  PUBLICADO_EN,
  RUN_VIGENTE,
  sembrarMotorBase,
  sembrarPeligroRadar,
  USER,
} from '@/lib/infraestructura/riesgo/__fixtures__/motor-api'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

// Se envuelve el obtenerNivelesPeligro real (no se reemplaza): el test quiere
// el cómputo de peligro contra la DB de test y, además, espiar el `ahora`
// as-of con el que se lo invoca.
vi.mock('@/lib/infraestructura/riesgo/peligro/nivel', async (importOriginal) => {
  const actual = await importOriginal<typeof NivelPeligroModule>()
  return {
    ...actual,
    obtenerNivelesPeligro: vi.fn(actual.obtenerNivelesPeligro),
  }
})

// cueAnexo → departamento y celda (geometryRef) con la que se agrega el peligro.
const GEO = [
  { cueAnexo: '1000000-01', departamento: 'ALFA', geometryRef: 'celda-a' },
  { cueAnexo: '1000000-02', departamento: 'ALFA', geometryRef: 'celda-a' },
  { cueAnexo: '1000000-03', departamento: 'BETA', geometryRef: 'celda-b' },
  { cueAnexo: '1000000-04', departamento: 'ALFA', geometryRef: 'celda-c' },
  { cueAnexo: '1000000-05', departamento: 'ALFA', geometryRef: 'celda-a' },
]

usarDbTemporal('radar-route-', { seed: false })

beforeAll(async () => {
  const seed = await import('@/lib/db/seed')
  await seed.ensureSeeded()
  PERIODO = seed.PERIODO_ENOS_2026_2027_ID
  GET = (await import('./route')).GET
})

let PERIODO = ''
let GET: typeof Ruta.GET

async function limpiarMotor() {
  const db = getDb()
  await db.delete(infraRiskFactor)
  await db.delete(infraRiskSnapshot)
  await db.delete(infraRiskRun)
  await db.delete(infraGeoProfile)
  await db.delete(hazardEnsembleProb)
  await db.delete(hazardForecast)
  await db.delete(hazardClimatology)
}

async function sembrarFixture() {
  const db = getDb()
  await limpiarMotor()

  await db.insert(infraGeoProfile).values(
    GEO.map((g) => ({
      cueAnexo: g.cueAnexo,
      lat: -31.7,
      lon: -60.5,
      geoCalidad: 'alta',
      departamento: g.departamento,
      geometryRef: g.geometryRef,
      motivoExclusion: null,
      perfilVersion: 'v1',
      calculadoEn: '2026-01-01T00:00:00Z',
    })),
  )

  // Peligro: celda-a tiene ensemble en 24h (rojo) y 72h (amarillo). En 240h no
  // hay determinístico → sin_dato. celda-b y celda-c no tienen dato alguno.
  await sembrarMotorBase(PERIODO)
  await sembrarPeligroRadar()
}

// Pronóstico determinístico para una celda SIN climatología: dispara el camino
// de umbral provisorio. 130 mm a 24 h supera el rojo provisorio (120 mm).
async function sembrarPronosticoSinClimatologia() {
  await getDb()
    .insert(hazardForecast)
    .values({
      id: 'f-prov-24',
      provider: 'open-meteo',
      variable: 'precipitacion',
      geometryRef: 'celda-b',
      corridaEn: '2026-01-01T00:00:00Z',
      validoEn: '2026-01-02T00:00:00Z',
      horizonteHoras: 24,
      valor: 130,
      unidad: 'mm',
      pasoHoras: 6,
      rawRef: null,
      ingeridoEn: '2026-01-01T00:10:00Z',
    })
}

// Climatología completa (p90/p95/p99) para la misma celda del pronóstico: con
// esto el nivel sale por percentiles, no por umbral provisorio.
async function sembrarClimatologiaCompleta() {
  await getDb()
    .insert(hazardClimatology)
    .values(
      [
        { percentil: 'p90', valor: 40 },
        { percentil: 'p95', valor: 60 },
        { percentil: 'p99', valor: 90 },
      ].map((fila) => ({
        id: `c-celda-b-${fila.percentil}`,
        geometryRef: 'celda-b',
        variable: 'precipitacion_diaria',
        percentil: fila.percentil,
        muestra: 'todos_los_dias',
        valor: fila.valor,
        unidad: 'mm',
        periodoDesde: '1991-01-01',
        periodoHasta: '2020-12-31',
        version: 'v1',
        calculadoEn: '2026-01-01T00:00:00Z',
      })),
    )
}

beforeEach(async () => {
  vi.mocked(verificarAccesoLectura).mockReset()
  vi.mocked(obtenerNivelesPeligro).mockClear()
  await sembrarFixture()
})

function req(qs = '') {
  return new Request(`http://localhost/api/infraestructura/radar${qs}`)
}

const ITEM_KEYS = [
  'calculadoEn',
  'confianza',
  'confianzaAcceso',
  'cueAnexo',
  'departamento',
  'evidenciaValida',
  'exposicionMatricula',
  'exposicionSecciones',
  'horizonteHoras',
  'nivelAmenaza',
  'nivelRiesgo',
  'nivelRiesgoAcceso',
  'scoreAmenaza',
  'scoreRiesgo',
  'scoreRiesgoAcceso',
  'scoreVulnerabilidad',
  'snapshotId',
  'validoHasta',
].sort()

const DEPARTAMENTOS_ESPERADOS = [
  { departamento: 'ALFA', peorNivel: 'rojo', horizonteHoras: 24, celdas: 2 },
  { departamento: 'ALFA', peorNivel: 'amarillo', horizonteHoras: 72, celdas: 2 },
  { departamento: 'ALFA', peorNivel: 'sin_dato', horizonteHoras: 240, celdas: 2 },
  { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 24, celdas: 1 },
  { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 72, celdas: 1 },
  { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 240, celdas: 1 },
]

function claves(payload: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(payload)) {
    for (const valor of payload) claves(valor, acc)
    return acc
  }
  if (payload !== null && typeof payload === 'object') {
    for (const [clave, valor] of Object.entries(payload)) {
      acc.add(clave)
      claves(valor, acc)
    }
  }
  return acc
}

describe('GET /api/infraestructura/radar', () => {
  it('rechaza sin sesión con 401', async () => {
    mockAcceso({ ok: false, status: 401 })
    const res = await GET(req())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autenticado')
    expect(body.corte).toBeUndefined()
  })

  it('rechaza con sesión pero sin acceso al recurso con 403', async () => {
    mockAcceso({ ok: false, status: 403 })
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
  })

  it('sin run vigente devuelve 200 con todo vacío (no es un error)', async () => {
    mockAcceso({ ok: true, user: USER })
    await limpiarMotor()
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.corte).toBeNull()
    expect(body.cobertura).toBeNull()
    expect(body.departamentos).toEqual([])
    expect(body.puntos).toEqual([])
    expect(body.escuelas).toEqual({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0,
    })
    expect(body.kpis).toEqual({ riesgoAltoTotal: 0, sinEvidenciaTotal: 0, accesoCondicionado: { escuelas: 0, matricula: 0 } })
    expect(body.hayNivelProvisorio).toBe(false)
    expect(obtenerNivelesPeligro).not.toHaveBeenCalled()
  })

  it('con run vigente devuelve corte, cobertura, escuelas, kpis y peligro por departamento', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()

    expect(body.corte).toEqual({
      runId: RUN_VIGENTE,
      publicadoEn: PUBLICADO_EN,
      modeloVersion: 'motor-v0.4',
    })
    expect(body.cobertura).toEqual({
      procesadas: 5,
      conEvidencia: 4,
      sinEvidencia: 1,
    })

    expect(body.escuelas.page).toBe(1)
    expect(body.escuelas.pageSize).toBe(50)
    expect(body.escuelas.total).toBe(5)
    expect(body.escuelas.totalPages).toBe(1)
    expect(
      body.escuelas.items.map((i: { snapshotId: string }) => i.snapshotId),
    ).toEqual(['s1', 's5', 's2', 's4', 's3'])
    expect(body.escuelas.items.at(-1).evidenciaValida).toBe(false)
    expect(
      body.escuelas.items.some(
        (i: { snapshotId: string }) => i.snapshotId === 's6',
      ),
    ).toBe(false)

    expect(body.departamentos).toEqual(DEPARTAMENTOS_ESPERADOS)

    expect(body.kpis).toEqual({ riesgoAltoTotal: 2, sinEvidenciaTotal: 1, accesoCondicionado: { escuelas: 0, matricula: 0 } })

    // El peligro se pidió "as-of" la publicación del run (no Date.now()).
    expect(obtenerNivelesPeligro).toHaveBeenCalledTimes(1)
    expect(obtenerNivelesPeligro).toHaveBeenCalledWith({
      ahora: new Date(PUBLICADO_EN),
    })
  })

  it('filtra escuelas y kpis por horizonte sin recortar los horizontes del peligro', async () => {
    mockAcceso({ ok: true, user: USER })
    const body = await (await GET(req('?horizonte=24'))).json()

    expect(body.escuelas.total).toBe(4)
    expect(
      body.escuelas.items.map((i: { snapshotId: string }) => i.snapshotId),
    ).toEqual(['s1', 's2', 's4', 's3'])
    expect(body.kpis).toEqual({ riesgoAltoTotal: 1, sinEvidenciaTotal: 1, accesoCondicionado: { escuelas: 0, matricula: 0 } })

    // El corte de peligro siempre trae los 3 horizontes.
    expect(body.departamentos).toEqual(DEPARTAMENTOS_ESPERADOS)
  })

  it('filtra escuelas, kpis y departamentos por departamento', async () => {
    mockAcceso({ ok: true, user: USER })
    const body = await (await GET(req('?departamento=BETA'))).json()

    expect(body.escuelas.total).toBe(1)
    expect(body.escuelas.items[0].snapshotId).toBe('s3')
    expect(body.escuelas.items[0].departamento).toBe('BETA')
    expect(body.kpis).toEqual({ riesgoAltoTotal: 0, sinEvidenciaTotal: 1, accesoCondicionado: { escuelas: 0, matricula: 0 } })
    expect(body.departamentos).toEqual([
      { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 24, celdas: 1 },
      { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 72, celdas: 1 },
      { departamento: 'BETA', peorNivel: 'sin_dato', horizonteHoras: 240, celdas: 1 },
    ])
  })

  it('filtra por nivel de riesgo y mantiene los kpis sobre el mismo universo', async () => {
    mockAcceso({ ok: true, user: USER })

    const alto = await (await GET(req('?nivel=alto'))).json()
    expect(alto.escuelas.total).toBe(1)
    expect(alto.escuelas.items[0].snapshotId).toBe('s5')
    expect(alto.kpis).toEqual({ riesgoAltoTotal: 1, sinEvidenciaTotal: 0, accesoCondicionado: { escuelas: 0, matricula: 0 } })

    const bajo = await (await GET(req('?nivel=bajo'))).json()
    expect(bajo.escuelas.total).toBe(1)
    expect(bajo.escuelas.items[0].snapshotId).toBe('s4')
    expect(bajo.kpis).toEqual({ riesgoAltoTotal: 0, sinEvidenciaTotal: 0, accesoCondicionado: { escuelas: 0, matricula: 0 } })
  })

  it('expone el riesgo de acceso por item y agrega el KPI de matrícula condicionada', async () => {
    mockAcceso({ ok: true, user: USER })
    const { eq } = await import('drizzle-orm')
    const { infraRiskSnapshot } = await import('@/lib/db/schema')
    await getDb()
      .update(infraRiskSnapshot)
      .set({ nivelRiesgoAcceso: 'alto', scoreRiesgoAcceso: 75, confianzaAcceso: 'media' })
      .where(eq(infraRiskSnapshot.id, 's2'))

    const body = await (await GET(req('?horizonte=24'))).json()

    const item = body.escuelas.items.find((i: { snapshotId: string }) => i.snapshotId === 's2')
    expect(item.nivelRiesgoAcceso).toBe('alto')
    expect(item.scoreRiesgoAcceso).toBe(75)
    expect(item.confianzaAcceso).toBe('media')

    // s2 tiene exposicionMatricula 80; el resto de las escuelas no tiene
    // nivel de acceso alto, así que sólo entra esa.
    expect(body.kpis.accesoCondicionado).toEqual({ escuelas: 1, matricula: 80 })
  })

  it('sin ?horizonte= no duplica el KPI de acceso condicionado cuando la misma escuela tiene una fila por horizonte', async () => {
    mockAcceso({ ok: true, user: USER })
    const { eq } = await import('drizzle-orm')
    const { infraRiskSnapshot } = await import('@/lib/db/schema')

    // `s1` (cueAnexo 1000000-01) ya tiene perfil territorial en GEO. Se le
    // agregan dos filas del MISMO cue para 72h y 240h dentro del run vigente,
    // para que el KPI agregue tres filas del mismo colegio. Sin `?horizonte=`
    // el endpoint devuelve las tres: si no deduplicara por cueAnexo, contaría
    // la matrícula 3 veces.
    await getDb()
      .insert(infraRiskSnapshot)
      .values([
        {
          id: 's7',
          runId: RUN_VIGENTE,
          cueAnexo: '1000000-01',
          horizonteHoras: 72,
          evidenciaValida: true,
          scoreRiesgo: 80,
          nivelRiesgo: 'muy_alto',
          scoreAmenaza: 70,
          scoreVulnerabilidad: 60,
          confianza: 'alta',
          nivelRiesgoAcceso: 'alto',
          exposicionMatricula: 100,
          exposicionSecciones: 5,
          calculadoEn: '2026-01-02T00:00:00Z',
          validoHasta: '2026-01-05T00:00:00Z',
        },
        {
          id: 's8',
          runId: RUN_VIGENTE,
          cueAnexo: '1000000-01',
          horizonteHoras: 240,
          evidenciaValida: true,
          scoreRiesgo: 80,
          nivelRiesgo: 'muy_alto',
          scoreAmenaza: 70,
          scoreVulnerabilidad: 60,
          confianza: 'alta',
          nivelRiesgoAcceso: 'alto',
          exposicionMatricula: 100,
          exposicionSecciones: 5,
          calculadoEn: '2026-01-02T00:00:00Z',
          validoHasta: '2026-01-05T00:00:00Z',
        },
      ])

    await getDb()
      .update(infraRiskSnapshot)
      .set({ nivelRiesgoAcceso: 'alto', exposicionMatricula: 100 })
      .where(eq(infraRiskSnapshot.id, 's1'))

    // SIN query string: es el estado inicial real de la UI (sin `?horizonte=`).
    const body = await (await GET(req())).json()

    // Ninguna otra fila del fixture fija nivelRiesgoAcceso (default null), así
    // que el único colegio condicionado es 1000000-01, y debe contarse una sola
    // vez (no 300 por sumar los tres horizontes).
    expect(body.kpis.accesoCondicionado).toEqual({ escuelas: 1, matricula: 100 })
  })

  it('pagina escuelas con total y totalPages correctos', async () => {
    mockAcceso({ ok: true, user: USER })

    const primera = await (await GET(req('?horizonte=24&page=1&pageSize=2'))).json()
    expect(primera.escuelas.items.map((i: { snapshotId: string }) => i.snapshotId)).toEqual([
      's1',
      's2',
    ])
    expect(primera.escuelas.total).toBe(4)
    expect(primera.escuelas.totalPages).toBe(2)

    const segunda = await (await GET(req('?horizonte=24&page=2&pageSize=2'))).json()
    expect(segunda.escuelas.items.map((i: { snapshotId: string }) => i.snapshotId)).toEqual([
      's4',
      's3',
    ])
  })

  it('devuelve puntos para todo el universo filtrado, aunque pageSize recorte items', async () => {
    mockAcceso({ ok: true, user: USER })
    const body = await (await GET(req('?page=1&pageSize=1'))).json()

    // La lista lateral queda recortada a una fila...
    expect(body.escuelas.items).toHaveLength(1)
    // ...pero los puntos cubren el universo completo de `escuelas.total`.
    expect(body.escuelas.total).toBe(5)
    expect(body.puntos).toHaveLength(5)
    expect(
      body.puntos.map((p: { cueAnexo: string }) => p.cueAnexo).sort(),
    ).toEqual([
      '1000000-01',
      '1000000-02',
      '1000000-03',
      '1000000-04',
      '1000000-05',
    ])
  })

  it('cada punto lleva el nivel de amenaza separado de la prioridad', async () => {
    mockAcceso({ ok: true, user: USER })
    const body = await (await GET(req('?horizonte=24'))).json()

    const porCue = new Map(
      body.puntos.map((p: { cueAnexo: string }) => [p.cueAnexo, p]),
    )
    expect(porCue.get('1000000-01')).toMatchObject({ nivelRiesgo: 'muy_alto', nivelAmenaza: 'alto', nivelVulnerabilidad: 'alto' })
    expect(porCue.get('1000000-03')).toMatchObject({ nivelRiesgo: null, nivelAmenaza: null, nivelVulnerabilidad: null })
    const item = body.escuelas.items.find((i: { snapshotId: string }) => i.snapshotId === 's1')
    expect(item).toMatchObject({ scoreAmenaza: 70, nivelAmenaza: 'alto' })
  })

  it('acota puntos al mismo filtro de horizonte que el universo de escuelas', async () => {
    mockAcceso({ ok: true, user: USER })
    const body = await (await GET(req('?horizonte=24&pageSize=1'))).json()

    expect(body.escuelas.total).toBe(4)
    expect(body.puntos).toHaveLength(4)
    expect(
      body.puntos.every((p: { horizonteHoras: number }) => p.horizonteHoras === 24),
    ).toBe(true)
  })

  it('acota puntos al mismo filtro de departamento que el universo de escuelas', async () => {
    mockAcceso({ ok: true, user: USER })
    const body = await (await GET(req('?departamento=BETA'))).json()

    expect(body.escuelas.total).toBe(1)
    expect(body.puntos).toEqual([
      {
        cueAnexo: '1000000-03',
        departamento: 'BETA',
        horizonteHoras: 24,
        nivelRiesgo: null,
        nivelAmenaza: null,
        nivelVulnerabilidad: null,
        confianza: 'baja',
        nivelRiesgoAcceso: null,
      },
    ])
  })

  it('rechaza parámetros inválidos con 400', async () => {
    mockAcceso({ ok: true, user: USER })

    const horizonteInvalido = await GET(req('?horizonte=99'))
    expect(horizonteInvalido.status).toBe(400)
    expect((await horizonteInvalido.json()).error).toBe('horizonte inválido')

    const nivelInvalido = await GET(req('?nivel=extremo'))
    expect(nivelInvalido.status).toBe(400)
    expect((await nivelInvalido.json()).error).toContain('nivel')

    const pageInvalido = await GET(req('?page=0'))
    expect(pageInvalido.status).toBe(400)
    expect((await pageInvalido.json()).error).toContain('page')

    const pageSizeInvalido = await GET(req('?pageSize=500'))
    expect(pageSizeInvalido.status).toBe(400)
    expect((await pageSizeInvalido.json()).error).toContain('pageSize')
  })

  it('marca hayNivelProvisorio true si una celda usa umbral provisorio (sin climatología)', async () => {
    mockAcceso({ ok: true, user: USER })
    await sembrarPronosticoSinClimatologia()
    const res = await GET(req())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.hayNivelProvisorio).toBe(true)
    // El campo es aditivo: el resto del shape no cambia.
    expect(body.corte.runId).toBe(RUN_VIGENTE)
  })

  it('marca hayNivelProvisorio false si todas las celdas tienen climatología o sin_dato', async () => {
    mockAcceso({ ok: true, user: USER })
    await sembrarPronosticoSinClimatologia()
    await sembrarClimatologiaCompleta()
    const res = await GET(req())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.hayNivelProvisorio).toBe(false)
  })

  it('no expone ningún campo nominal (escuela, alumno, docente ni persona)', async () => {
    mockAcceso({ ok: true, user: USER })
    const body = await (await GET(req())).json()

    const prohibidas = [...claves(body)].filter((clave) =>
      /nombre|alumno|docente|persona|apellido|dni|legajo/i.test(clave),
    )
    expect(prohibidas).toEqual([])

    for (const item of body.escuelas.items) {
      expect(Object.keys(item).sort()).toEqual(ITEM_KEYS)
    }
  })
})
