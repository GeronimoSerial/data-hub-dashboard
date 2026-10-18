import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardForecast, hazardSourceHealth, infraJobRun } from '@/lib/db/schema'
import { obtenerPuntosRio } from '../puntos-rio'
import { borrarPerfilesGeo, insertarPerfilesGeo } from './__fixtures__/perfiles-geo'
import type { HazardForecastPunto } from '../tipos-hazard'
import type {
  ProveedorConDiagnostico,
  ejecutarSyncPronosticoCaudal as EjecutarSyncPronosticoCaudal,
} from './sync-pronostico-caudal'

usarDbTemporal('sync-pronostico-caudal-')

beforeAll(async () => {
  ;({ ejecutarSyncPronosticoCaudal } = await import('./sync-pronostico-caudal'))

  // Perfiles geográficos de prueba: 3 filas con geometryRef válido para que el
  // selectDistinct produzca 3 celdas.
  await insertarPerfilesGeo(
    CELDAS.map((geometryRef, indice) => ({
      cueAnexo: `180000${indice + 1}-00`,
      geometryRef,
    })),
  )
})

let ejecutarSyncPronosticoCaudal: typeof EjecutarSyncPronosticoCaudal

// Celdas de prueba distintas (tres escuelas en tres celdas). El job las lee
// con selectDistinct, así que cada fila aporta una celda.
const CELDAS = ['-27.4_-58.8', '-27.5_-58.9', '-28.0_-56.5']

// Fakes sin red: implementan sólo lo que el job necesita (nombreProveedor +
// diagnóstico por celda/punto).
function ecmwfFake(
  erroresPorCelda: Record<string, string> = {},
  opciones: { llamadasRealizadas?: number } = {},
): ProveedorConDiagnostico {
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
      return {
        puntos,
        erroresPorCelda,
        ...(opciones.llamadasRealizadas === undefined
          ? {}
          : { llamadasRealizadas: opciones.llamadasRealizadas }),
      }
    },
  }
}

function floodFake(opciones: { llamadasRealizadas?: number } = {}): ProveedorConDiagnostico {
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
      return {
        puntos,
        erroresPorCelda: {},
        ...(opciones.llamadasRealizadas === undefined
          ? {}
          : { llamadasRealizadas: opciones.llamadasRealizadas }),
      }
    },
  }
}

