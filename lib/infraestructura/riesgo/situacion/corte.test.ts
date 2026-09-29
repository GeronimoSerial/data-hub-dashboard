// Tests del corte de situación (E5) contra una base libsql real, aislada en un
// tmpdir (mismo patrón que nivel.test.ts y recompute.test.ts): DATA_DIR a un
// tmpdir, ensureSeeded() una vez y getDb() memoizado, con import dinámico del
// módulo bajo prueba DENTRO de beforeAll para que vea el DATA_DIR ya fijado.
//
// Un único directorio para TODO el archivo: getDb() memoiza la conexión en el
// primer uso, así que un directorio por test dejaría a los siguientes tests
// hablándole a una base ya borrada.
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  hazardSourceHealth,
  infraAfectacion,
  infraAfectacionAlumno,
  infraEpisodioDerivado,
  infraParte,
  infraRiskRun,
  infraRiskSnapshot,
  infraSituacionCorte,
} from '@/lib/db/schema'
import { PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { generarBriefing } from '@/lib/infraestructura/riesgo/briefing'
import type { getDb as GetDb } from '@/lib/db'
import type {
  generarCorte as GenerarCorte,
  obtenerCorteAnterior as ObtenerCorteAnterior,
  obtenerUltimoCorte as ObtenerUltimoCorte,
  reconstruirBriefingDesdeCorte as ReconstruirBriefingDesdeCorte,
} from './corte'
import { insertarRunVigente, limpiarDatosSituacion } from './__fixtures__/persistencia'

let dir: string
let prevDataDir: string | undefined

let db: ReturnType<typeof GetDb>
let generarCorte: typeof GenerarCorte
let obtenerUltimoCorte: typeof ObtenerUltimoCorte
let obtenerCorteAnterior: typeof ObtenerCorteAnterior
let reconstruirBriefingDesdeCorte: typeof ReconstruirBriefingDesdeCorte

const AHORA = '2026-09-27T12:00:00.000Z'

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'situacion-corte-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  const { getDb } = await import('@/lib/db')
  db = getDb()

  ;({
    generarCorte,
    obtenerUltimoCorte,
    obtenerCorteAnterior,
    reconstruirBriefingDesdeCorte,
  } = await import('./corte'))
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => limpiarDatosSituacion(db))

async function insertarSnapshot(
  runId: string,
  cueAnexo: string,
  nivelRiesgo: string | null,
  opts?: { horizonteHoras?: number; exposicionMatricula?: number | null },
): Promise<void> {
  await db.insert(infraRiskSnapshot).values({
    id: randomUUID(),
    runId,
    cueAnexo,
    horizonteHoras: opts?.horizonteHoras ?? 24,
    evidenciaValida: nivelRiesgo !== null,
    scoreRiesgo: nivelRiesgo === null ? null : 0.5,
    nivelRiesgo,
    scoreAmenaza: null,
    scoreVulnerabilidad: null,
    confianza: 'media',
    exposicionMatricula: opts?.exposicionMatricula ?? null,
    exposicionSecciones: null,
    calculadoEn: '2026-09-27T10:00:00.000Z',
    validoHasta: '2026-09-28T10:00:00.000Z',
  })
}

async function insertarParteConAfectacion(
  cueAnexo: string,
  opts?: { retirada?: boolean; afectaciones?: number },
): Promise<{ parteId: string; afectacionIds: string[] }> {
  const parteId = randomUUID()
  await db.insert(infraParte).values({
    id: parteId,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: '2026-09-01T00:00:00.000Z',
    corteId: 1,
    creadaEn: '2026-09-01T00:00:00.000Z',
    actualizadaEn: '2026-09-01T00:00:00.000Z',
  })

  const afectacionIds: string[] = []
  const cantidad = opts?.afectaciones ?? 1
  for (let i = 0; i < cantidad; i++) {
    const id = randomUUID()
    afectacionIds.push(id)
    await db.insert(infraAfectacion).values({
      id,
      parteId,
      motivo: 'inundacion',
      categoria: 'establecimiento',
      severidad: 'alta',
      rigeDesde: '2026-09-10T00:00:00.000Z',
      creadaEn: '2026-09-10T00:00:00.000Z',
      retiradaEn: opts?.retirada ? '2026-09-20T00:00:00.000Z' : null,
    })
  }
  return { parteId, afectacionIds }
}

