import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PUNTOS_RIO } from '../puntos-rio'
import type { HazardForecastPunto } from '../tipos-hazard'
import type {
  ProveedorConDiagnostico,
  ejecutarSyncPronosticoCaudal as EjecutarSyncPronosticoCaudal,
} from './sync-pronostico-caudal'

let dir: string
let prevDataDir: string | undefined

let ejecutarSyncPronosticoCaudal: typeof EjecutarSyncPronosticoCaudal

// Celdas de prueba distintas (tres escuelas en tres celdas). El job las lee
// con selectDistinct, así que cada fila aporta una celda.
const CELDAS = ['-27.4_-58.8', '-27.5_-58.9', '-28.0_-56.5']

// Fakes sin red: implementan sólo lo que el job necesita (nombreProveedor +
// diagnóstico por celda/punto).
function ecmwfFake(erroresPorCelda: Record<string, string> = {}): ProveedorConDiagnostico {
  return {
    nombreProveedor: 'open-meteo-ecmwf',
    async obtenerPronosticoConDiagnostico({ geometryRefs, ahora }) {
      const puntos: HazardForecastPunto[] = geometryRefs
        .filter((ref) => !(ref in erroresPorCelda))
        .map((ref) => ({
          variable: 'precipitacion',
          geometryRef: ref,
          corridaEn: ahora.toISOString(),
          validoEn: ahora.toISOString(),
          horizonteHoras: 0,
          valor: 1.5,
          unidad: 'mm',
          pasoHoras: 1,
        }))
      return { puntos, erroresPorCelda }
    },
  }
}

function floodFake(): ProveedorConDiagnostico {
  return {
    nombreProveedor: 'open-meteo-flood',
    async obtenerPronosticoConDiagnostico({ geometryRefs, ahora }) {
      const puntos: HazardForecastPunto[] = geometryRefs.map((id) => ({
        variable: 'caudal',
        geometryRef: id,
        corridaEn: ahora.toISOString(),
        validoEn: ahora.toISOString(),
        horizonteHoras: 24,
        valor: 123.4,
        unidad: 'm3/s',
        pasoHoras: 6,
      }))
      return { puntos, erroresPorCelda: {} }
    },
  }
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'sync-pronostico-caudal-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
  ;({ ejecutarSyncPronosticoCaudal } = await import('./sync-pronostico-caudal'))

  // Perfiles geográficos de prueba: 3 filas con geometryRef válido para que el
  // selectDistinct produzca 3 celdas.
  const { getDb } = await import('@/lib/db')
  const { infraGeoProfile } = await import('@/lib/db/schema')
  await getDb()
    .insert(infraGeoProfile)
    .values(
      CELDAS.map((geometryRef, indice) => ({
        cueAnexo: `180000${indice + 1}-00`,
        geometryRef,
        motivoExclusion: null,
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      })),
    )
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('ejecutarSyncPronosticoCaudal', () => {
  it('primera corrida inserta filas de ambos proveedores y deja la salud en ok', async () => {
    const ahora = new Date('2026-09-26T01:00:00.000Z') // bloque 00-06

    const resultado = await ejecutarSyncPronosticoCaudal({
      ahora,
      ecmwfProvider: ecmwfFake(),
      floodProvider: floodFake(),
    })

    const esperadas = CELDAS.length + PUNTOS_RIO.length
    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasConsultadas: CELDAS.length,
        puntosRioConsultados: PUNTOS_RIO.length,
        llamadasRealizadas: esperadas,
        filasInsertadas: esperadas,
        proveedoresConError: [],
      },
    })

    const { getDb } = await import('@/lib/db')
    const { hazardForecast, hazardSourceHealth } = await import('@/lib/db/schema')
    const db = getDb()

    const filas = await db.select().from(hazardForecast)
    expect(filas).toHaveLength(esperadas)
    // Hallazgo H3 (docs/ejecucion-enos/E2/registro.md §5): `corridaEn` debe
    // anclarse al INICIO del bloque de 6h (00:00:00.000Z para el bloque
    // 00-06), no al minuto/segundo exacto de `ahora` — así dos invocaciones
    // dentro de la misma ventana producen el mismo `corridaEn` y el índice
    // único sí dedupica.
    expect(filas.every((f) => f.corridaEn === '2026-09-26T00:00:00.000Z')).toBe(true)

    const salud = await db.select().from(hazardSourceHealth)
    expect(salud).toHaveLength(2)
    expect(salud.map((f) => f.estado)).toEqual(['ok', 'ok'])
    expect(salud.map((f) => f.provider).sort()).toEqual(['open-meteo-ecmwf', 'open-meteo-flood'])
    expect(salud.every((f) => f.ultimoExitoEn === ahora.toISOString())).toBe(true)
    expect(salud.every((f) => f.ultimoErrorSaneado === null)).toBe(true)
  })

  it('repetir el sync en la misma ventana de 6h no adquiere lease y no duplica filas', async () => {
    const { getDb } = await import('@/lib/db')
    const { hazardForecast } = await import('@/lib/db/schema')
    const db = getDb()

    const antes = await db.select().from(hazardForecast)
    const antesCount = antes.length

    const ahora = new Date('2026-09-26T01:00:00.000Z') // MISMO bloque 00-06
    const resultado = await ejecutarSyncPronosticoCaudal({
      ahora,
      ecmwfProvider: ecmwfFake(),
      floodProvider: floodFake(),
    })

    expect(resultado).toEqual({ ok: false, motivo: 'lease_no_disponible' })

    const despues = await db.select().from(hazardForecast)
    expect(despues).toHaveLength(antesCount)
  })

  it('un proveedor con errores por celda queda degradado pero el job completa ok', async () => {
    const ahora = new Date('2026-09-26T07:00:00.000Z') // bloque 06-12
    const celdaCaida = CELDAS[0]
    const mensaje = 'timeout: no respondió a los 12s'

    const resultado = await ejecutarSyncPronosticoCaudal({
      ahora,
      ecmwfProvider: ecmwfFake({ [celdaCaida]: mensaje }),
      floodProvider: floodFake(),
    })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('unreachable')
    expect(resultado.resultado.proveedoresConError).toEqual(['open-meteo-ecmwf'])
    // celdas caídas no emiten puntos: 2 de ECMWF + todos los de flood
    expect(resultado.resultado.filasInsertadas).toBe(CELDAS.length - 1 + PUNTOS_RIO.length)

    const { getDb } = await import('@/lib/db')
    const { hazardSourceHealth } = await import('@/lib/db/schema')
    const db = getDb()
    const salud = await db.select().from(hazardSourceHealth)
    const ecmwf = salud.find((f) => f.provider === 'open-meteo-ecmwf')
    const flood = salud.find((f) => f.provider === 'open-meteo-flood')

    expect(ecmwf?.estado).toBe('degradado')
    expect(ecmwf?.ultimoErrorSaneado).toBe(mensaje)
    expect(ecmwf?.ultimoIntentoEn).toBe(ahora.toISOString())
    // el último éxito previo se preserva mientras está degradado
    expect(ecmwf?.ultimoExitoEn).toBe('2026-09-26T01:00:00.000Z')

    expect(flood?.estado).toBe('ok')
    expect(flood?.ultimoExitoEn).toBe(ahora.toISOString())
    expect(flood?.ultimoErrorSaneado).toBeNull()
  })
})