describe('ejecutarSyncPronosticoCaudal', () => {
  it('primera corrida inserta filas de ambos proveedores y deja la salud en ok', async () => {
    const ahora = new Date('2026-09-26T01:00:00.000Z') // bloque 00-06

    const resultado = await ejecutarSyncPronosticoCaudal({
      ahora,
      ecmwfProvider: ecmwfFake(),
      floodProvider: floodFake(),
    })

    const esperadas = CELDAS.length + obtenerPuntosRio().length
    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasConsultadas: CELDAS.length,
        puntosRioConsultados: obtenerPuntosRio().length,
        llamadasRealizadas: esperadas,
        filasInsertadas: esperadas,
        proveedoresConError: [],
      },
    })

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
    expect(resultado.resultado.filasInsertadas).toBe(CELDAS.length - 1 + obtenerPuntosRio().length)

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
// Separadas 0,5° para que cada celda caiga en su propio punto de grilla de
// 0,25° (las tandas ECMWF se arman por punto, ver grilla-modelo.ts).
const CELDAS_EXTRA = Array.from({ length: 60 }, (_, indice) => ({
  cueAnexo: `199000${indice + 1}-00`,
  geometryRef: `${(-30 - indice * 0.5).toFixed(1)}_-60.0`,
}))

type RenovarLeaseParamsTest = {
  jobRunId: string
  leaseOwner: string
  duracionLeaseMs: number
  ahora?: Date
}

describe('ejecutarSyncPronosticoCaudal — renovación de lease durante el loop', () => {
  beforeAll(async () => {
    await insertarPerfilesGeo(CELDAS_EXTRA)
  })

  afterAll(async () => {
    await borrarPerfilesGeo(CELDAS_EXTRA.map(({ cueAnexo }) => cueAnexo))
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
    const ecmwfBatcheado = ecmwfFake({}, { llamadasRealizadas: 1 })
    const floodBatcheado = floodFake({ llamadasRealizadas: 1 })

    const ahora = new Date('2026-09-27T01:00:00.000Z') // bloque 00-06, día distinto: lease libre
    const resultado = await ejecutarSyncPronosticoCaudal({
      ahora,
      ecmwfProvider: ecmwfBatcheado,
      floodProvider: floodBatcheado,
    })

    if (!resultado.ok) throw new Error('unreachable')
    // 2 tandas en total (todas las celdas caben en 1 tanda de 25, todos los
    // puntos de río en otra), cada una reportando 1 sola llamada real: el
    // total real es 2, MUY por debajo de CELDAS.length + obtenerPuntosRio().length.
    expect(resultado.resultado.llamadasRealizadas).toBe(2)
  })
})

// --- Regresión: RangeError con volumen real (bug observado en corrida local) ---
//
// Reproduce el volumen real reportado: ~387 celdas ECMWF x ~240 pasos horarios
// x 5 variables (más los puntos de río), a través del camino real del job
// (`ejecutarSyncPronosticoCaudal` -> `persistirPuntos` -> `db.insert(...)
// .values(...)`), sin red (providers fake). Antes del fix, un único
// `.values(hugeArray)` por tanda de 25 celdas (25 x 240 x 5 = 30.000 filas)
// hacía que drizzle-orm reventara el stack con "RangeError: Maximum call
// stack size exceeded" (confirmado con un repro aislado: el umbral está entre
// 10.000 y 15.000 filas en una sola sentencia). Se usan 400 celdas (> 387)
// para igualar o superar el volumen real observado.
const CANTIDAD_CELDAS_VOLUMEN_REAL = 400
const PASOS_HORARIOS_VOLUMEN_REAL = 240
const VARIABLES_VOLUMEN_REAL = 5

const CELDAS_VOLUMEN_REAL = Array.from({ length: CANTIDAD_CELDAS_VOLUMEN_REAL }, (_, indice) => ({
  cueAnexo: `198${String(indice).padStart(4, '0')}-00`,
  geometryRef: `-29.${String(indice % 100).padStart(2, '0')}_-59.${String(Math.floor(indice / 100)).padStart(2, '0')}`,
}))

/** Provider fake que emite el volumen real por celda: 240 pasos x 5 variables. */
function ecmwfFakeVolumenReal(): ProveedorConDiagnostico {
  return {
    nombreProveedor: 'open-meteo-ecmwf',
    async obtenerPronosticoConDiagnostico({ geometryRefs, ahora }) {
      const puntos: HazardForecastPunto[] = []
      for (const ref of geometryRefs) {
        for (let paso = 0; paso < PASOS_HORARIOS_VOLUMEN_REAL; paso++) {
          for (let variable = 0; variable < VARIABLES_VOLUMEN_REAL; variable++) {
            puntos.push({
              variable: (['precipitacion', 'cape', 'rafagas', 'temperatura', 'viento'] as const)[
                variable
              ],
              geometryRef: ref,
              corridaEn: ahora.toISOString(),
              validoEn: new Date(ahora.getTime() + paso * 3_600_000).toISOString(),
              horizonteHoras: paso,
              valor: 1.5,
              unidad: 'mm',
              pasoHoras: 1,
            })
          }
        }
      }
      return { puntos, erroresPorCelda: {}, llamadasRealizadas: 1 }
    },
  }
}

describe('ejecutarSyncPronosticoCaudal — volumen realista (regresión RangeError)', () => {
  beforeAll(async () => {
    await insertarPerfilesGeo(CELDAS_VOLUMEN_REAL)
  })

  afterAll(async () => {
    await borrarPerfilesGeo(CELDAS_VOLUMEN_REAL.map(({ cueAnexo }) => cueAnexo))
  })

  it('procesa ~400 celdas x 240 pasos x 5 variables sin RangeError y mide tiempo/memoria', async () => {
    const ahora = new Date('2026-09-28T01:00:00.000Z') // bloque propio, lease libre

    if (global.gc) global.gc()
    const memoriaAntes = process.memoryUsage().heapUsed
    const inicio = performance.now()

    const resultado = await ejecutarSyncPronosticoCaudal({
      ahora,
      ecmwfProvider: ecmwfFakeVolumenReal(),
      floodProvider: floodFake(),
    })

    const duracionMs = performance.now() - inicio
    const memoriaDespues = process.memoryUsage().heapUsed
    console.log(
      `[medición volumen real] duración=${duracionMs.toFixed(0)}ms ` +
        `heapUsed antes=${(memoriaAntes / 1024 / 1024).toFixed(1)}MB ` +
        `heapUsed después=${(memoriaDespues / 1024 / 1024).toFixed(1)}MB`,
    )

    if (!resultado.ok) throw new Error(`unreachable: ${JSON.stringify(resultado)}`)
    // `celdasConsultadas` incluye las celdas de otras suites del mismo archivo
    // (comparten `infra_geo_profile`, ya que `selectDistinct` no filtra por
    // origen), así que el conteo esperado se deriva de lo realmente
    // consultado en vez de un literal fijo — lo que importa acá es que NO
    // reviente y que el conteo de filas sea consistente con el volumen real.
    expect(resultado.resultado.celdasConsultadas).toBeGreaterThanOrEqual(
      CANTIDAD_CELDAS_VOLUMEN_REAL,
    )
    const esperadas =
      resultado.resultado.celdasConsultadas * PASOS_HORARIOS_VOLUMEN_REAL * VARIABLES_VOLUMEN_REAL +
      obtenerPuntosRio().length
    expect(resultado.resultado.filasInsertadas).toBe(esperadas)
  }, 120_000)
})

// --- Regresión: el job-run se marca 'fallido' si algo revienta con el lease
// ya adquirido (antes del fix, cualquier excepción posterior al lease escapaba
// sin publicar resultado y la fila quedaba 'en_progreso' hasta el vencimiento).
describe('ejecutarSyncPronosticoCaudal — marca fallido ante una excepción con el lease ya adquirido', () => {
  it('si renovarLease lanza, el job-run queda fallido y la excepción se relanza', async () => {
    const ahora = new Date('2026-09-28T07:00:00.000Z') // bloque propio, lease libre
    const errorOriginal = new Error('boom: fallo simulado durante la renovación')
    const renovarLease = vi.fn(async (_params: RenovarLeaseParamsTest) => {
      throw errorOriginal
    })

    await expect(
      ejecutarSyncPronosticoCaudal({
        ahora,
        ecmwfProvider: ecmwfFake(),
        floodProvider: floodFake(),
        renovarLease,
      }),
    ).rejects.toThrow(errorOriginal)

    const db = getDb()
    const claveIdempotente = '2026-09-28T06' // bloque 06-12
    const [fila] = await db
      .select()
      .from(infraJobRun)
      .where(eq(infraJobRun.claveIdempotente, claveIdempotente))

    expect(fila?.estado).toBe('fallido')
    expect(fila?.leaseOwner).toBeNull()
    expect(fila?.leaseExpiraEn).toBeNull()
  })
})