async function insertarSalud(
  provider: string,
  ultimoExitoEn: string | null,
  ttlMinutos: number,
): Promise<void> {
  await db.insert(hazardSourceHealth).values({
    provider,
    ultimoExitoEn,
    ultimoIntentoEn: ultimoExitoEn,
    estado: 'ok',
    ultimoErrorSaneado: null,
    ttlMinutos,
    licencia: 'test',
    actualizadaEn: ultimoExitoEn ?? '2026-09-27T00:00:00.000Z',
  })
}

async function insertarEpisodio(
  estado: 'abierto' | 'cerrado',
  finEn: string | null = null,
): Promise<string> {
  const id = randomUUID()
  await db.insert(infraEpisodioDerivado).values({
    id,
    reglaVersion: 'episodios-v0.1',
    parametros: {},
    unidadTipo: 'departamento',
    unidadId: 'PARANA',
    inicioEn: '2026-09-20T00:00:00.000Z',
    finEn,
    estado,
    escuelasAfectadas: 1,
    calculadoEn: '2026-09-27T10:00:00.000Z',
  })
  return id
}

async function sembrarBase(): Promise<string> {
  const runId = await insertarRunVigente(db)
  await insertarSnapshot(runId, '1800001-00', 'bajo')
  await insertarSnapshot(runId, '1800002-00', 'moderado')
  await insertarSnapshot(runId, '1800003-00', 'alto')
  await insertarSnapshot(runId, '1800004-00', 'alto')
  await insertarSnapshot(runId, '1800005-00', 'muy_alto')
  await insertarSnapshot(runId, '1800006-00', null) // sin evidencia: se excluye
  await insertarSnapshot(runId, '1800007-00', 'alto', { horizonteHoras: 72 }) // otro horizonte: no cuenta

  // Afectación confirmada vigente: una escuela cuenta; la retirada no.
  await insertarParteConAfectacion('1800001-00')
  await insertarParteConAfectacion('1800009-00', { retirada: true })

  // Salud: una vencida (30 min > 10), una fresca (5 <= 60), una sin dato.
  await insertarSalud('open-meteo', '2026-09-27T11:30:00.000Z', 10)
  await insertarSalud('nasa-gpm', '2026-09-27T11:55:00.000Z', 60)
  await insertarSalud('sin-dato', null, 60)

  await insertarEpisodio('abierto')

  return runId
}

