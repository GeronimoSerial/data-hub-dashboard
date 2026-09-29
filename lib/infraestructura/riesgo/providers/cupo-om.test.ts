// Tests de la guarda de cupo compartida de Open-Meteo (OM-cupo). Ver
// docs/ejecucion-enos/OM-cupo/registro.md para la fórmula citada y las
// decisiones de diseño. Nunca golpea la red real: todo es cálculo puro o
// contabilidad en la base de datos.
//
// Por defecto corren sobre PGlite en memoria (getDb() sin DATABASE_URL, ver
// lib/db/index.ts). El único test que NO corre así es el de concurrencia real
// entre dos conexiones físicas, gateado por DATABASE_URL_TEST. Cómo correrlo:
//
//   1. Levantar un Postgres local con podman:
//        podman run --rm -d --name enos-pg \
//          -p 55432:5432 \
//          -e POSTGRES_USER=enos_test \
//          -e POSTGRES_PASSWORD=enos_test_local_only \
//          -e POSTGRES_DB=enos_db1_f3 \
//          postgres:16
//   2. Exportar la URL antes de correr vitest:
//        export DATABASE_URL_TEST='postgresql://enos_test:enos_test_local_only@localhost:55432/enos_db1_f3'
//        pnpm vitest run lib/infraestructura/riesgo/providers/cupo-om.test.ts
//
// Sin DATABASE_URL_TEST ese describe se saltea con motivo explícito y la
// suite normal sigue corriendo 100% sobre PGlite en memoria, sin Docker.
import { and, eq } from 'drizzle-orm'
import type { Pool } from 'pg'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type {
  agregarApiKey as AgregarApiKey,
  construirBaseUrl as ConstruirBaseUrl,
  estaEnCooldown as EstaEnCooldown,
  limiteVentana as LimiteVentana,
  obtenerResumenCupo as ObtenerResumenCupo,
  pesoLlamada as PesoLlamada,
  registrarCooldown as RegistrarCooldown,
  reservarCupo as ReservarCupo,
} from './cupo-om'

usarDbTemporal('cupo-om-')

beforeAll(async () => {
  ;({
    pesoLlamada,
    limiteVentana,
    reservarCupo,
    registrarCooldown,
    estaEnCooldown,
    obtenerResumenCupo,
    construirBaseUrl,
    agregarApiKey,
  } = await import('./cupo-om'))
})

let prevEnvVars: Record<string, string | undefined> = {}

let pesoLlamada: typeof PesoLlamada
let limiteVentana: typeof LimiteVentana
let reservarCupo: typeof ReservarCupo
let registrarCooldown: typeof RegistrarCooldown
let estaEnCooldown: typeof EstaEnCooldown
let obtenerResumenCupo: typeof ObtenerResumenCupo
let construirBaseUrl: typeof ConstruirBaseUrl
let agregarApiKey: typeof AgregarApiKey

const ENV_LIMITES = [
  'OPEN_METEO_LIMITE_MINUTO',
  'OPEN_METEO_LIMITE_MINUTO_PAGO',
  'OPEN_METEO_LIMITE_HORA',
  'OPEN_METEO_LIMITE_HORA_PAGO',
  'OPEN_METEO_LIMITE_DIA',
  'OPEN_METEO_LIMITE_DIA_PAGO',
  'OPEN_METEO_LIMITE_MES',
  'OPEN_METEO_LIMITE_MES_PAGO',
]

afterEach(() => {
  for (const nombre of ENV_LIMITES) {
    if (nombre in prevEnvVars) {
      const previo = prevEnvVars[nombre]
      if (previo === undefined) delete process.env[nombre]
      else process.env[nombre] = previo
    } else {
      delete process.env[nombre]
    }
  }
  prevEnvVars = {}
})

function setEnv(nombre: string, valor: string) {
  if (!(nombre in prevEnvVars)) prevEnvVars[nombre] = process.env[nombre]
  process.env[nombre] = valor
}

