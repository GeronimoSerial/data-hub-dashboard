import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