describe('generarCorte', () => {
  it('congela cobertura, conteos por nivel, KPIs y salud de fuentes', async () => {
    const runId = await sembrarBase()

    const resultado = await generarCorte({ ahora: new Date(AHORA), jobRunId: null })

    expect(resultado.generadoEn).toBe(AHORA)
    expect(resultado.riskRunId).toBe(runId)
    expect(resultado.conteosPorNivelRiesgo).toEqual({
      bajo: 1,
      moderado: 1,
      alto: 2,
      muy_alto: 1,
    })
    expect(resultado.kpis).toEqual({
      escuelasAfectacionConfirmadaVigente: 1,
      escuelasRiesgoAlto24h: 3,
      fuentesVencidas: 1,
    })
    expect(resultado.episodiosAbiertos).toBe(1)
    expect(resultado.episodiosCerradosDesdeAnterior).toBe(0)

    // El corte persistido congela la cobertura y la frescura tal como se vio.
    const [persistido] = await db
      .select()
      .from(infraSituacionCorte)
      .where(eq(infraSituacionCorte.id, resultado.corteId))

    expect(persistido.cobertura).toEqual({
      procesadas: 10,
      conEvidencia: 8,
      sinEvidencia: 2,
    })
    expect(persistido.fuentesSalud).toHaveLength(3)
    expect(
      persistido.fuentesSalud.find((f) => f.provider === 'open-meteo'),
    ).toEqual({ provider: 'open-meteo', estado: 'ok', frescuraMinutos: 30, vencida: true })
    expect(
      persistido.fuentesSalud.find((f) => f.provider === 'nasa-gpm'),
    ).toEqual({ provider: 'nasa-gpm', estado: 'ok', frescuraMinutos: 5, vencida: false })
    expect(
      persistido.fuentesSalud.find((f) => f.provider === 'sin-dato'),
    ).toEqual({ provider: 'sin-dato', estado: 'ok', frescuraMinutos: null, vencida: false })
  })

  it('cuenta ESCUELAS con afectación confirmada, no alumnos ni matrícula expuesta', async () => {
    // Run con un snapshot que expone 999 alumnos de matrícula: NO debe sumarse
    // a ningún KPI (el corte no arrastra universos de alumnos).
    const runId = await insertarRunVigente(db, null)
    await insertarSnapshot(runId, '1800100-00', 'bajo', { exposicionMatricula: 999 })

    // Escuela A: 2 afectaciones vigentes y 3 alumnos nominales seleccionados.
    const escuelaA = await insertarParteConAfectacion('1800100-00', { afectaciones: 2 })
    await db.insert(infraAfectacionAlumno).values([
      { afectacionId: escuelaA.afectacionIds[0], gePersonId: 1 },
      { afectacionId: escuelaA.afectacionIds[0], gePersonId: 2 },
      { afectacionId: escuelaA.afectacionIds[1], gePersonId: 3 },
    ])
    // Escuela B: 1 afectación vigente.
    await insertarParteConAfectacion('1800101-00')

    // Sanity: hay 3 afectaciones vigentes pero 2 escuelas distintas.
    const [sanity] = await db
      .select({ conteo: sql<number>`count(*)` })
      .from(infraAfectacion)
    expect(Number(sanity.conteo)).toBe(3)

    const resultado = await generarCorte({ ahora: new Date(AHORA), jobRunId: null })

    expect(resultado.kpis.escuelasAfectacionConfirmadaVigente).toBe(2)
    expect(resultado.kpis.escuelasRiesgoAlto24h).toBe(0)

    // Sólo existen las 3 claves documentadas de KPI: ninguna suma matrícula
    // confirmada + expuesta + potencialmente condicionada.
    expect(Object.keys(resultado.kpis).sort()).toEqual([
      'escuelasAfectacionConfirmadaVigente',
      'escuelasRiesgoAlto24h',
      'fuentesVencidas',
    ])
    expect(Object.keys(resultado).sort()).toEqual([
      'conteosPorNivelRiesgo',
      'corteId',
      'episodiosAbiertos',
      'episodiosCerradosDesdeAnterior',
      'generadoEn',
      'kpis',
      'riskRunId',
    ])
    for (const clave of Object.keys(resultado)) {
      expect(clave).not.toMatch(/matricula|alumno|expuesta|potencial/i)
    }
  })

  it('cuenta episodios cerrados comparando contra el corte anterior persistido', async () => {
    await insertarRunVigente(db)
    const episodioId = await insertarEpisodio('abierto')

    const corte1 = await generarCorte({
      ahora: new Date('2026-09-27T12:00:00.000Z'),
      jobRunId: null,
    })
    expect(corte1.episodiosAbiertos).toBe(1)
    expect(corte1.episodiosCerradosDesdeAnterior).toBe(0)

    // El episodio se cierra entre los dos cortes.
    await db
      .update(infraEpisodioDerivado)
      .set({ estado: 'cerrado', finEn: '2026-09-27T13:00:00.000Z' })
      .where(eq(infraEpisodioDerivado.id, episodioId))

    const corte2 = await generarCorte({
      ahora: new Date('2026-09-27T14:00:00.000Z'),
      jobRunId: null,
    })
    expect(corte2.episodiosAbiertos).toBe(0)
    expect(corte2.episodiosCerradosDesdeAnterior).toBe(1)
  })

  it('sin run vigente devuelve riskRunId null y conteos vacíos sin tirar', async () => {
    const resultado = await generarCorte({ ahora: new Date(AHORA), jobRunId: null })

    expect(resultado.riskRunId).toBeNull()
    expect(resultado.conteosPorNivelRiesgo).toEqual({})
    expect(resultado.kpis.escuelasRiesgoAlto24h).toBe(0)
    expect(resultado.episodiosAbiertos).toBe(0)
    expect(resultado.episodiosCerradosDesdeAnterior).toBe(0)

    const [persistido] = await db
      .select()
      .from(infraSituacionCorte)
      .where(eq(infraSituacionCorte.id, resultado.corteId))
    expect(persistido.cobertura).toBeNull()
  })
})