// Clave de ventana única por corrida: desplaza `ahora` a una hora aleatoria
// lejana para que las filas del contador (clave `YYYY-MM-DDTHH`) no choquen ni
// con otras suites ni con corridas previas sobre la misma base real
// compartida. Truncado a la hora exacta para que `actualizadaEn` sea estable.
function ahoraUnicoHora(): Date {
  const offsetHoras = Math.floor(Math.random() * 5_000_000)
  const d = new Date(Date.now() + offsetHoras * 3_600_000)
  d.setUTCMinutes(0, 0, 0)
  return d
}

describe('pesoLlamada', () => {
  it('1 ubicación, <=10 variables, <=14 días: peso 1 (piso de ambos factores)', () => {
    expect(pesoLlamada({ ubicaciones: 1, variables: 5, dias: 10 })).toBe(1)
  })

  it('2 semanas de datos con 15 variables = 1.5 (ejemplo textual de la fuente)', () => {
    expect(pesoLlamada({ ubicaciones: 1, variables: 15, dias: 14 })).toBeCloseTo(1.5)
  })

  it('4 semanas de datos con 15 variables = 3.0 (segundo ejemplo textual de la fuente)', () => {
    expect(pesoLlamada({ ubicaciones: 1, variables: 15, dias: 28 })).toBeCloseTo(3.0)
  })

  it('escala linealmente con la cantidad de ubicaciones (supuesto documentado)', () => {
    const unaUbicacion = pesoLlamada({ ubicaciones: 1, variables: 15, dias: 28 })
    expect(pesoLlamada({ ubicaciones: 50, variables: 15, dias: 28 })).toBeCloseTo(unaUbicacion * 50)
  })
})

describe('limiteVentana — techos duros', () => {
  it('sin env, usa el 80% del techo gratuito por defecto', () => {
    expect(limiteVentana('dia', false)).toBe(8_000)
    expect(limiteVentana('mes', false)).toBe(240_000)
  })

  it('un env por debajo del techo se respeta tal cual', () => {
    setEnv('OPEN_METEO_LIMITE_DIA', '3000')
    expect(limiteVentana('dia', false)).toBe(3_000)
  })

  it('un env por encima del techo gratuito se recorta (clamp) al techo, con warning', () => {
    setEnv('OPEN_METEO_LIMITE_DIA', '999999')
    const spy = vi_spyConsoleWarn()
    expect(limiteVentana('dia', false)).toBe(10_000)
    expect(spy.mock.calls.length).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('con API key pero SIN el env _PAGO explícito, el env base sigue clampeado al techo gratuito', () => {
    setEnv('OPEN_METEO_LIMITE_DIA', '999999')
    expect(limiteVentana('dia', true)).toBe(10_000)
  })

  it('con API key Y el env _PAGO explícito, se permite superar el techo gratuito', () => {
    setEnv('OPEN_METEO_LIMITE_DIA_PAGO', '500000')
    expect(limiteVentana('dia', true)).toBe(500_000)
  })
})

function vi_spyConsoleWarn() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {})
}

