// Tests del recomputo de episodios derivados contra una base libsql real,
// aislada en un tmpdir (mismo patrón que scripts/job-diagnostico.test.ts y
// lib/infraestructura/verificaciones.test.ts): DATA_DIR a un tmpdir,
// ensureSeeded() una vez y getDb() memoizado. La base es un archivo por worker
// de vitest, así que cada archivo de test arranca limpio.
//
// Un único directorio para TODO el archivo, no uno por test: getDb() memoiza
// la conexión en el primer uso, así que un directorio nuevo por test dejaría a
// los tests siguientes hablándole a una base ya borrada.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import {
  infraAfectacion,
  infraEpisodioDerivado,
  infraEpisodioMiembro,
  infraGeoProfile,
  infraMovimiento,
  infraParte,
  infraPeriodo,
} from '@/lib/db/schema'
import { PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { recomputarEpisodiosDerivados } from './recompute'

usarDbTemporal('recompute-episodios-')

beforeAll(async () => {
  const db = getDb()
  await db
    .update(infraPeriodo)
    .set({ estado: 'historico' })
    .where(eq(infraPeriodo.id, PERIODO_ENOS_2026_2027_ID))
  await db.insert(infraPeriodo).values({
    id: PERIODO_ID,
    nombre: 'Período episodios test',
    inicioEn: '2026-01-01T00:00:00.000Z',
    finEn: null,
    estado: 'vigente',
    creadaEn: '2026-01-01T00:00:00.000Z',
  })
})

// Período vigente propio del test. ensureSeeded() ya siembra uno 'vigente'
// (índice único parcial sobre estado), así que primero lo pasamos a
// 'historico' y sembramos manualmente el nuestro.
const PERIODO_ID = 'periodo-episodios-test'

const AS_OF = '2026-03-15T00:00:00.000Z'
const RIGE_DESDE_VALIDO = '2026-03-10T00:00:00.000Z'
// Distinto rigeDesde: el movimiento NO debe matchear (la resolución es exacta).
const RIGE_DESDE_MOVIMIENTO_DISTINTO = '2026-03-11T00:00:00.000Z'

const DEPARTAMENTO = 'PARANA'
const CUE_CON_MOVIMIENTO = '1801605-01'
const CUE_SIN_MOVIMIENTO = '1801605-02'
const CUE_EXCLUIDA_POR_MOTIVO = '1801605-03'
const CUE_SIN_PERFIL = '1801605-04'

let idMovimientoEsperado: string

async function limpiar(): Promise<void> {
  const db = getDb()
  await db.delete(infraEpisodioMiembro)
  await db.delete(infraEpisodioDerivado)
  await db.delete(infraMovimiento)
  await db.delete(infraAfectacion)
  await db.delete(infraParte)
  await db.delete(infraGeoProfile)
}

async function crearParteConAfectacion(cueAnexo: string): Promise<string> {
  const db = getDb()
  const parteId = randomUUID()
  await db.insert(infraParte).values({
    id: parteId,
    periodoId: PERIODO_ID,
    cueAnexo,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: RIGE_DESDE_VALIDO,
    corteId: 1,
    creadaEn: RIGE_DESDE_VALIDO,
    actualizadaEn: RIGE_DESDE_VALIDO,
  })
  await db.insert(infraAfectacion).values({
    id: randomUUID(),
    parteId,
    motivo: 'Inundación',
    categoria: 'establecimiento',
    severidad: 'Alta',
    rigeDesde: RIGE_DESDE_VALIDO,
    creadaEn: RIGE_DESDE_VALIDO,
    retiradaEn: null,
  })
  return parteId
}

async function sembrarFixture(): Promise<void> {
  await limpiar()
  const db = getDb()

  const parteConMovimiento = await crearParteConAfectacion(CUE_CON_MOVIMIENTO)
  const parteSinMovimiento = await crearParteConAfectacion(CUE_SIN_MOVIMIENTO)
  await crearParteConAfectacion(CUE_EXCLUIDA_POR_MOTIVO)
  await crearParteConAfectacion(CUE_SIN_PERFIL)

  await db.insert(infraGeoProfile).values([
    {
      cueAnexo: CUE_CON_MOVIMIENTO,
      departamento: DEPARTAMENTO,
      motivoExclusion: null,
      perfilVersion: 'geo-perfil-v1',
      calculadoEn: RIGE_DESDE_VALIDO,
    },
    {
      cueAnexo: CUE_SIN_MOVIMIENTO,
      departamento: DEPARTAMENTO,
      motivoExclusion: null,
      perfilVersion: 'geo-perfil-v1',
      calculadoEn: RIGE_DESDE_VALIDO,
    },
    {
      // Perfil inválido: aunque tenga departamento, motivoExclusion no null la excluye.
      cueAnexo: CUE_EXCLUIDA_POR_MOTIVO,
      departamento: 'CONCORDIA',
      motivoExclusion: 'sin_coordenadas',
      perfilVersion: 'geo-perfil-v1',
      calculadoEn: RIGE_DESDE_VALIDO,
    },
    // CUE_SIN_PERFIL no tiene fila: departamento null en el left join.
  ])

  idMovimientoEsperado = randomUUID()
  await db.insert(infraMovimiento).values([
    {
      id: idMovimientoEsperado,
      parteId: parteConMovimiento,
      tipo: 'reporte_inicial',
      rol: 'director',
      resumen: {},
      rigeDesde: RIGE_DESDE_VALIDO,
      creadaEn: RIGE_DESDE_VALIDO,
      idempotencyKey: null,
    },
    {
      // Mismo parte, rigeDesde distinto: no debe resolver.
      id: randomUUID(),
      parteId: parteSinMovimiento,
      tipo: 'reporte_inicial',
      rol: 'director',
      resumen: {},
      rigeDesde: RIGE_DESDE_MOVIMIENTO_DISTINTO,
      creadaEn: RIGE_DESDE_MOVIMIENTO_DISTINTO,
      idempotencyKey: null,
    },
  ])
}

type EpisodioNormalizado = {
  reglaVersion: string
  unidadTipo: string
  unidadId: string
  inicioEn: string
  finEn: string | null
  estado: string
  escuelasAfectadas: number
  miembros: {
    cueAnexo: string
    movimientoId: string | null
    primeraAfectacionEn: string
    recuperadoEn: string | null
  }[]
}

async function leerEpisodiosNormalizados(): Promise<EpisodioNormalizado[]> {
  const db = getDb()
  const episodios = await db.select().from(infraEpisodioDerivado)
  const miembros = await db.select().from(infraEpisodioMiembro)

  return episodios
    .map((episodio) => ({
      reglaVersion: episodio.reglaVersion,
      unidadTipo: episodio.unidadTipo,
      unidadId: episodio.unidadId,
      inicioEn: episodio.inicioEn,
      finEn: episodio.finEn,
      estado: episodio.estado,
      escuelasAfectadas: episodio.escuelasAfectadas,
      miembros: miembros
        .filter((m) => m.episodioDerivadoId === episodio.id)
        .map((m) => ({
          cueAnexo: m.cueAnexo,
          movimientoId: m.movimientoId,
          primeraAfectacionEn: m.primeraAfectacionEn,
          recuperadoEn: m.recuperadoEn,
        }))
        .sort((a, b) => a.cueAnexo.localeCompare(b.cueAnexo)),
    }))
    .sort((a, b) => a.unidadId.localeCompare(b.unidadId))
}

beforeEach(async () => {
  await sembrarFixture()
})

describe('recomputarEpisodiosDerivados', () => {
  it('recomputa y persiste los episodios derivados con los campos esperados', async () => {
    const resultado = await recomputarEpisodiosDerivados({ asOf: new Date(AS_OF) })

    expect(resultado.episodiosCreados).toBeGreaterThanOrEqual(1)
    expect(resultado.departamentosProcesados).toBe(1)
    expect(resultado.reglaVersion).toBe('episodios-v0.1')
    expect(resultado.asOf).toBe(AS_OF)

    const db = getDb()
    const episodios = await db.select().from(infraEpisodioDerivado)
    expect(episodios).toHaveLength(1)
    expect(episodios[0]).toMatchObject({
      reglaVersion: 'episodios-v0.1',
      unidadTipo: 'departamento',
      unidadId: DEPARTAMENTO,
      inicioEn: RIGE_DESDE_VALIDO,
      finEn: null,
      estado: 'abierto',
      escuelasAfectadas: 2,
      calculadoEn: AS_OF,
    })

    const miembros = await db
      .select()
      .from(infraEpisodioMiembro)
      .where(eq(infraEpisodioMiembro.episodioDerivadoId, episodios[0].id))
    expect(miembros).toHaveLength(2)
    expect(miembros.map((m) => m.cueAnexo).sort()).toEqual(
      [CUE_CON_MOVIMIENTO, CUE_SIN_MOVIMIENTO],
    )
  })

  it('excluye geográficamente las escuelas sin perfil o con motivoExclusion', async () => {
    const resultado = await recomputarEpisodiosDerivados({ asOf: new Date(AS_OF) })

    // CUE_EXCLUIDA_POR_MOTIVO (motivoExclusion no null) + CUE_SIN_PERFIL
    // (departamento null) = 2 escuelas excluidas, contadas por cueAnexo.
    expect(resultado.escuelasExcluidas).toBe(2)

    const db = getDb()
    const miembros = await db.select().from(infraEpisodioMiembro)
    const cues = miembros.map((m) => m.cueAnexo)
    expect(cues).not.toContain(CUE_EXCLUIDA_POR_MOTIVO)
    expect(cues).not.toContain(CUE_SIN_PERFIL)
  })

  it('resuelve movimientoId sólo cuando parteId y rigeDesde matchean exactamente', async () => {
    await recomputarEpisodiosDerivados({ asOf: new Date(AS_OF) })

    const db = getDb()
    const miembros = await db.select().from(infraEpisodioMiembro)

    const conMovimiento = miembros.find((m) => m.cueAnexo === CUE_CON_MOVIMIENTO)
    const sinMovimiento = miembros.find((m) => m.cueAnexo === CUE_SIN_MOVIMIENTO)

    expect(conMovimiento?.movimientoId).toBe(idMovimientoEsperado)
    expect(sinMovimiento?.movimientoId).toBeNull()
  })

  it('es idempotente: el segundo recomputo reemplaza al primero sin duplicar ni dejar residuales', async () => {
    await recomputarEpisodiosDerivados({ asOf: new Date(AS_OF) })
    const primeraCorrida = await leerEpisodiosNormalizados()

    const resultado = await recomputarEpisodiosDerivados({ asOf: new Date(AS_OF) })
    expect(resultado.episodiosCreados).toBe(1)

    const segundaCorrida = await leerEpisodiosNormalizados()

    // Contenido equivalente (los ids se regeneran, por eso se compara por
    // contenido). Mismo departamento, estado y miembros.
    expect(segundaCorrida).toEqual(primeraCorrida)
    expect(segundaCorrida).toHaveLength(1)
    expect(segundaCorrida[0].miembros).toHaveLength(2)

    // Y no quedaron filas duplicadas ni residuales de la primera corrida.
    const db = getDb()
    const episodios = await db.select().from(infraEpisodioDerivado)
    const miembros = await db.select().from(infraEpisodioMiembro)
    expect(episodios).toHaveLength(1)
    expect(miembros).toHaveLength(2)
  })

  it('as-of por registro: un parte cargado después del corte no aparece en un recompute a esa fecha', async () => {
    const CUE_REGISTRADO_TARDE = '1801605-05'
    const REGISTRADO_EN = '2026-03-20T00:00:00.000Z' // posterior a AS_OF

    const db = getDb()
    const parteId = randomUUID()
    await db.insert(infraParte).values({
      id: parteId,
      periodoId: PERIODO_ID,
      cueAnexo: CUE_REGISTRADO_TARDE,
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: RIGE_DESDE_VALIDO,
      corteId: 1,
      creadaEn: REGISTRADO_EN,
      actualizadaEn: REGISTRADO_EN,
    })
    await db.insert(infraAfectacion).values({
      id: randomUUID(),
      parteId,
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      // Rige desde antes del corte, pero se cargó (creadaEn) después: no
      // debe aparecer en un recompute con asOf = AS_OF.
      rigeDesde: RIGE_DESDE_VALIDO,
      creadaEn: REGISTRADO_EN,
      retiradaEn: null,
    })
    await db.insert(infraGeoProfile).values({
      cueAnexo: CUE_REGISTRADO_TARDE,
      departamento: DEPARTAMENTO,
      motivoExclusion: null,
      perfilVersion: 'geo-perfil-v1',
      calculadoEn: RIGE_DESDE_VALIDO,
    })

    const historico = await recomputarEpisodiosDerivados({ asOf: new Date(AS_OF) })
    const miembrosHistorico = await db.select().from(infraEpisodioMiembro)
    expect(miembrosHistorico.map((m) => m.cueAnexo)).not.toContain(
      CUE_REGISTRADO_TARDE,
    )
    expect(historico.escuelasExcluidas).toBe(2) // sin cambios: no es exclusión geográfica

    const posterior = await recomputarEpisodiosDerivados({
      asOf: new Date('2026-03-25T00:00:00.000Z'),
    })
    const miembrosPosterior = await db.select().from(infraEpisodioMiembro)
    expect(miembrosPosterior.map((m) => m.cueAnexo)).toContain(
      CUE_REGISTRADO_TARDE,
    )
    void posterior
  })
})