describe('obtenerUltimoCorte / obtenerCorteAnterior', () => {
  it('sin cortes persistidos devuelve null', async () => {
    expect(await obtenerUltimoCorte()).toBeNull()
  })

  it('devuelve el corte más reciente y su anterior por generadoEn', async () => {
    await insertarRunVigente(db)
    const corte1 = await generarCorte({
      ahora: new Date('2026-09-27T10:00:00.000Z'),
      jobRunId: null,
    })
    const corte2 = await generarCorte({
      ahora: new Date('2026-09-27T11:00:00.000Z'),
      jobRunId: null,
    })

    const ultimo = await obtenerUltimoCorte()
    expect(ultimo?.id).toBe(corte2.corteId)

    const anterior = await obtenerCorteAnterior(corte2.generadoEn)
    expect(anterior?.id).toBe(corte1.corteId)

    // El primer corte no tiene anterior.
    expect(await obtenerCorteAnterior(corte1.generadoEn)).toBeNull()
  })
})

describe('reconstruirBriefingDesdeCorte', () => {
  it('reconstruye EXACTAMENTE el mismo briefing que generarBriefing con los datos en vivo del corte, sin consultar infra_risk_run', async () => {
    const runId = await insertarRunVigente(db, { procesadas: 20, conEvidencia: 18, sinEvidencia: 2 })
    await insertarSnapshot(runId, '1800001-00', 'alto')
    await insertarSnapshot(runId, '1800002-00', 'muy_alto')

    const corte1 = await generarCorte({
      ahora: new Date('2026-09-27T10:00:00.000Z'),
      jobRunId: null,
    })

    // Entre cortes, el run vigente cambia de cobertura (simula un recálculo
    // real): reconstruirBriefingDesdeCorte NUNCA debe verlo, sólo lo que ya
    // quedó congelado en cada fila.
    await db
      .update(infraRiskRun)
      .set({ cobertura: { procesadas: 999, conEvidencia: 999, sinEvidencia: 0 } })
      .where(eq(infraRiskRun.id, runId))
    await insertarSnapshot(runId, '1800003-00', 'muy_alto')

    const corte2 = await generarCorte({
      ahora: new Date('2026-09-27T11:00:00.000Z'),
      jobRunId: null,
    })

    const ultimo = (await obtenerUltimoCorte())!
    const anterior = (await obtenerCorteAnterior(ultimo.generadoEn))!
    expect(ultimo.id).toBe(corte2.corteId)
    expect(anterior.id).toBe(corte1.corteId)

    const briefingReconstruido = reconstruirBriefingDesdeCorte(ultimo, anterior)

    // El equivalente "en vivo" (lo que E4 ya hacía con datos de infra_risk_run
    // en el momento exacto de cada corte) debe coincidir línea por línea. La
    // cobertura de corte2 refleja el valor YA actualizado (999/999/0) al
    // momento en que ese corte se generó; la de corte1 quedó congelada con el
    // valor previo (20/18/2), tal como lo ve reconstruirBriefingDesdeCorte.
    const briefingEnVivo = generarBriefing(
      { id: corte2.corteId, cobertura: { procesadas: 999, conEvidencia: 999, sinEvidencia: 0 }, publicadoEn: corte2.generadoEn },
      { id: corte1.corteId, cobertura: { procesadas: 20, conEvidencia: 18, sinEvidencia: 2 }, publicadoEn: corte1.generadoEn },
      { actual: corte2.conteosPorNivelRiesgo, anterior: corte1.conteosPorNivelRiesgo },
    )

    expect(briefingReconstruido).toEqual(briefingEnVivo)
    expect(briefingReconstruido.length).toBeGreaterThan(0)
  })

  it('sin corte anterior devuelve la línea de "primer resumen del día", sin exponer el id interno', async () => {
    await insertarRunVigente(db)
    const corte1 = await generarCorte({ ahora: new Date(AHORA), jobRunId: null })
    const ultimo = (await obtenerUltimoCorte())!
    expect(ultimo.id).toBe(corte1.corteId)

    const briefing = reconstruirBriefingDesdeCorte(ultimo, null)
    expect(briefing).toHaveLength(1)
    expect(briefing[0]).toMatch(/Primer resumen del día/)
    expect(briefing[0]).not.toContain(ultimo.id)
  })
})
