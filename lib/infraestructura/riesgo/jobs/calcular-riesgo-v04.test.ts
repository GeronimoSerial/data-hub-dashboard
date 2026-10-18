import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { and, eq, gte, lt } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { infraJobRun, infraPeriodo, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { esquemaMetadatosRunV04, esquemaResultadoEscuelaV04 } from '../motor-v04/contratos'
import type { EscuelaPadronV04, PuertoPadronV04 } from '../motor-v04/padron'
import type { calcularRiesgoCandidatoV04 as CalcularRiesgoCandidatoV04 } from './calcular-riesgo-v04'

usarDbTemporal('calcular-riesgo-v04-')

let calcularRiesgoCandidatoV04: typeof CalcularRiesgoCandidatoV04
let runOperativoId: string

const CON_COORD_A: EscuelaPadronV04 = { cueAnexo: '1800001-00', motivoUbicacion: null }
const CON_COORD_B: EscuelaPadronV04 = { cueAnexo: '1800002-00', motivoUbicacion: null }
const SIN_COORD: EscuelaPadronV04 = { cueAnexo: '1800003-00', motivoUbicacion: 'sin_coordenadas' }
const PADRON = [CON_COORD_A, CON_COORD_B, SIN_COORD]

function padronFake(escuelas: EscuelaPadronV04[] | null): PuertoPadronV04 {
  return { listarPadron: async () => escuelas }
}

beforeAll(async () => {
  ;({ calcularRiesgoCandidatoV04 } = await import('./calcular-riesgo-v04'))
  // Un run operativo v0.3 vigente preexistente: el candidato no debe tocarlo.
  const [periodo] = await getDb().select().from(infraPeriodo).where(eq(infraPeriodo.estado, 'vigente')).limit(1)
  if (!periodo) throw new Error('la siembra no dejó período vigente')
  runOperativoId = randomUUID()
  await getDb().insert(infraRiskRun).values({
    id: runOperativoId,
    periodoId: periodo.id,
    modeloVersion: 'motor-v0.3',
    iniciadoEn: '2026-10-17T12:00:00.000Z',
    publicadoEn: '2026-10-17T12:05:00.000Z',
    estado: 'vigente',
    cobertura: { procesadas: 3 },
    creadaEn: '2026-10-17T12:00:00.000Z',
  })
})

async function vigentes() {
  return getDb().select().from(infraRiskRun).where(eq(infraRiskRun.estado, 'vigente'))
}

// Runs candidatos iniciados dentro del bloque de 6 h [desde, desde + 6 h).
async function candidatosDelBloque(desde: string) {
  const hasta = new Date(new Date(desde).getTime() + 6 * 3600 * 1000).toISOString()
  return getDb()
    .select()
    .from(infraRiskRun)
    .where(and(eq(infraRiskRun.modo, 'candidato'), gte(infraRiskRun.iniciadoEn, desde), lt(infraRiskRun.iniciadoEn, hasta)))
}

async function snapshotsDe(runId: string) {
  return getDb().select().from(infraRiskSnapshot).where(eq(infraRiskSnapshot.runId, runId))
}

async function jobRunDelBloque(claveIdempotente: string) {
  const [fila] = await getDb()
    .select()
    .from(infraJobRun)
    .where(and(eq(infraJobRun.tipo, 'calcular-riesgo-v04-candidato'), eq(infraJobRun.claveIdempotente, claveIdempotente)))
  return fila
}

describe('calcularRiesgoCandidatoV04', () => {
  it('completa un candidato con el universo completo (3 escuelas × 3 horizontes) sin tocar el vigente', async () => {
    const ahora = new Date('2026-10-17T18:30:00.000Z')
    const resultado = await calcularRiesgoCandidatoV04({ ahora, padron: padronFake(PADRON) })

    expect(resultado).toMatchObject({ ejecutado: true, resultadosEmitidos: 9 })
    if (!resultado.ejecutado) throw new Error('unreachable')

    const [run] = await getDb().select().from(infraRiskRun).where(eq(infraRiskRun.id, resultado.runId))
    expect(run).toMatchObject({ estado: 'completado', modo: 'candidato', modeloVersion: 'motor-v0.4', publicadoEn: null })
    const metadatos = esquemaMetadatosRunV04.parse(run?.metadatos)
    expect(metadatos.asOf).toBe(ahora.toISOString())
    expect(metadatos.estadoCalibracionEscolar).toBe('pendiente')
    expect(metadatos.cobertura).toMatchObject({
      totalPadron: 3,
      conCoordenadas: 2,
      sinUbicacionUtilizable: 1,
      resultadosEsperados: 9,
      resultadosEmitidos: 9,
    })
    expect(metadatos.cobertura.abstencionesPorMotivo.sin_coordenadas).toBeGreaterThan(0)
    expect(metadatos.cobertura.porEventoHorizonte).toHaveLength(2 * 2 * 3)

    const snapshots = await snapshotsDe(resultado.runId)
    expect(snapshots).toHaveLength(9)
    const claves = new Set(snapshots.map((s) => `${s.cueAnexo}|${s.horizonteHoras}`))
    for (const escuela of PADRON) {
      for (const h of [24, 72, 240]) expect(claves.has(`${escuela.cueAnexo}|${h}`)).toBe(true)
    }

    const sinCoord = snapshots.filter((s) => s.cueAnexo === SIN_COORD.cueAnexo)
    for (const s of sinCoord) {
      const r = esquemaResultadoEscuelaV04.parse(s.resultadoV04)
      expect(r.ubicacion).toEqual({ estado: 'sin_coordenadas', motivos: ['sin_coordenadas'] })
      expect(r.superacionTerreno.principal.motivos).toContain('sin_coordenadas')
    }

    const vigentesDespues = await vigentes()
    expect(vigentesDespues.map((v) => v.id)).toEqual([runOperativoId])
  })

  it('null nunca se convierte en 0: probabilidades nulas y scores heredados sin valor', async () => {
    const [run] = await candidatosDelBloque('2026-10-17T18:00:00.000Z')
    if (!run) throw new Error('falta el candidato del test anterior')
    for (const s of await snapshotsDe(run.id)) {
      const r = esquemaResultadoEscuelaV04.parse(s.resultadoV04)
      for (const evento of [r.superacionTerreno, r.interrupcionEducativa]) {
        for (const e of [evento.principal, evento.conservador]) {
          expect(e).toMatchObject({ probabilidad: null, estado: 'no_estimable' })
          expect(e.motivos.length).toBeGreaterThan(0)
        }
      }
      expect(r.cotaIngresoEdificio).toEqual({ valorM: null, motivo: 'umbral_ingreso_no_disponible' })
      expect(s).toMatchObject({
        evidenciaValida: false,
        scoreRiesgo: null,
        nivelRiesgo: null,
        scoreAmenaza: null,
        nivelAmenaza: null,
        scoreVulnerabilidad: null,
        scoreRiesgoAcceso: null,
        nivelRiesgoAcceso: null,
        exposicionMatricula: null,
      })
    }
  })

  it('reintentar en el mismo bloque no duplica corrida ni filas', async () => {
    const ahora = new Date('2026-10-17T19:45:00.000Z')
    const resultado = await calcularRiesgoCandidatoV04({ ahora, padron: padronFake(PADRON) })
    expect(resultado).toEqual({ ejecutado: false, motivo: 'ya_completado' })
    const runs = await candidatosDelBloque('2026-10-17T18:00:00.000Z')
    expect(runs).toHaveLength(1)
    expect(await snapshotsDe(runs[0]!.id)).toHaveLength(9)
  })

  it('una falla a mitad de escritura marca fallido, no completa nada y el reintento completa una sola vez', async () => {
    const bloque = '2026-10-18T00:00:00.000Z'
    // CUE duplicado en el padrón: el índice único (run, cue, horizonte) corta
    // la escritura después de crear el run.
    const padronRoto = [CON_COORD_A, SIN_COORD, CON_COORD_A]
    await expect(
      calcularRiesgoCandidatoV04({ ahora: new Date('2026-10-18T00:30:00.000Z'), padron: padronFake(padronRoto) }),
    ).rejects.toThrow()

    const trasFalla = await candidatosDelBloque(bloque)
    expect(trasFalla.map((r) => r.estado)).toEqual(['fallido'])
    expect((await jobRunDelBloque(bloque))?.estado).toBe('fallido')
    expect((await vigentes()).map((v) => v.id)).toEqual([runOperativoId])

    const reintento = await calcularRiesgoCandidatoV04({
      ahora: new Date('2026-10-18T01:00:00.000Z'),
      padron: padronFake(PADRON),
    })
    expect(reintento.ejecutado).toBe(true)
    const completados = (await candidatosDelBloque(bloque)).filter((r) => r.estado === 'completado')
    expect(completados).toHaveLength(1)
    expect(await snapshotsDe(completados[0]!.id)).toHaveLength(9)
    expect((await jobRunDelBloque(bloque))?.estado).toBe('completado')
    expect((await vigentes()).map((v) => v.id)).toEqual([runOperativoId])
  })

  it('sin padrón disponible no crea corrida y deja el job en fallido', async () => {
    const bloque = '2026-10-18T06:00:00.000Z'
    const resultado = await calcularRiesgoCandidatoV04({
      ahora: new Date('2026-10-18T06:10:00.000Z'),
      padron: padronFake(null),
    })
    expect(resultado).toEqual({ ejecutado: false, motivo: 'padron_no_disponible' })
    expect(await candidatosDelBloque(bloque)).toHaveLength(0)
    expect((await jobRunDelBloque(bloque))?.estado).toBe('fallido')
  })
})