// --- Renovación activa del lease durante el loop (hallazgo H2, batch E2) ---
//
// `RENOVAR_LEASE_CADA_N_CELDAS` es 25 en la implementación. Para forzar más de
// una renovación necesitamos > 25 celdas, así que en esta suite insertamos 60
// perfiles extra (total 63 con las 3 base) y las limpiamos en el afterAll para
// no alterar los conteos de los tests que ya existían.
const CELDAS_EXTRA = Array.from({ length: 60 }, (_, indice) => ({
  cueAnexo: `199000${indice + 1}-00`,
  geometryRef: `-30.${String(indice).padStart(2, '0')}_-60.0`,
}))

type RenovarLeaseParamsTest = {
  jobRunId: string
  leaseOwner: string
  duracionLeaseMs: number
  ahora?: Date
}

describe('ejecutarSyncPronosticoCaudal — renovación de lease durante el loop', () => {
  beforeAll(async () => {
    const { getDb } = await import('@/lib/db')
    const { infraGeoProfile } = await import('@/lib/db/schema')
    await getDb()
      .insert(infraGeoProfile)
      .values(
        CELDAS_EXTRA.map(({ cueAnexo, geometryRef }) => ({
          cueAnexo,
          geometryRef,
          motivoExclusion: null,
          perfilVersion: 'geo-perfil-v1',
          calculadoEn: '2026-09-26T00:00:00.000Z',
        })),
      )
  })

  afterAll(async () => {
    const { getDb } = await import('@/lib/db')
    const { infraGeoProfile } = await import('@/lib/db/schema')
    await getDb()
      .delete(infraGeoProfile)
      .where(
        inArray(
          infraGeoProfile.cueAnexo,
          CELDAS_EXTRA.map(({ cueAnexo }) => cueAnexo),
        ),
      )
  })

  it('renueva el lease más de una vez cuando las celdas superan el umbral de tanda', async () => {
    const ahora = new Date('2026-09-26T13:00:00.000Z') // bloque 12-18
    const renovarLease = vi.fn(async (_params: RenovarLeaseParamsTest) => true)

    const resultado = await ejecutarSyncPronosticoCaudal({
      ahora,
      ecmwfProvider: ecmwfFake(),
      floodProvider: floodFake(),
      renovarLease,
    })

    // 3 celdas base + 60 extra = 63 (> 25): varias tandas => varias renovaciones.
    expect(renovarLease.mock.calls.length).toBeGreaterThan(1)
    // Se renueva sin `ahora` a propósito: con el instante anclado al inicio del
    // job el vencimiento no avanzaría y la renovación no extendería el lease.
    const primerLlamado = renovarLease.mock.calls[0]?.[0]
    expect(primerLlamado?.ahora).toBeUndefined()
    expect(primerLlamado?.duracionLeaseMs).toBe(5 * 60 * 1000)
    expect(typeof primerLlamado?.jobRunId).toBe('string')
    expect(typeof primerLlamado?.leaseOwner).toBe('string')

    if (!resultado.ok) throw new Error('unreachable')
    expect(resultado.resultado.celdasConsultadas).toBe(CELDAS.length + CELDAS_EXTRA.length)
    expect(resultado.resultado.proveedoresConError).toEqual([])
  })

  it('si renovarLease devuelve false corta y no escribe más filas de hazard_forecast', async () => {
    const ahora = new Date('2026-09-26T19:00:00.000Z') // bloque 18-24
    const renovarLease = vi.fn(async (_params: RenovarLeaseParamsTest) => false)

    const { getDb } = await import('@/lib/db')
    const { hazardForecast } = await import('@/lib/db/schema')
    const db = getDb()
    const antes = (await db.select().from(hazardForecast)).length

    const resultado = await ejecutarSyncPronosticoCaudal({
      ahora,
      ecmwfProvider: ecmwfFake(),
      floodProvider: floodFake(),
      renovarLease,
    })

    if (resultado.ok || resultado.motivo !== 'lease_perdido_durante_ejecucion') {
      throw new Error('unreachable')
    }
    // Sólo se procesó la primera tanda (25 celdas ECMWF) antes del corte: ni
    // los puntos de río ni las tandas siguientes se consultaron/escribieron.
    expect(resultado.resultado.celdasConsultadas).toBe(25)
    expect(resultado.resultado.puntosRioConsultados).toBe(0)
    expect(resultado.resultado.filasInsertadas).toBe(25)
    expect(renovarLease).toHaveBeenCalledTimes(1)

    const despues = (await db.select().from(hazardForecast)).length
    expect(despues - antes).toBe(25)
  })
})

