// Tests del motor de replay temporal (batch E7b) contra una base libsql real,
// aislada en un tmpdir (mismo patrón que
// lib/infraestructura/episodios-derivados/recompute.test.ts): DATA_DIR a un
// tmpdir, ensureSeeded() una vez y getDb() memoizado. La base es un archivo por
// worker de vitest, así que cada archivo arranca limpio.
//
// Sobre lo que siembra ensureSeeded() se insertan los datos del fixture
// (crearFixtureEscenarioCompleto, mismo directorio): período, perfil
// geográfico, parte + afectación con su creadaEn tardía, run + snapshot de
// riesgo, y un episodio derivado mínimo para el caso de alcance por episodio.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import {
  hazardEnsembleProb,
  hazardForecast,
  hazardObservation,
  hazardSourceHealth,
  infraAfectacion,
  infraEpisodioDerivado,
  infraGeoProfile,
  infraParte,
  infraPeriodo,
  infraRiskRun,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import {
  crearFixtureEscenarioCompleto,
  type FixtureEscenarioCompleto,
} from './fixtures'
import { MAX_CUADROS_POR_VENTANA, generarReplay } from './consulta'

let dir: string
let prevDataDir: string | undefined

// Instante de arranque de los casos que necesitan "antes de T0/T1". Fijo.
const DESDE_ANTES_DE_T0 = '2026-03-10T00:00:00.000Z'
const EPISODIO_ID = 'episodio-fixture-001'