describe('reservarCupo — contabilidad por ventana', () => {
  it('reserva ok bajo el límite e incrementa el contador', async () => {
    const ahora = new Date('2026-01-05T10:00:00.000Z')
    const r1 = await reservarCupo({ host: 'test-host-a', peso: 3, ahora })
    expect(r1).toEqual({ ok: true, esperoMs: 0 })

    const resumen = await obtenerResumenCupo({ ahora })
    const filaDia = resumen.filas.find((f) => f.host === 'open-meteo-free' && f.ventana === 'dia')
    expect(filaDia?.usado).toBe(3)
  })

  it('el cupo es COMPARTIDO entre los 4 hosts de Open-Meteo (mismo bucket, no por subdominio)', async () => {
    // Los techos de Open-Meteo son de cuenta/IP, no por subdominio (ver
    // docs/ejecucion-enos/OM-cupo/registro.md): dos requests a hosts
    // DISTINTOS (api./ensemble-api.) deben gastar del MISMO pozo.
    const ahora = new Date('2026-02-01T10:00:00.000Z')
    setEnv('OPEN_METEO_LIMITE_HORA', '10')

    const r1 = await reservarCupo({ host: 'api', peso: 7, ahora })
    expect(r1.ok).toBe(true)

    // Mismo bucket que 'api' (sin API key en ninguno de los dos): 7 + 7 = 14
    // > 10, debe agotarse aunque sea un host distinto.
    const r2 = await reservarCupo({ host: 'ensemble-api', peso: 7, ahora })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.motivo).toBe('cupo_agotado')
  })

  it('devuelve cupo_agotado (hora/dia/mes) sin esperar y sin incrementar nada', async () => {
    const ahora = new Date('2026-01-06T10:00:00.000Z')
    setEnv('OPEN_METEO_LIMITE_HORA', '10')
    const r1 = await reservarCupo({ host: 'test-host-b', peso: 8, ahora })
    expect(r1.ok).toBe(true)

    const r2 = await reservarCupo({ host: 'test-host-b', peso: 8, ahora })
    expect(r2.ok).toBe(false)
    if (!r2.ok) {
      expect(r2.motivo).toBe('cupo_agotado')
      if (r2.motivo === 'cupo_agotado') expect(r2.ventana).toBe('hora')
    }

    // Ninguna ventana debe haber quedado incrementada por el intento
    // rechazado (todo o nada): el día sigue en 8, no en 16.
    const resumen = await obtenerResumenCupo({ ahora })
    const filaDia = resumen.filas.find((f) => f.host === 'open-meteo-free' && f.ventana === 'dia')
    expect(filaDia?.usado).toBe(8)
  })

  it('espera acotada en ventana de minuto y luego reserva (wait, no stop)', async () => {
    const ahora = new Date('2026-01-07T10:00:30.500Z')
    setEnv('OPEN_METEO_LIMITE_MINUTO', '5')
    const esperas: number[] = []
    const fakeEsperar = async (ms: number) => {
      esperas.push(ms)
    }

    const r1 = await reservarCupo({ host: 'test-host-c', peso: 5, ahora })
    expect(r1.ok).toBe(true)

    const r2 = await reservarCupo({
      host: 'test-host-c',
      peso: 1,
      ahora,
      esperar: fakeEsperar,
      esperaMaximaMs: 65_000,
    })
    expect(r2).toEqual({ ok: true, esperoMs: esperas[0] })
    expect(esperas).toHaveLength(1)
    // Espera acotada: nunca más que el resto del minuto + margen chico.
    expect(esperas[0]).toBeLessThanOrEqual(29_550)
  })

  it('minuto agotado incluso tras la espera: stop (cupo_minuto_agotado), no loop infinito', async () => {
    const ahora = new Date('2026-01-08T10:00:00.000Z')
    setEnv('OPEN_METEO_LIMITE_MINUTO', '1')
    let llamadasEsperar = 0
    const fakeEsperar = async () => {
      llamadasEsperar++
    }

    const r1 = await reservarCupo({ host: 'test-host-d', peso: 1, ahora })
    expect(r1.ok).toBe(true)

    // `esperaMaximaMs` chico a propósito: la espera acotada no alcanza a
    // cruzar al minuto siguiente (donde el cupo se resetea), así que el
    // segundo intento vuelve a chocar contra el mismo minuto agotado — debe
    // rendirse en 1 sola espera, nunca reintentar sin límite.
    const r2 = await reservarCupo({
      host: 'test-host-d',
      peso: 1,
      ahora,
      esperar: fakeEsperar,
      esperaMaximaMs: 1_000,
    })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.motivo).toBe('cupo_minuto_agotado')
    expect(llamadasEsperar).toBe(1)
  })

  it('host en cooldown bloquea TODA la cuenta (bucket compartido), sin siquiera intentar reservar', async () => {
    const ahora = new Date('2026-01-09T10:00:00.000Z')
    // `host: 'test-host-e'` es sólo informativo (hostOrigen): el cooldown
    // real se aplica sobre el bucket compartido ('open-meteo-free'), no
    // sobre ese literal — por eso el chequeo de abajo no pasa `host`.
    await registrarCooldown({ host: 'test-host-e', retryAfterMs: 60_000, ahora })

    const enCooldown = await estaEnCooldown({ ahora })
    expect(enCooldown.enCooldown).toBe(true)
    expect(enCooldown.hostOrigen).toBe('test-host-e')

    // Otro host cualquiera (mismo bucket, sin API key) también queda
    // bloqueado: el pozo es compartido, no por subdominio.
    const r = await reservarCupo({ host: 'otro-host-cualquiera', peso: 1, ahora })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('host_en_cooldown')

    const despuesDelCooldown = new Date(ahora.getTime() + 61_000)
    const yaNo = await estaEnCooldown({ ahora: despuesDelCooldown })
    expect(yaNo.enCooldown).toBe(false)
  })
})