describe('ejecutarSyncPronosticoCaudal — conteo real de llamadas (regresión hallazgo B)', () => {
  it('usa el llamadasRealizadas que reporta el provider, no una llamada por celda/punto', async () => {
    // Simula un provider que batchea TODAS las celdas en 1 sola request HTTP
    // (como ecmwf.ts real con ≤50 coordenadas por lote), reportándolo.
    const ecmwfBatcheado: ProveedorConDiagnostico = {
      nombreProveedor: 'open-meteo-ecmwf',
      async obtenerPronosticoConDiagnostico({ geometryRefs, ahora }) {
        const puntos: HazardForecastPunto[] = geometryRefs.map((ref) => ({
          variable: 'precipitacion',
          geometryRef: ref,
          corridaEn: ahora.toISOString(),
          validoEn: ahora.toISOString(),
          horizonteHoras: 0,
          valor: 1.5,
          unidad: 'mm',
          pasoHoras: 1,
        }))
        return { puntos, erroresPorCelda: {}, llamadasRealizadas: 1 }
      },
    }
    const floodBatcheado: ProveedorConDiagnostico = {
      nombreProveedor: 'open-meteo-flood',
      async obtenerPronosticoConDiagnostico({ geometryRefs, ahora }) {
        const puntos: HazardForecastPunto[] = geometryRefs.map((id) => ({
          variable: 'caudal',
          geometryRef: id,
          corridaEn: ahora.toISOString(),
          validoEn: ahora.toISOString(),
          horizonteHoras: 24,
          valor: 123.4,
          unidad: 'm3/s',
          pasoHoras: 6,
        }))
        return { puntos, erroresPorCelda: {}, llamadasRealizadas: 1 }
      },
    }

    const ahora = new Date('2026-09-27T01:00:00.000Z') // bloque 00-06, día distinto: lease libre
    const resultado = await ejecutarSyncPronosticoCaudal({
      ahora,
      ecmwfProvider: ecmwfBatcheado,
      floodProvider: floodBatcheado,
    })

    if (!resultado.ok) throw new Error('unreachable')
    // 2 tandas en total (todas las celdas caben en 1 tanda de 25, todos los
    // puntos de río en otra), cada una reportando 1 sola llamada real: el
    // total real es 2, MUY por debajo de CELDAS.length + PUNTOS_RIO.length.
    expect(resultado.resultado.llamadasRealizadas).toBe(2)
  })
})
