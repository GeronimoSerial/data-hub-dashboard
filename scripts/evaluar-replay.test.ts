import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { correrEvaluacionReplay } from './evaluar-replay.mjs'

let dir: string
let prevDataDir: string | undefined

const DEPARTAMENTO = 'Paraná'
const CUE_ANEXO = '007123'
const T_ALERTA = '2026-03-10T06:00:00.000Z'
const T_AFECTACION = '2026-03-10T18:00:00.000Z'

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'evaluar-replay-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
  const { getDb } = await import('@/lib/db')
  const schema = await import('@/lib/db/schema')
  const db = getDb()

  await db.insert(schema.infraGeoProfile).values({
    cueAnexo: CUE_ANEXO,
    lat: -31.73,
    lon: -60.52,
    geoCalidad: 'alta',
    departamento: DEPARTAMENTO,
    geometryRef: '-31.73_-60.52',
    motivoExclusion: null,
    perfilVersion: 'geo-perfil-v1',
    calculadoEn: T_ALERTA,
  })

  await db.insert(schema.infraRiskRun).values({
    id: 'run-eval-001',
    periodoId: (
      await db.select().from(schema.infraPeriodo).limit(1)
    )[0]!.id,
    modeloVersion: 'motor-v0.1',
    iniciadoEn: T_ALERTA,
    publicadoEn: T_ALERTA,
    estado: 'vencido',
    cobertura: { procesadas: 1, conEvidencia: 1, sinEvidencia: 0 },
    creadaEn: T_ALERTA,
  })
  await db.insert(schema.infraRiskSnapshot).values({
    id: 'snapshot-eval-001',
    runId: 'run-eval-001',
    cueAnexo: CUE_ANEXO,
    horizonteHoras: 72,
    evidenciaValida: true,
    scoreRiesgo: 0.8,
    nivelRiesgo: 'alto',
    scoreAmenaza: 0.7,
    scoreVulnerabilidad: 0.6,
    confianza: 'alta',
    exposicionMatricula: 100,
    exposicionSecciones: 4,
    calculadoEn: T_ALERTA,
    validoHasta: '2026-03-13T06:00:00.000Z',
  })

  await db.insert(schema.infraEpisodioDerivado).values({
    id: 'episodio-eval-001',
    reglaVersion: 'episodios-v0.1',
    parametros: {},
    unidadTipo: 'departamento',
    unidadId: DEPARTAMENTO,
    inicioEn: T_AFECTACION,
    finEn: null,
    estado: 'abierto',
    escuelasAfectadas: 1,
    calculadoEn: T_AFECTACION,
  })
  await db.insert(schema.infraEpisodioMiembro).values({
    id: 'miembro-eval-001',
    episodioDerivadoId: 'episodio-eval-001',
    cueAnexo: CUE_ANEXO,
    movimientoId: null,
    primeraAfectacionEn: T_AFECTACION,
    recuperadoEn: null,
  })
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('correrEvaluacionReplay', () => {
  it('evalúa el episodio como precedido por riesgo alto (12h de anticipación) y no lanza contra la red', async () => {
    const resultado = await correrEvaluacionReplay({ departamento: DEPARTAMENTO })
    expect(resultado.episodiosEvaluados).toBe(1)
    const [r] = resultado.resultadosPorEpisodio
    expect(r.evaluable).toBe(true)
    expect(r.precedidoPorRiesgoAlto).toBe(true)
    expect(r.anticipacionHoras).toBe(12)
    expect(resultado.tasa.tasaPrecedidos).toBe(1)
    expect(resultado.escuelasSinAlerta.escuelasConDatoDeRiesgo).toBe(1)
    expect(resultado.escuelasSinAlerta.escuelasNuncaAlerta).toBe(0)
  })

  it('un departamento sin ningún episodio devuelve "no evaluable" vacío, no un error', async () => {
    const resultado = await correrEvaluacionReplay({ departamento: 'Departamento-Inexistente' })
    expect(resultado.episodiosEvaluados).toBe(0)
    expect(resultado.tasa.tasaPrecedidos).toBeNull()
  })
})
