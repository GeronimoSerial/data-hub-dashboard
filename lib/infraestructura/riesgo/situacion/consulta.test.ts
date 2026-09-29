// Tests de las consultas del Centro de Situación (E5) contra una base libsql
// real, aislada en un tmpdir (mismo patrón que corte.test.ts / nivel.test.ts).
import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import {
  infraEpisodioDerivado,
  infraGeoProfile,
  infraMovimiento,
  infraParte,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import { PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import type { getDb as GetDb } from '@/lib/db'
import type {
  generarCorte as GenerarCorte,
} from './corte'
import type {
  obtenerCambiosDesde as ObtenerCambiosDesde,
  obtenerEstadoSituacion as ObtenerEstadoSituacion,
  obtenerTopPrioridades as ObtenerTopPrioridades,
} from './consulta'
import { insertarRunVigente, limpiarDatosSituacion } from './__fixtures__/persistencia'

usarDbTemporal('situacion-consulta-')

beforeAll(async () => {
  const { getDb } = await import('@/lib/db')
  db = getDb()

  ;({ generarCorte } = await import('./corte'))
  ;({ obtenerEstadoSituacion, obtenerTopPrioridades, obtenerCambiosDesde } = await import(
    './consulta'
  ))
})

let prevEnosJobsEnabled: string | undefined

let db: ReturnType<typeof GetDb>
let generarCorte: typeof GenerarCorte
let obtenerEstadoSituacion: typeof ObtenerEstadoSituacion
let obtenerTopPrioridades: typeof ObtenerTopPrioridades
let obtenerCambiosDesde: typeof ObtenerCambiosDesde

beforeEach(() => {
  prevEnosJobsEnabled = process.env.ENOS_JOBS_ENABLED
})

afterEach(async () => {
  if (prevEnosJobsEnabled === undefined) delete process.env.ENOS_JOBS_ENABLED
  else process.env.ENOS_JOBS_ENABLED = prevEnosJobsEnabled
  await limpiarDatosSituacion(db)
})

const DIFF_VACIO = {
  afectacionesAgregadas: [],
  afectacionesRetiradas: [],
  severidadesCambiadas: [],
  alcancesCambiados: [],
  datosCambiados: [],
  serviciosCambiados: [],
  establecimientoCambiado: null,
}

async function insertarGeoProfile(cueAnexo: string, departamento: string): Promise<void> {
  await db.insert(infraGeoProfile).values({
    cueAnexo,
    lat: -31.7,
    lon: -60.5,
    geoCalidad: 'exacta',
    departamento,
    geometryRef: `${departamento}-0`,
    motivoExclusion: null,
    perfilVersion: 'v0',
    calculadoEn: '2026-09-01T00:00:00.000Z',
  })
}

async function insertarSnapshot(
  runId: string,
  cueAnexo: string,
  nivelRiesgo: string | null,
  scoreRiesgo: number | null,
  horizonteHoras: 24 | 72 | 240 = 24,
): Promise<void> {
  await db.insert(infraRiskSnapshot).values({
    id: randomUUID(),
    runId,
    cueAnexo,
    horizonteHoras,
    evidenciaValida: nivelRiesgo !== null,
    scoreRiesgo,
    nivelRiesgo,
    scoreAmenaza: null,
    scoreVulnerabilidad: null,
    confianza: 'media',
    exposicionMatricula: null,
    exposicionSecciones: null,
    calculadoEn: '2026-09-27T10:00:00.000Z',
    validoHasta: '2026-09-28T10:00:00.000Z',
  })
}

async function insertarParte(cueAnexo: string): Promise<string> {
  const id = randomUUID()
  await db.insert(infraParte).values({
    id,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: '2026-09-01T00:00:00.000Z',
    corteId: 1,
    creadaEn: '2026-09-01T00:00:00.000Z',
    actualizadaEn: '2026-09-01T00:00:00.000Z',
  })
  return id
}

async function insertarMovimiento(
  parteId: string,
  creadaEn: string,
  rigeDesde: string,
): Promise<void> {
  await db.insert(infraMovimiento).values({
    id: randomUUID(),
    parteId,
    tipo: 'actualizacion',
    rol: 'director',
    resumen: DIFF_VACIO,
    rigeDesde,
    creadaEn,
  })
}

describe('obtenerTopPrioridades', () => {
  it('devuelve escuelas alto/muy alto a 24h ordenadas por score, filtrando por departamento', async () => {
    await insertarGeoProfile('1800001-00', 'PARANA')
    await insertarGeoProfile('1800002-00', 'PARANA')
    await insertarGeoProfile('1800003-00', 'CONCORDIA')
    const runId = await insertarRunVigente(db)
    await insertarSnapshot(runId, '1800001-00', 'alto', 0.6)
    await insertarSnapshot(runId, '1800002-00', 'muy_alto', 0.9)
    await insertarSnapshot(runId, '1800003-00', 'muy_alto', 0.95)
    await insertarSnapshot(runId, '1800001-00', 'bajo', 0.1, 72) // otro horizonte/nivel no cuenta

    const global = await obtenerTopPrioridades()
    expect(global.map((f) => f.cueAnexo)).toEqual(['1800003-00', '1800002-00', '1800001-00'])

    const filtrado = await obtenerTopPrioridades({ territorioTipo: 'departamento', territorioId: 'PARANA' })
    expect(filtrado.map((f) => f.cueAnexo)).toEqual(['1800002-00', '1800001-00'])
  })

  it('sin run vigente devuelve vacío', async () => {
    expect(await obtenerTopPrioridades()).toEqual([])
  })
})

describe('obtenerEstadoSituacion', () => {
  it('sin ningún corte todavía, marca atrasado (salvo enosJobsEnabled=false) y briefing vacío', async () => {
    delete process.env.ENOS_JOBS_ENABLED
    const estado = await obtenerEstadoSituacion()
    expect(estado.corte).toBeNull()
    expect(estado.briefing).toEqual([])
    expect(estado.atraso.atrasado).toBe(true)
    expect(estado.atraso.desactivadoPorConfig).toBe(false)
  })

  it('con ENOS_JOBS_ENABLED=false, nunca marca atrasado (pausa operativa deliberada)', async () => {
    process.env.ENOS_JOBS_ENABLED = 'false'
    const estado = await obtenerEstadoSituacion()
    expect(estado.atraso.atrasado).toBe(false)
    expect(estado.atraso.desactivadoPorConfig).toBe(true)
  })

  it('con un corte reciente, no está atrasado y expone su briefing reconstruido', async () => {
    process.env.ENOS_JOBS_ENABLED = 'true'
    await insertarRunVigente(db)
    const ahora = new Date('2026-09-27T12:00:00.000Z')
    await generarCorte({ ahora, jobRunId: null })

    const estado = await obtenerEstadoSituacion({ ahora })
    expect(estado.corte).not.toBeNull()
    expect(estado.atraso.atrasado).toBe(false)
    expect(estado.briefing.length).toBeGreaterThan(0)
  })

  it('con un corte viejo (más de 2 cadencias, 1h cada una), marca desactualizado', async () => {
    process.env.ENOS_JOBS_ENABLED = 'true'
    await insertarRunVigente(db)
    await generarCorte({ ahora: new Date('2026-09-27T09:00:00.000Z'), jobRunId: null })

    const estado = await obtenerEstadoSituacion({ ahora: new Date('2026-09-27T12:30:00.000Z') })
    expect(estado.atraso.atrasado).toBe(true)
  })
})

describe('obtenerCambiosDesde', () => {
  it('separa correctamente registro (creadaEn) vs vigencia (rigeDesde) para afectaciones', async () => {
    await insertarGeoProfile('1800001-00', 'PARANA')
    const parteId = await insertarParte('1800001-00')
    // Se registró el 10 pero rige retroactivamente desde el 1.
    await insertarMovimiento(parteId, '2026-09-10T00:00:00.000Z', '2026-09-01T00:00:00.000Z')

    const desdeMedio = new Date('2026-09-05T00:00:00.000Z')
    const cambios = await obtenerCambiosDesde({ desde: desdeMedio })

    // Por vigencia (rige desde el 1) NO entra (rigeDesde < desde). Por
    // registro (creada el 10) SÍ entra.
    expect(cambios.porVigencia).toHaveLength(0)
    expect(cambios.porRegistro).toHaveLength(1)
    expect(cambios.porRegistro[0].departamento).toBe('PARANA')
    expect(cambios.porRegistro[0].cueAnexo).toBe('1800001-00')
  })

  it('filtra por territorio y no mezcla departamentos distintos', async () => {
    await insertarGeoProfile('1800001-00', 'PARANA')
    await insertarGeoProfile('1800002-00', 'CONCORDIA')
    const parteA = await insertarParte('1800001-00')
    const parteB = await insertarParte('1800002-00')
    await insertarMovimiento(parteA, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z')
    await insertarMovimiento(parteB, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z')

    const cambios = await obtenerCambiosDesde({
      desde: new Date('2026-09-01T00:00:00.000Z'),
      territorioTipo: 'departamento',
      territorioId: 'PARANA',
    })
    expect(cambios.porRegistro).toHaveLength(1)
    expect(cambios.porRegistro[0].departamento).toBe('PARANA')
  })

  it('incluye episodios abiertos y cerrados con su propia distinción registro/vigencia', async () => {
    await db.insert(infraEpisodioDerivado).values({
      id: 'ep-1',
      reglaVersion: 'episodios-v0.1',
      parametros: {},
      unidadTipo: 'departamento',
      unidadId: 'PARANA',
      inicioEn: '2026-09-05T00:00:00.000Z',
      finEn: '2026-09-08T00:00:00.000Z',
      estado: 'cerrado',
      escuelasAfectadas: 3,
      calculadoEn: '2026-09-09T00:00:00.000Z',
    })

    const cambios = await obtenerCambiosDesde({ desde: new Date('2026-09-06T00:00:00.000Z') })
    // Apertura: vigencia usa inicioEn (5/9, queda antes del desde, no entra);
    // registro usa calculadoEn (9/9, el sistema recién la calculó, entra).
    expect(cambios.porVigencia.some((c) => c.tipo === 'episodio_abierto')).toBe(false)
    expect(cambios.porRegistro.find((c) => c.tipo === 'episodio_abierto')?.ocurreEn).toBe(
      '2026-09-09T00:00:00.000Z',
    )
    // Cierre: vigencia usa finEn (8/9, entra); registro usa calculadoEn (9/9, entra).
    expect(cambios.porVigencia.find((c) => c.tipo === 'episodio_cerrado')?.ocurreEn).toBe(
      '2026-09-08T00:00:00.000Z',
    )
    expect(cambios.porRegistro.find((c) => c.tipo === 'episodio_cerrado')?.ocurreEn).toBe(
      '2026-09-09T00:00:00.000Z',
    )
  })

  it('detecta cambios de nivel de riesgo entre cortes consecutivos (global, registro=vigencia)', async () => {
    const runId = await insertarRunVigente(db)
    await insertarSnapshot(runId, '1800001-00', 'alto', 0.5)

    const corte1 = await generarCorte({ ahora: new Date('2026-09-27T10:00:00.000Z'), jobRunId: null })
    await insertarSnapshot(runId, '1800002-00', 'muy_alto', 0.6)
    await generarCorte({ ahora: new Date('2026-09-27T11:00:00.000Z'), jobRunId: null })

    const cambios = await obtenerCambiosDesde({ desde: new Date(corte1.generadoEn) })
    const cambioRiesgo = cambios.porRegistro.find((c) => c.tipo === 'riesgo')
    expect(cambioRiesgo).toBeDefined()
    expect(cambioRiesgo?.descripcion).toMatch(/subieron de 1 a 2/)
    // registro y vigencia coinciden para el corte (es instantáneo).
    expect(cambios.porVigencia.find((c) => c.tipo === 'riesgo')).toEqual(cambioRiesgo)
  })
})
