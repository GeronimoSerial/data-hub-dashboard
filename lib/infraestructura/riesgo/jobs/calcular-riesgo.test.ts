import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraJobRun, infraPeriodo, infraRiskFactor, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { crearPuertosFake, type EscenarioFake } from '../motor/__fixtures__/puertos-fake'
import type {
  NivelCaudalPunto,
  NivelPeligro,
  NivelPeligroCelda,
  PerfilTerritorio,
} from '../motor/puertos'
import type { calcularYPublicarRiesgo as CalcularYPublicarRiesgo } from './calcular-riesgo'
import type { calcularFilasEscuela as CalcularFilasEscuela, crearPuertosConCache as CrearPuertosConCache } from './compartido-riesgo'

usarDbTemporal('calcular-riesgo-')

// Rollback de un ciclo (RIESGO_REGLAS_MOTOR=v0.3, docs/motor-v0.4/promocion.md):
// este archivo fija el flag para verificar que el job operativo con reglas v0.3
// se comporta exactamente como el motor-v0.3 previo a la promoción. El camino
// v0.4 (default) se prueba en calcular-riesgo-operativo-v04.test.ts.
const reglasOriginales = process.env.RIESGO_REGLAS_MOTOR

beforeAll(async () => {
  process.env.RIESGO_REGLAS_MOTOR = 'v0.3'
  ;({ calcularYPublicarRiesgo } = await import('./calcular-riesgo'))
  ;({ calcularFilasEscuela, crearPuertosConCache } = await import('./compartido-riesgo'))
})

afterAll(() => {
  if (reglasOriginales === undefined) delete process.env.RIESGO_REGLAS_MOTOR
  else process.env.RIESGO_REGLAS_MOTOR = reglasOriginales
})

let calcularYPublicarRiesgo: typeof CalcularYPublicarRiesgo
let calcularFilasEscuela: typeof CalcularFilasEscuela
let crearPuertosConCache: typeof CrearPuertosConCache

const CUE_A = '1800001-00'
const CUE_B = '1800002-00'
const CUE_C = '1800003-00'
const GEOM_A = 'geom-a'
const GEOM_B = 'geom-b'
const GEOM_C = 'geom-c'
const RIO_A = 'rio-1'

const ASOF_PELIGRO = '2026-09-20T06:00:00.000Z'
const ASOF_VALIDEZ = '2026-09-30T00:00:00.000Z'

function perfil(cueAnexo: string, geometryRef: string, puntoRioId: string | null = null): PerfilTerritorio {
  return { cueAnexo, geometryRef, departamento: 'Corrientes', puntoRioId, motivoExclusion: null }
}

function celda(geometryRef: string, horizonteHoras: 24 | 72 | 240, nivel: NivelPeligro): NivelPeligroCelda {
  return {
    geometryRef,
    horizonteHoras,
    nivel,
    base: 'ensemble',
    probabilidadP95: null,
    probabilidadP99: null,
    precipitacionMm: null,
    percentilReferencia: null,
    emitidoEn: ASOF_PELIGRO,
    validoHasta: ASOF_VALIDEZ,
    versionRegla: 'regla-v1',
  }
}

function caudal(puntoId: string): NivelCaudalPunto {
  return {
    puntoId,
    percentilActual: null,
    nivel: 'amarillo',
    emitidoEn: ASOF_PELIGRO,
    validoHasta: ASOF_VALIDEZ,
  }
}

// Escenario de 3 escuelas con perfil válido: A con evidencia de peligro y
// caudal, B con evidencia de lluvia observada, C SIN evidencia de amenaza
// (ni peligro, ni caudal, ni lluvia) para ejercitar el contador sinEvidencia.
function escenario(): EscenarioFake {
  return {
    territorio: {
      [CUE_A]: perfil(CUE_A, GEOM_A, RIO_A),
      [CUE_B]: perfil(CUE_B, GEOM_B),
      [CUE_C]: perfil(CUE_C, GEOM_C),
    },
    peligro: {
      [GEOM_A]: [
        celda(GEOM_A, 24, 'naranja'),
        celda(GEOM_A, 72, 'naranja'),
        celda(GEOM_A, 240, 'naranja'),
      ],
    },
    caudal: { [RIO_A]: caudal(RIO_A) },
    lluvia24h: { [GEOM_B]: 30 },
    lluvia72h: { [GEOM_B]: 80 },
  }
}

