// Job operativo con Motor v0.4 promovido (T11, docs/motor-v0.4/promocion.md):
// reglas v0.4 por defecto, run `modo = 'operativo'` publicado como vigente,
// universo idéntico al de v0.3 (sólo escuelas con perfil) y degradación sin
// caída cuando faltan los insumos v0.4 (serie INA, altimetría, padrón).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { crearPuertosFake } from '../motor/__fixtures__/puertos-fake'
import type { NivelPeligro, NivelPeligroCelda, PuertosMotor } from '../motor/puertos'
import type { PuertoAltimetriaV04 } from '../motor-v04/altimetria-adaptador'
import type { EscuelaPadronV04, PuertoPadronV04 } from '../motor-v04/padron'
import type { InsumosTerrenoV04, PuertoTerrenoV04 } from '../motor-v04/terreno-adaptador'
import type { calcularYPublicarRiesgo as CalcularYPublicarRiesgo } from './calcular-riesgo'

usarDbTemporal('calcular-riesgo-operativo-v04-')

let calcularYPublicarRiesgo: typeof CalcularYPublicarRiesgo
const reglasOriginales = process.env.RIESGO_REGLAS_MOTOR

beforeAll(async () => {
  delete process.env.RIESGO_REGLAS_MOTOR
  ;({ calcularYPublicarRiesgo } = await import('./calcular-riesgo'))
})

afterAll(() => {
  if (reglasOriginales === undefined) delete process.env.RIESGO_REGLAS_MOTOR
  else process.env.RIESGO_REGLAS_MOTOR = reglasOriginales
})

const CUE_A = '1800001-00'
const CUE_B = '1800002-00'
// En el padrón pero sin coordenadas ni perfil: hoy no tiene fila y debe seguir sin tenerla.
const CUE_SIN_COORD = '1800003-00'
const PADRON: EscuelaPadronV04[] = [
  { cueAnexo: CUE_A, motivoUbicacion: null },
  { cueAnexo: CUE_B, motivoUbicacion: null },
  { cueAnexo: CUE_SIN_COORD, motivoUbicacion: 'sin_coordenadas' },
]

function puertos(peligro: Record<string, NivelPeligroCelda[]> = {}): PuertosMotor {
  const cues = [CUE_A, CUE_B]
  return crearPuertosFake({
    territorio: Object.fromEntries(cues.map((c) => [c, { cueAnexo: c, geometryRef: `g-${c}`, departamento: 'Capital', puntoRioId: null, motivoExclusion: null }])),
    lluvia24h: Object.fromEntries(cues.map((c) => [`g-${c}`, 40])),
    lluvia72h: Object.fromEntries(cues.map((c) => [`g-${c}`, 90])),
    peligro,
  })
}

// Nivel de peligro a 240 h tal como lo entrega el motor (emitido antes de `ahora`).
function nivel240(geometryRef: string, nivel: NivelPeligro, extra: Partial<NivelPeligroCelda> = {}): NivelPeligroCelda {
  return {
    geometryRef,
    horizonteHoras: 240,
    nivel,
    base: nivel === 'sin_dato' ? 'sin_dato' : 'deterministico',
    metodo: nivel === 'sin_dato' ? 'sin_dato' : 'percentiles',
    probabilidadP95: null,
    probabilidadP99: null,
    precipitacionMm: nivel === 'sin_dato' ? null : 12,
    percentilReferencia: null,
    emitidoEn: '2026-10-17T18:00:00.000Z',
    validoHasta: '2026-10-27T00:00:00.000Z',
    versionRegla: 'peligro-v0.2',
    ...extra,
  }
}

const padron = (escuelas: EscuelaPadronV04[] | null): PuertoPadronV04 => ({ listarPadron: async () => escuelas })
const sinAltimetria: PuertoAltimetriaV04 = { obtener: async () => null }
const terrenoFijo = (t: InsumosTerrenoV04 | null): PuertoTerrenoV04 => ({ cargar: async () => t })

function terrenoConSerie(ultimaFecha: string): InsumosTerrenoV04 {
  return {
    catalogoVersion: 'catalogo-test',
    tramosVersion: 'tramos-test',
    estaciones: [],
    tramos: [],
    escuelas: new Map(),
    series: new Map([['est-1', [{ fecha: '2026-01-01', valorM: 2 }, { fecha: ultimaFecha, valorM: 2.1 }]]]),
    lecturasPrefectura: new Map(),
  }
}