// TEST 1 — concurrencia REAL contra Postgres con dos conexiones
// independientes. Reemplaza al viejo test que abría una segunda conexión
// @libsql/client contra un archivo hub.sqlite suelto: ese archivo NUNCA era
// la base que usa reservarCupo (getDb() va a PGlite en memoria bajo Vitest, o
// a Postgres con DATABASE_URL), así que su contador no competía contra nada
// real y el test era un falso positivo. Acá las dos conexiones son dos
// pg.Pool distintos contra la MISMA base real: se migra una sola vez y luego
// se lanzan ambas reservas en paralelo. El UPDATE condicionado por
// `pesoAcumulado + peso <= limite` —que Postgres re-evalúa tras el lock de
// fila— exige exactamente un ganador, sin importar cuál gane la carrera.
describe('reservarCupo concurrencia real entre dos conexiones Postgres', () => {
  it.skipIf(!process.env.DATABASE_URL_TEST)(
    'dos conexiones independientes compiten por el mismo bucket/ventana: exactamente una reserva pasa al superar el límite, y el contador refleja sólo su peso — se saltea si no está seteada DATABASE_URL_TEST (requiere un Postgres real)',
    async () => {
      const databaseUrlTest = process.env.DATABASE_URL_TEST
      if (!databaseUrlTest) throw new Error('unreachable: gateado por it.skipIf')

      const prevDatabaseUrl = process.env.DATABASE_URL
      process.env.DATABASE_URL = databaseUrlTest
      let poolA: Pool | undefined
      let poolB: Pool | undefined
      let limpiarContador: (() => Promise<void>) | undefined
      try {
        // Cada vi.resetModules() + import reconstruye lib/db, así que su
        // memoización de la conexión arranca de cero: dos getDb() distintos,
        // cada uno con su propio pg.Pool (drizzle-orm/node-postgres) contra
        // la MISMA base real.
        vi.resetModules()
        const dbModuleA = await import('@/lib/db')
        poolA = dbModuleA.getRawClient() as Pool
        const { reservarCupo: reservarA, obtenerResumenCupo: obtenerResumenA } = await import('./cupo-om')
        const { omCupoContador } = await import('@/lib/db/schema')

        vi.resetModules()
        const dbModuleB = await import('@/lib/db')
        poolB = dbModuleB.getRawClient() as Pool
        const { reservarCupo: reservarB } = await import('./cupo-om')

        expect(poolA).not.toBe(poolB)

        // El esquema se migra una sola vez (migrarDb es idempotente); la
        // segunda conexión comparte la misma base ya migrada.
        await dbModuleA.migrarDb()

        setEnv('OPEN_METEO_LIMITE_HORA', '5')
        const ahora = ahoraUnicoHora()
        const ahoraIso = ahora.toISOString()

        // Limpieza acotada al bucket compartido y a la clave única de esta
        // corrida (mismo `actualizadaEn`): deja el contador de esa ventana en
        // cero antes de la carrera y lo vuelve a dejar limpio al terminar.
        limpiarContador = async () => {
          await dbModuleA
            .getDb()
            .delete(omCupoContador)
            .where(
              and(eq(omCupoContador.host, 'open-meteo-free'), eq(omCupoContador.actualizadaEn, ahoraIso)),
            )
        }
        await limpiarContador()

        const host = `test-host-concurrencia-pg-${Date.now()}`
        const [resultadoA, resultadoB] = await Promise.all([
          reservarA({ host, peso: 3, ahora }),
          reservarB({ host, peso: 3, ahora }),
        ])

        // 3 + 3 = 6 > 5: sólo UNA de las dos reservas concurrentes puede
        // haber pasado (todo o nada, atómico entre conexiones). Nunca las dos
        // (duplicaría el gasto real de cupo frente a Open-Meteo) ni ninguna
        // (perdería gasto real).
        const ganadoras = [resultadoA, resultadoB].filter((r) => r.ok)
        expect(ganadoras).toHaveLength(1)
        const perdedoras = [resultadoA, resultadoB].filter((r) => !r.ok)
        expect(perdedoras).toEqual([
          expect.objectContaining({ motivo: 'cupo_agotado', ventana: 'hora' }),
        ])

        // El contador final refleja SOLO el peso de la que ganó: 3, nunca 6
        // (doble gasto) ni 0 (gasto perdido).
        const resumen = await obtenerResumenA({ ahora })
        const filaHora = resumen.filas.find((f) => f.host === 'open-meteo-free' && f.ventana === 'hora')
        expect(filaHora?.usado).toBe(3)
      } finally {
        if (limpiarContador) {
          try {
            await limpiarContador()
          } catch {
            // si la conexión ya no sirve, no enmascarar el resultado del test
          }
        }
        if (poolA) await poolA.end()
        if (poolB) await poolB.end()
        if (prevDatabaseUrl === undefined) delete process.env.DATABASE_URL
        else process.env.DATABASE_URL = prevDatabaseUrl
        vi.resetModules()
      }
    },
  )
})

