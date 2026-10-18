import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { and, eq, gte, lt } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { infraJobRun, infraPeriodo, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { esquemaMetadatosRunV04, esquemaResultadoEscuelaV04 } from '../motor-v04/contratos'
import type { PuertoAltimetriaV04 } from '../motor-v04/altimetria-adaptador'
import type { EscuelaPadronV04, PuertoPadronV04 } from '../motor-v04/padron'
import { crearAdapterTerrenoV04 } from '../motor-v04/terreno-adaptador'
import { guardarLoteSerieDiaria } from '@/lib/infraestructura/hidrometria/ina/serie-diaria-repo'
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

  it('carga la altimetría como insumo sin calcular probabilidades y la refleja en contadores e insumosHash', async () => {
    const ahora = new Date('2026-10-18T12:10:00.000Z')
    const altimetria: PuertoAltimetriaV04 = {
      obtener: async (cues) => ({
        version: 'altimetria-v04-prueba',
        porCue: new Map(
          cues.map((c) => [
            c,
            c === CON_COORD_A.cueAnexo
              ? {
                  estado: 'candidata' as const,
                  cotaPrincipalM: 60.5,
                  cotaConservadoraM: 60.1,
                  fuenteConservadora: 'ign' as const,
                  fuentesValidas: 2 as const,
                  referenciaVertical: 'SRVN16_con_conversion_aproximada_de_Copernicus',
                  operador: 'p10_espacial_50m',
                  motivos: [],
                }
              : null,
          ]),
        ),
      }),
    }
    const conAlt = await calcularRiesgoCandidatoV04({ ahora, padron: padronFake(PADRON), altimetria })
    if (!conAlt.ejecutado) throw new Error('se esperaba ejecución')
    const [job] = await getDb()
      .select()
      .from(infraJobRun)
      .where(and(eq(infraJobRun.tipo, 'calcular-riesgo-v04-candidato'), eq(infraJobRun.claveIdempotente, '2026-10-18T12:00:00.000Z')))
    expect(job?.contadores).toMatchObject({ conAltimetria: 1 })
    const snapshots = await snapshotsDe(conAlt.runId)
    for (const s of snapshots) {
      const r = esquemaResultadoEscuelaV04.parse(s.resultadoV04)
      expect(r.superacionTerreno.principal.probabilidad).toBeNull()
    }
  })

  it('modela la superación del terreno dentro del tramo interpolable y abstiene con motivo fuera de él', async () => {
    // Dos hidrómetros con historia diaria sintética corta (≈ 2 años) en PGlite.
    const desde = Date.parse('2024-09-01T00:00:00Z')
    const hasta = Date.parse('2026-10-19T00:00:00Z')
    for (const [estacionId, serieId, desplazamiento] of [['pna-corrientes', 19, 0], ['pna-empedrado', 21, -0.5]] as const) {
      const filas = []
      for (let ms = desde, i = 0; ms <= hasta; ms += 86_400_000, i++) {
        filas.push({ fecha: new Date(ms).toISOString().slice(0, 10), valorM: 4 + desplazamiento + 2 * Math.sin((2 * Math.PI * i) / 365) + 0.8 * Math.sin((2 * Math.PI * i) / 9) })
      }
      await guardarLoteSerieDiaria(getDb(), {
        estacionId, serieId, url: `https://alerta.ina.gob.ar/a5/obs/puntual/series/${serieId}/observaciones`,
        payload: [{ estacionId }], sha256: (estacionId === 'pna-corrientes' ? 'c' : 'e').repeat(64), descargadoEn: '2026-10-19T12:00:00.000Z', filas,
      })
    }
    const DENTRO: EscuelaPadronV04 = { cueAnexo: '1800011-00', motivoUbicacion: null }
    const FUERA: EscuelaPadronV04 = { cueAnexo: '1800012-00', motivoUbicacion: null }
    const SIN: EscuelaPadronV04 = { cueAnexo: '1800013-00', motivoUbicacion: 'sin_coordenadas' }
    const terreno = crearAdapterTerrenoV04({
      escuelas: async () => new Map([
        // 40 % del segmento Corrientes–Empedrado.
        [DENTRO.cueAnexo, { localidad: 'Riachuelo', lat: -27.46 + 0.4 * (-27.958948 + 27.46), lon: -58.84 + 0.4 * (-58.820198 + 58.84) }],
        // Localidad del tramo Corrientes, pero aguas arriba de la estación.
        [FUERA.cueAnexo, { localidad: 'CORRIENTES', lat: -27.3, lon: -58.85 }],
      ]),
    })
    const cota = { cotaPrincipalM: 46, cotaConservadoraM: 45.5 }
    const altimetria: PuertoAltimetriaV04 = {
      obtener: async (cues) => ({
        version: 'altimetria-v04-prueba',
        porCue: new Map(cues.map((c) => [c, c === SIN.cueAnexo ? null : {
          estado: 'candidata' as const, ...cota, fuenteConservadora: 'ign' as const, fuentesValidas: 2 as const,
          referenciaVertical: 'SRVN16_con_conversion_aproximada_de_Copernicus', operador: 'p10_espacial_50m', motivos: [],
        }])),
      }),
    }
    const resultado = await calcularRiesgoCandidatoV04({
      ahora: new Date('2026-10-19T12:10:00.000Z'), padron: padronFake([DENTRO, FUERA, SIN]), altimetria, terreno,
    })
    if (!resultado.ejecutado) throw new Error('se esperaba ejecución')
    const porCue = new Map<string, ReturnType<typeof esquemaResultadoEscuelaV04.parse>[]>()
    for (const s of await snapshotsDe(resultado.runId)) {
      const r = esquemaResultadoEscuelaV04.parse(s.resultadoV04)
      porCue.set(r.cueAnexo, [...(porCue.get(r.cueAnexo) ?? []), r])
    }
    for (const r of porCue.get(DENTRO.cueAnexo)!) {
      for (const e of [r.superacionTerreno.principal, r.superacionTerreno.conservador]) {
        expect(e).toMatchObject({ estado: 'modelada', metodo: 'analogos-v2+transferencia-km' })
        expect(e.diagnostico).toMatchObject({ datumCeroSupuesto: true, estacionReferencia: 'pna-corrientes', estacionCompanera: 'pna-empedrado' })
      }
      expect(r.superacionTerreno.conservador.probabilidad!).toBeGreaterThanOrEqual(r.superacionTerreno.principal.probabilidad!)
      expect(r.interrupcionEducativa.principal.estado).toBe('no_estimable')
    }
    for (const r of porCue.get(FUERA.cueAnexo)!) {
      expect(r.superacionTerreno.principal).toMatchObject({ estado: 'no_estimable', probabilidad: null, motivos: ['fuera_de_tramo_interpolable'] })
    }
    for (const r of porCue.get(SIN.cueAnexo)!) {
      expect(r.superacionTerreno.principal).toMatchObject({ estado: 'no_estimable', probabilidad: null })
      expect(r.superacionTerreno.principal.motivos[0]).toBe('sin_coordenadas')
    }
    const [run] = await getDb().select().from(infraRiskRun).where(eq(infraRiskRun.id, resultado.runId))
    const { cobertura } = esquemaMetadatosRunV04.parse(run?.metadatos)
    expect(cobertura.abstencionesPorMotivo.fuera_de_tramo_interpolable).toBe(6)
    expect(cobertura.porEventoHorizonte.find((c) => c.evento === 'superacionTerreno' && c.escenario === 'principal' && c.horizonteHoras === 240)?.modeladas).toBe(1)
  })
})