describe('calcularYPublicarRiesgo', () => {
  it('T1: corrida normal publica un único run vigente con escuelas x 3 horizontes y factores', async () => {
    const db = getDb()

    const ahora = new Date('2026-09-26T12:30:00.000Z')
    const resultado = await calcularYPublicarRiesgo({ ahora, puertos: crearPuertosFake(escenario()) })

    expect(resultado.ejecutado).toBe(true)
    if (!resultado.ejecutado) throw new Error('unreachable')
    expect(resultado.escuelasProcesadas).toBe(9)
    expect(resultado.conEvidencia).toBe(6)
    expect(resultado.sinEvidencia).toBe(3)
    expect(resultado.conEvidencia + resultado.sinEvidencia).toBe(resultado.escuelasProcesadas)

    const vigentes = await db.select().from(infraRiskRun).where(eq(infraRiskRun.estado, 'vigente'))
    expect(vigentes).toHaveLength(1)
    expect(vigentes[0]?.id).toBe(resultado.runId)
    expect(vigentes[0]?.modeloVersion).toBe('motor-v0.3')
    expect(vigentes[0]?.cobertura).toEqual({ procesadas: 9, conEvidencia: 6, sinEvidencia: 3 })
    expect(vigentes[0]?.modo).toBe('operativo')
    // Byte a byte como motor-v0.3: sin metadatos v0.4 ni detalle por escuela.
    expect(vigentes[0]?.metadatos).toBeNull()

    const snapshots = await db
      .select()
      .from(infraRiskSnapshot)
      .where(eq(infraRiskSnapshot.runId, resultado.runId))
    expect(snapshots).toHaveLength(9)
    for (const snapshot of snapshots) expect(snapshot.resultadoV04).toBeNull()

    // Golden v0.3: cada fila coincide con el cálculo compartido con reglas
    // v0.3 por defecto, que es exactamente lo que escribía el job antes de la
    // promoción (ids aparte).
    const puertosGolden = crearPuertosConCache(crearPuertosFake(escenario()))
    for (const snapshot of snapshots) {
      const { snapshot: esperado } = await calcularFilasEscuela({
        runId: resultado.runId,
        cueAnexo: snapshot.cueAnexo,
        horizonte: snapshot.horizonteHoras as 24 | 72 | 240,
        asOf: ahora.toISOString(),
        puertos: puertosGolden,
      })
      const { id: _a, ...restoReal } = snapshot
      const { id: _b, ...restoEsperado } = esperado
      expect(restoReal).toMatchObject(restoEsperado)
    }

    // I-7b: la amenaza se persiste por separado de la prioridad. Con evidencia
    // de amenaza, score y nivel van juntos; sin evidencia (C), ambos null.
    for (const snapshot of snapshots) {
      if (snapshot.cueAnexo === CUE_C) {
        expect(snapshot.scoreAmenaza).toBeNull()
        expect(snapshot.nivelAmenaza).toBeNull()
      } else {
        expect(snapshot.scoreAmenaza).not.toBeNull()
        expect(['bajo', 'moderado', 'alto', 'muy_alto']).toContain(snapshot.nivelAmenaza)
      }
    }

    const idsDelRun = new Set(snapshots.map((snapshot) => snapshot.id))
    const factores = await db.select().from(infraRiskFactor)
    const factoresPorSnapshot = new Map<string, number>()
    for (const factor of factores) {
      if (!idsDelRun.has(factor.snapshotId)) continue
      factoresPorSnapshot.set(factor.snapshotId, (factoresPorSnapshot.get(factor.snapshotId) ?? 0) + 1)
    }
    for (const snapshot of snapshots) {
      expect(factoresPorSnapshot.get(snapshot.id) ?? 0).toBeGreaterThan(0)
    }
  })

  it('T2: repetir con el mismo bloque de 6h no adquiere lease y conserva el run vigente', async () => {
    const db = getDb()

    const antes = await db.select().from(infraRiskRun).where(eq(infraRiskRun.estado, 'vigente'))
    expect(antes).toHaveLength(1)
    const runVigenteAntes = antes[0]?.id

    const ahora = new Date('2026-09-26T12:30:00.000Z') // MISMO bloque 12-18
    const resultado = await calcularYPublicarRiesgo({ ahora, puertos: crearPuertosFake(escenario()) })

    expect(resultado).toEqual({ ejecutado: false, motivo: 'ya_completado' })

    const despues = await db.select().from(infraRiskRun).where(eq(infraRiskRun.estado, 'vigente'))
    expect(despues).toHaveLength(1)
    expect(despues[0]?.id).toBe(runVigenteAntes)
  })

  it('T3: publicar un run de otro bloque marca vencido el anterior y nunca deja 2 vigentes', async () => {
    const db = getDb()

    const primero = await calcularYPublicarRiesgo({
      ahora: new Date('2026-09-27T00:30:00.000Z'), // bloque 00-06
      puertos: crearPuertosFake(escenario()),
    })
    expect(primero.ejecutado).toBe(true)
    if (!primero.ejecutado) throw new Error('unreachable')

    const segundo = await calcularYPublicarRiesgo({
      ahora: new Date('2026-09-27T06:30:00.000Z'), // bloque 06-12
      puertos: crearPuertosFake(escenario()),
    })
    expect(segundo.ejecutado).toBe(true)
    if (!segundo.ejecutado) throw new Error('unreachable')
    expect(segundo.runId).not.toBe(primero.runId)

    const vigentes = await db.select().from(infraRiskRun).where(eq(infraRiskRun.estado, 'vigente'))
    expect(vigentes).toHaveLength(1)
    expect(vigentes[0]?.id).toBe(segundo.runId)

    const [runViejo] = await db.select().from(infraRiskRun).where(eq(infraRiskRun.id, primero.runId))
    expect(runViejo?.estado).toBe('vencido')
  })

  it('T4: sin periodo vigente el job lanza y deja el infra_job_run en fallido, no en_progreso', async () => {
    const db = getDb()

    await db.update(infraPeriodo).set({ estado: 'historico' }).where(eq(infraPeriodo.estado, 'vigente'))

    const ahora = new Date('2026-09-27T12:30:00.000Z') // bloque 12-18

    await expect(
      calcularYPublicarRiesgo({ ahora, puertos: crearPuertosFake(escenario()) }),
    ).rejects.toThrow()

    const [jobRun] = await db
      .select()
      .from(infraJobRun)
      .where(
        and(
          eq(infraJobRun.tipo, 'calcular-riesgo-v0'),
          eq(infraJobRun.claveIdempotente, '2026-09-27T12:00:00.000Z'),
        ),
      )
    expect(jobRun?.estado).toBe('fallido')
    expect(jobRun?.errorSaneado).toBe('sin periodo vigente')
  })

  it('T5: una excepción DESPUÉS de insertar el run deja el infraRiskRun en fallido, no preparando', async () => {
    const db = getDb()

    // T4 dejó el período en 'historico'; restaurar uno vigente para que este
    // test alcance el insert del run antes de fallar.
    const [historico] = await db
      .select()
      .from(infraPeriodo)
      .where(eq(infraPeriodo.estado, 'historico'))
      .limit(1)
    if (historico) {
      await db.update(infraPeriodo).set({ estado: 'vigente' }).where(eq(infraPeriodo.id, historico.id))
    }

    // La excepción ocurre al listar CUEs, es decir DESPUÉS de que el run ya
    // fue insertado en 'preparando'.
    const base = crearPuertosFake(escenario())
    const puertosQueFallas: typeof base = {
      ...base,
      territorio: {
        ...base.territorio,
        async listarCuesConPerfil() {
          throw new Error('fallo inyectado tras insertar el run')
        },
      },
    }

    const ahora = new Date('2026-09-27T18:30:00.000Z') // bloque 18-24

    await expect(calcularYPublicarRiesgo({ ahora, puertos: puertosQueFallas })).rejects.toThrow()

    const runsDelBloque = await db
      .select()
      .from(infraRiskRun)
      .where(eq(infraRiskRun.iniciadoEn, ahora.toISOString()))
    expect(runsDelBloque).toHaveLength(1)
    expect(runsDelBloque[0]?.estado).toBe('fallido')
  })
})
