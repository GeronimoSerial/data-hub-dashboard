// Tests de la guarda de cupo compartida de Open-Meteo (OM-cupo). Ver
// docs/ejecucion-enos/OM-cupo/registro.md para la fórmula citada y las
// decisiones de diseño. Nunca golpea la red real: todo es cálculo puro o
// contabilidad en SQLite (archivo temporal aislado por test, ver
// beforeAll/afterAll, mismo patrón que los tests de jobs).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
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

let dir: string
let prevDataDir: string | undefined
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

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'cupo-om-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
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

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

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

function clienteIndependiente() {
  const url = `file:${path.join(dir, 'hub.sqlite')}`
  return drizzle(createClient({ url }), { schema })
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

describe('window accounting across processes (dos clientes contra el mismo archivo)', () => {
  it('dos "procesos" (clientes drizzle independientes) comparten el mismo contador sin duplicar ni perder cupo', async () => {
    const clienteA = clienteIndependiente()
    const clienteB = clienteIndependiente()
    const ahora = new Date('2026-01-10T10:00:00.000Z')
    setEnv('OPEN_METEO_LIMITE_HORA', '10')

    const resultados = await Promise.all([
      reservarCupo({ db: clienteA, host: 'test-host-f', peso: 6, ahora }),
      reservarCupo({ db: clienteB, host: 'test-host-f', peso: 6, ahora }),
    ])

    const exitosos = resultados.filter((r) => r.ok).length
    const fallidos = resultados.filter((r) => !r.ok).length
    // 6 + 6 = 12 > 10: sólo UNA de las dos reservas concurrentes puede
    // haber pasado (todo o nada, atómico entre procesos); la otra debe
    // rechazarse por cupo agotado, nunca las dos aceptarse (eso duplicaría
    // el gasto real de cupo frente a Open-Meteo).
    expect(exitosos).toBe(1)
    expect(fallidos).toBe(1)

    const resumen = await obtenerResumenCupo({ db: clienteA, ahora })
    const filaHora = resumen.filas.find((f) => f.host === 'open-meteo-free' && f.ventana === 'hora')
    expect(filaHora?.usado).toBe(6)
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