// TEST 2 — concurrencia real dentro de un solo proceso sobre PGlite (corre
// siempre, sin gate). A diferencia de los tests secuenciales de más arriba,
// las dos reservas se disparan de verdad en paralelo (Promise.all) sobre la
// MISMA instancia de Db: PGlite serializa las transacciones
// (_runExclusiveTransaction), así que el UPDATE condicionado de la segunda
// re-evalúa el acumulado ya commiteado por la primera y sólo una pasa.
describe('reservarCupo concurrencia dentro de un proceso (PGlite)', () => {
  it('dos reservas concurrentes que juntas superan la ventana hora: exactamente una ok y el contador queda en el peso ganador', async () => {
    setEnv('OPEN_METEO_LIMITE_HORA', '5')
    const ahora = ahoraUnicoHora()
    const host = `test-host-concurrencia-pglite-${Date.now()}`

    const [resultadoA, resultadoB] = await Promise.all([
      reservarCupo({ host, peso: 3, ahora }),
      reservarCupo({ host, peso: 3, ahora }),
    ])

    const ganadoras = [resultadoA, resultadoB].filter((r) => r.ok)
    expect(ganadoras).toHaveLength(1)
    const perdedoras = [resultadoA, resultadoB].filter((r) => !r.ok)
    expect(perdedoras).toEqual([
      expect.objectContaining({ motivo: 'cupo_agotado', ventana: 'hora' }),
    ])

    const resumen = await obtenerResumenCupo({ ahora })
    const filaHora = resumen.filas.find((f) => f.host === 'open-meteo-free' && f.ventana === 'hora')
    expect(filaHora?.usado).toBe(3)
  })
})

describe('construirBaseUrl / agregarApiKey — switch por API key', () => {
  it('sin API key usa el host normal', () => {
    expect(construirBaseUrl('api', '/v1/ecmwf', undefined)).toBe('https://api.open-meteo.com/v1/ecmwf')
    expect(agregarApiKey('https://api.open-meteo.com/v1/ecmwf?latitude=1', undefined)).toBe(
      'https://api.open-meteo.com/v1/ecmwf?latitude=1',
    )
  })

  it('con API key usa el prefijo customer- en los 4 hosts y agrega ?apikey=', () => {
    expect(construirBaseUrl('api', '/v1/ecmwf', 'clave-secreta')).toBe(
      'https://customer-api.open-meteo.com/v1/ecmwf',
    )
    expect(construirBaseUrl('ensemble-api', '/v1/ensemble', 'clave-secreta')).toBe(
      'https://customer-ensemble-api.open-meteo.com/v1/ensemble',
    )
    expect(construirBaseUrl('archive-api', '/v1/archive', 'clave-secreta')).toBe(
      'https://customer-archive-api.open-meteo.com/v1/archive',
    )
    expect(construirBaseUrl('flood-api', '/v1/flood', 'clave-secreta')).toBe(
      'https://customer-flood-api.open-meteo.com/v1/flood',
    )

    const url = agregarApiKey('https://customer-api.open-meteo.com/v1/ecmwf?latitude=1', 'clave-secreta')
    expect(new URL(url).searchParams.get('apikey')).toBe('clave-secreta')
  })
})