let fx: FixtureEscenarioCompleto

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'replay-consulta-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  fx = crearFixtureEscenarioCompleto()
  const db = getDb()

  // Período propio del fixture. ensureSeeded() ya siembra uno 'vigente'
  // (índice único parcial sobre estado), así que el del fixture va 'historico'
  // — el modelo de riesgo/parte sólo lo referencia por FK, no exige vigencia.
  await db.insert(infraPeriodo).values({
    id: fx.periodoId,
    nombre: 'Período fixture E7b',
    inicioEn: '2026-01-01T00:00:00.000Z',
    finEn: null,
    estado: 'historico',
    creadaEn: '2026-01-01T00:00:00.000Z',
  })

  await db.insert(infraGeoProfile).values({
    cueAnexo: fx.cueAnexo,
    lat: -31.73,
    lon: -60.52,
    geoCalidad: 'alta',
    departamento: fx.departamento,
    geometryRef: fx.geometryRef,
    motivoExclusion: null,
    perfilVersion: 'geo-perfil-v1',
    calculadoEn: fx.T0,
  })

  await db.insert(infraParte).values({
    id: fx.afectacion.parteId,
    periodoId: fx.periodoId,
    cueAnexo: fx.cueAnexo,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: fx.rigeDesde,
    corteId: 1,
    creadaEn: fx.creadaEn,
    actualizadaEn: fx.creadaEn,
  })

  // cueAnexo no es columna de infra_afectacion (se obtiene por join con
  // infra_parte); el fixture lo trae denormalizado para el test.
  const { cueAnexo: _cueAnexo, ...afectacionRow } = fx.afectacion
  await db.insert(infraAfectacion).values(afectacionRow)

  await db.insert(infraRiskRun).values(fx.snapshot.run)
  await db.insert(infraRiskSnapshot).values(fx.snapshot.porEscuela)

  await db.insert(hazardEnsembleProb).values(fx.ensembleProb)
  await db.insert(hazardObservation).values(fx.observacionLluvia)
  await db.insert(hazardSourceHealth).values(fx.saludFuente)

  await db.insert(infraEpisodioDerivado).values({
    id: EPISODIO_ID,
    reglaVersion: 'episodios-v0.1',
    parametros: {},
    unidadTipo: 'departamento',
    unidadId: fx.departamento,
    inicioEn: DESDE_ANTES_DE_T0,
    finEn: fx.T1,
    estado: 'cerrado',
    escuelasAfectadas: 1,
    calculadoEn: fx.T1,
  })
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('generarReplay', () => {
  it('Caso 1: vista conocido as-of T1 NO ve la corrección tardía (creadaEn > T1)', async () => {
    const resultado = await generarReplay({
      territorioTipo: 'departamento',
      territorioId: fx.departamento,
      desde: DESDE_ANTES_DE_T0,
      hasta: fx.T1,
      paso: 6,
      vista: 'conocido',
    })

    expect(resultado.cuadros.length).toBe(3)
    for (const cuadro of resultado.cuadros) {
      expect(cuadro.instante <= fx.T1).toBe(true)
      expect(cuadro.afectacionesConfirmadas).toHaveLength(0)
    }
    expect(resultado.cuadros.at(-1)?.instante).toBe(fx.T1)
  })

  it('Caso 2: vista reconstruido as-of T1 SÍ ve la afectación (rigeDesde < T1)', async () => {
    const resultado = await generarReplay({
      territorioTipo: 'departamento',
      territorioId: fx.departamento,
      desde: DESDE_ANTES_DE_T0,
      hasta: fx.T1,
      paso: 6,
      vista: 'reconstruido',
    })

    for (const cuadro of resultado.cuadros) {
      expect(cuadro.afectacionesConfirmadas).toHaveLength(1)
      expect(cuadro.afectacionesConfirmadas[0]).toMatchObject({
        cueAnexo: fx.cueAnexo,
        motivo: fx.afectacion.motivo,
        categoria: fx.afectacion.categoria,
        severidad: fx.afectacion.severidad,
        rigeDesde: fx.rigeDesde,
      })
    }

    const enT1 = resultado.cuadros.find((c) => c.instante === fx.T1)
    expect(enT1?.afectacionesConfirmadas).toHaveLength(1)
  })

  it('Caso 3: as-of T2 (creadaEn <= T2) la afectación aparece en ambas vistas', async () => {
    for (const vista of ['conocido', 'reconstruido'] as const) {
      const resultado = await generarReplay({
        territorioTipo: 'departamento',
        territorioId: fx.departamento,
        desde: fx.creadaEn,
        hasta: fx.T2,
        paso: 6,
        vista,
      })

      const enT2 = resultado.cuadros.find((c) => c.instante === fx.T2)
      expect(enT2, `vista ${vista}`).toBeDefined()
      expect(enT2?.afectacionesConfirmadas, `vista ${vista}`).toHaveLength(1)
      expect(enT2?.afectacionesConfirmadas[0]?.cueAnexo).toBe(fx.cueAnexo)
    }
  })

  it('Caso 4: snapshotRiesgo es null antes de T0 y "alto" desde T0', async () => {
    const resultado = await generarReplay({
      territorioTipo: 'departamento',
      territorioId: fx.departamento,
      desde: DESDE_ANTES_DE_T0,
      hasta: fx.T1,
      paso: 6,
      vista: 'conocido',
    })

    const antes = resultado.cuadros.find((c) => c.instante === DESDE_ANTES_DE_T0)
    const idxAntes = resultado.cuadros.indexOf(antes!)
    expect(antes?.snapshotRiesgo).toBeNull()
    expect(resultado.vacios[idxAntes]?.snapshotRiesgo).toBe(true)

    const enT0 = resultado.cuadros.find((c) => c.instante === fx.T0)
    const idxT0 = resultado.cuadros.indexOf(enT0!)
    expect(enT0?.snapshotRiesgo?.runId).toBe(fx.snapshot.run.id)
    expect(enT0?.snapshotRiesgo?.publicadoEn).toBe(fx.T0)
    expect(enT0?.snapshotRiesgo?.porEscuela).toEqual([
      { cueAnexo: fx.cueAnexo, nivelRiesgo: 'alto', horizonteHoras: 72 },
    ])
    expect(resultado.vacios[idxT0]?.snapshotRiesgo).toBe(false)
  })

  it('Caso 5: episodioDerivadoId resuelve territorio + ventana, y falla claro si no existe', async () => {
    const resultado = await generarReplay({
      territorioTipo: 'departamento',
      episodioDerivadoId: EPISODIO_ID,
      paso: 6,
      vista: 'reconstruido',
    })

    expect(resultado.cuadros.map((c) => c.instante)).toEqual([
      DESDE_ANTES_DE_T0,
      fx.T0,
      fx.T1,
    ])
    for (const cuadro of resultado.cuadros) {
      expect(cuadro.afectacionesConfirmadas).toHaveLength(1)
    }

    await expect(
      generarReplay({
        territorioTipo: 'departamento',
        episodioDerivadoId: 'no-existe',
        paso: 6,
        vista: 'conocido',
      }),
    ).rejects.toThrow('episodio derivado no encontrado: no-existe')
  })

  it('Caso 6: la ventana se trunca en MAX_CUADROS_POR_VENTANA con cursor de continuación', async () => {
    const resultado = await generarReplay({
      territorioTipo: 'departamento',
      territorioId: fx.departamento,
      desde: '2026-03-10T00:00:00.000Z',
      hasta: '2026-03-16T00:00:00.000Z',
      paso: 1,
      vista: 'conocido',
    })

    expect(resultado.cuadros.length).toBe(MAX_CUADROS_POR_VENTANA)
    expect(resultado.cuadros[0]?.instante).toBe('2026-03-10T00:00:00.000Z')
    expect(resultado.cuadros.at(-1)?.instante).toBe('2026-03-14T23:00:00.000Z')
    expect(resultado.siguienteDesde).toBe('2026-03-15T00:00:00.000Z')
    expect(resultado.vacios).toHaveLength(MAX_CUADROS_POR_VENTANA)
  })

  it('Caso 7: nivelesPeligro está ausente antes de corridaEn (T0) y presente desde T0', async () => {
    const resultado = await generarReplay({
      territorioTipo: 'departamento',
      territorioId: fx.departamento,
      desde: DESDE_ANTES_DE_T0,
      hasta: fx.T1,
      paso: 6,
      vista: 'conocido',
    })

    const antes = resultado.cuadros.find((c) => c.instante === DESDE_ANTES_DE_T0)
    expect(antes?.nivelesPeligro).toHaveLength(0)
    const idxAntes = resultado.cuadros.indexOf(antes!)
    expect(resultado.vacios[idxAntes]?.peligro).toBe(true)

    const enT0 = resultado.cuadros.find((c) => c.instante === fx.T0)
    expect(enT0?.nivelesPeligro).toEqual([
      { geometryRef: fx.geometryRef, nivel: 'rojo', emitidoEn: fx.T0, metodo: 'percentiles' },
    ])
    const idxT0 = resultado.cuadros.indexOf(enT0!)
    expect(resultado.vacios[idxT0]?.peligro).toBe(false)
  })

  it('Caso 8: lluviaObservada no aparece hasta que se cumplen ingeridoEn Y validoHasta (T1), sin interpolar', async () => {
    const resultado = await generarReplay({
      territorioTipo: 'departamento',
      territorioId: fx.departamento,
      desde: fx.T0,
      hasta: fx.T1,
      paso: 6,
      vista: 'conocido',
    })

    const enT0 = resultado.cuadros.find((c) => c.instante === fx.T0)
    expect(enT0?.lluviaObservada).toHaveLength(0)
    const idxT0 = resultado.cuadros.indexOf(enT0!)
    expect(resultado.vacios[idxT0]?.lluvia).toBe(true)

    const enT1 = resultado.cuadros.find((c) => c.instante === fx.T1)
    expect(enT1?.lluviaObservada).toEqual([
      { geometryRef: fx.geometryRef, valorMm: fx.observacionLluvia.valor, observadoEn: fx.T0 },
    ])
    const idxT1 = resultado.cuadros.indexOf(enT1!)
    expect(resultado.vacios[idxT1]?.lluvia).toBe(false)
  })

  it('Caso 9: saludFuentes sólo incluye la fila si actualizadaEn <= instante (sin historial real, aproximación documentada)', async () => {
    const resultado = await generarReplay({
      territorioTipo: 'departamento',
      territorioId: fx.departamento,
      desde: fx.T1,
      hasta: fx.T2,
      paso: 6,
      vista: 'conocido',
    })

    const antesDeActualizacion = resultado.cuadros.find((c) => c.instante === fx.T1)
    expect(antesDeActualizacion?.saludFuentes).toHaveLength(0)

    const enT2 = resultado.cuadros.find((c) => c.instante === fx.T2)
    expect(enT2?.saludFuentes).toEqual([
      { fuente: fx.saludFuente.provider, estado: fx.saludFuente.estado, actualizadoEn: fx.T2 },
    ])
  })

  it('Caso 10: celda sin climatología pero con pronóstico usa el umbral provisorio (no se omite)', async () => {
    const db = getDb()
    const celdaSinClima = 'celda-sin-clima'
    await db.insert(infraGeoProfile).values({
      cueAnexo: '007999',
      lat: -31.8,
      lon: -60.6,
      geoCalidad: 'alta',
      departamento: fx.departamento,
      geometryRef: celdaSinClima,
      motivoExclusion: null,
      perfilVersion: 'geo-perfil-v1',
      calculadoEn: fx.T0,
    })
    await db.insert(hazardForecast).values({
      id: 'forecast-sin-clima',
      provider: 'test',
      variable: 'precipitacion',
      geometryRef: celdaSinClima,
      corridaEn: fx.T0,
      validoEn: fx.T2,
      horizonteHoras: 24,
      valor: 90,
      unidad: 'mm',
      pasoHoras: 1,
      rawRef: null,
      ingeridoEn: fx.T0,
    })

    const resultado = await generarReplay({
      territorioTipo: 'departamento',
      territorioId: fx.departamento,
      desde: fx.T0,
      hasta: fx.T0,
      paso: 6,
      vista: 'conocido',
    })

    const enT0 = resultado.cuadros.find((c) => c.instante === fx.T0)
    const celda = enT0?.nivelesPeligro.find((n) => n.geometryRef === celdaSinClima)
    // 90 mm en 24h supera el umbral provisorio (>80 => naranja). Sin
    // climatología no se omite: se resuelve con el puente provisorio.
    expect(celda).toEqual({
      geometryRef: celdaSinClima,
      nivel: 'naranja',
      emitidoEn: fx.T0,
      metodo: 'umbral_provisorio',
    })
  })
})