async function runDe(runId: string) {
  const [run] = await getDb().select().from(infraRiskRun).where(eq(infraRiskRun.id, runId))
  return run
}

async function snapshotsDe(runId: string) {
  return getDb().select().from(infraRiskSnapshot).where(eq(infraRiskSnapshot.runId, runId))
}

type MetadatosOperativo = { reglas: string; degradacion: string[]; insumos: Record<string, unknown> }

describe('calcularYPublicarRiesgo con Motor v0.4 operativo', () => {
  it('publica un run motor-v0.4 operativo vigente con el mismo universo que v0.3', async () => {
    const resultado = await calcularYPublicarRiesgo({
      ahora: new Date('2026-10-18T00:30:00.000Z'),
      puertos: puertos(),
      padron: padron(PADRON),
      altimetria: sinAltimetria,
      terreno: terrenoFijo(terrenoConSerie('2026-10-17')),
    })
    expect(resultado.ejecutado).toBe(true)
    if (!resultado.ejecutado) throw new Error('unreachable')

    const run = await runDe(resultado.runId)
    expect(run).toMatchObject({ modeloVersion: 'motor-v0.4', modo: 'operativo', estado: 'vigente' })
    expect(run?.cobertura).toEqual({ procesadas: 6, conEvidencia: 6, sinEvidencia: 0 })
    expect((run?.metadatos as MetadatosOperativo).reglas).toBe('v0.4')

    const snapshots = await snapshotsDe(resultado.runId)
    expect(snapshots).toHaveLength(6)
    expect(new Set(snapshots.map((s) => s.cueAnexo))).toEqual(new Set([CUE_A, CUE_B]))
    for (const s of snapshots) {
      expect(s.nivelRiesgo).not.toBeNull()
      expect(s.resultadoV04).toMatchObject({ modeloVersion: 'motor-v0.4', modo: 'operativo', cueAnexo: s.cueAnexo })
    }
  })

  it('sin serie INA ni altimetría degrada al río v0.3 y publica igual, con el motivo en metadatos', async () => {
    const resultado = await calcularYPublicarRiesgo({
      ahora: new Date('2026-10-18T06:30:00.000Z'),
      puertos: puertos(),
      padron: padron(PADRON),
      altimetria: sinAltimetria,
      terreno: terrenoFijo(null),
    })
    if (!resultado.ejecutado) throw new Error('debió ejecutarse')
    const run = await runDe(resultado.runId)
    expect(run?.estado).toBe('vigente')
    const metadatos = run?.metadatos as MetadatosOperativo
    expect(metadatos.degradacion).toEqual(expect.arrayContaining(['terreno_no_disponible', 'altimetria_no_disponible']))
    expect(metadatos.insumos).toMatchObject({ conRioProbabilistico: 0 })
    expect(await snapshotsDe(resultado.runId)).toHaveLength(6)
  })

  it('una serie INA desactualizada se descarta (río v0.3) y queda informada', async () => {
    const resultado = await calcularYPublicarRiesgo({
      ahora: new Date('2026-10-18T12:30:00.000Z'),
      puertos: puertos(),
      padron: padron(PADRON),
      altimetria: sinAltimetria,
      terreno: terrenoFijo(terrenoConSerie('2026-09-01')),
    })
    if (!resultado.ejecutado) throw new Error('debió ejecutarse')
    const metadatos = (await runDe(resultado.runId))?.metadatos as MetadatosOperativo
    expect(metadatos.degradacion).toContain('serie_ina_desactualizada')
    expect(metadatos.insumos).toMatchObject({ estacionesDesactualizadas: ['est-1'] })
  })

  it('si el padrón o la carga de insumos lanzan, el run no cae: degrada y publica', async () => {
    const resultado = await calcularYPublicarRiesgo({
      ahora: new Date('2026-10-18T18:30:00.000Z'),
      puertos: puertos(),
      padron: { listarPadron: async () => { throw new Error('padrón caído') } },
      altimetria: { obtener: async () => { throw new Error('altimetría caída') } },
      terreno: { cargar: async () => { throw new Error('INA caída') } },
    })
    if (!resultado.ejecutado) throw new Error('debió ejecutarse')
    const run = await runDe(resultado.runId)
    expect(run).toMatchObject({ modeloVersion: 'motor-v0.4', estado: 'vigente' })
    expect((run?.metadatos as MetadatosOperativo).degradacion).toEqual(
      expect.arrayContaining(['padron_no_disponible', 'altimetria_no_disponible', 'terreno_no_disponible']),
    )
    // Sin padrón el universo sigue siendo el de perfiles: mismas 2 escuelas.
    const snapshots = await snapshotsDe(resultado.runId)
    expect(new Set(snapshots.map((s) => s.cueAnexo))).toEqual(new Set([CUE_A, CUE_B]))
  })

  it('sin dato de peligro a 240 h en alguna escuela lo informa en degradacion y en insumosDegradados', async () => {
    const resultado = await calcularYPublicarRiesgo({
      ahora: new Date('2026-10-19T06:30:00.000Z'),
      puertos: puertos(),
      padron: padron(PADRON),
      altimetria: sinAltimetria,
      terreno: terrenoFijo(terrenoConSerie('2026-10-17')),
    })
    if (!resultado.ejecutado) throw new Error('debió ejecutarse')
    const run = await runDe(resultado.runId)
    const metadatos = run?.metadatos as MetadatosOperativo
    expect(metadatos.degradacion).toContain('peligro_240h_sin_dato')
    expect(metadatos.degradacion).not.toContain('peligro_240h_respaldo')
    expect(metadatos.degradacion.length).toBeGreaterThan(0)
  })

  it('una celda que usó la ingesta de respaldo a 240 h lo informa en degradacion', async () => {
    const resultado = await calcularYPublicarRiesgo({
      ahora: new Date('2026-10-19T12:30:00.000Z'),
      puertos: puertos({
        [`g-${CUE_A}`]: [nivel240(`g-${CUE_A}`, 'amarillo', { respaldoIngestaPrevia: true })],
        [`g-${CUE_B}`]: [nivel240(`g-${CUE_B}`, 'verde')],
      }),
      padron: padron(PADRON),
      altimetria: sinAltimetria,
      terreno: terrenoFijo(terrenoConSerie('2026-10-17')),
    })
    if (!resultado.ejecutado) throw new Error('debió ejecutarse')
    const metadatos = (await runDe(resultado.runId))?.metadatos as MetadatosOperativo
    expect(metadatos.degradacion).toContain('peligro_240h_respaldo')
    expect(metadatos.degradacion).not.toContain('peligro_240h_sin_dato')
  })

  it('con peligro a 240 h completo y sin respaldo no informa motivos de peligro', async () => {
    const resultado = await calcularYPublicarRiesgo({
      ahora: new Date('2026-10-19T18:30:00.000Z'),
      puertos: puertos({
        [`g-${CUE_A}`]: [nivel240(`g-${CUE_A}`, 'amarillo')],
        [`g-${CUE_B}`]: [nivel240(`g-${CUE_B}`, 'verde')],
      }),
      padron: padron(PADRON),
      altimetria: sinAltimetria,
      terreno: terrenoFijo(terrenoConSerie('2026-10-17')),
    })
    if (!resultado.ejecutado) throw new Error('debió ejecutarse')
    const metadatos = (await runDe(resultado.runId))?.metadatos as MetadatosOperativo
    expect(metadatos.degradacion).not.toContain('peligro_240h_respaldo')
    expect(metadatos.degradacion).not.toContain('peligro_240h_sin_dato')
  })

  it('RIESGO_REGLAS_MOTOR=v0.3 vuelve al operativo motor-v0.3 sin detalle v0.4', async () => {
    process.env.RIESGO_REGLAS_MOTOR = 'v0.3'
    try {
      const resultado = await calcularYPublicarRiesgo({ ahora: new Date('2026-10-19T00:30:00.000Z'), puertos: puertos() })
      if (!resultado.ejecutado) throw new Error('debió ejecutarse')
      const run = await runDe(resultado.runId)
      expect(run).toMatchObject({ modeloVersion: 'motor-v0.3', modo: 'operativo', estado: 'vigente', metadatos: null })
      for (const s of await snapshotsDe(resultado.runId)) expect(s.resultadoV04).toBeNull()
    } finally {
      delete process.env.RIESGO_REGLAS_MOTOR
    }
  })
})
