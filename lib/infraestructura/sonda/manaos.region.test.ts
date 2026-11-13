import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// La región se resuelve al importar (jobs-esperados): debe fijarse antes de los imports.
vi.hoisted(() => {
  process.env.REGION = 'manaos'
})
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { infraJobRun } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { EstadoJobRun } from '@/lib/infraestructura/riesgo/salud'
import { clasificarSondaCadena } from '@/lib/infraestructura/riesgo/estado-datos/clasificar'
import { correrSondaCadenaDatos } from './job'
import { escuelasTestigo, estacionesTestigo } from './testigos'

// Región Manaos: sin fuente 'prefectura' y sin testigos declarados.
usarDbTemporal('sonda-manaos-', {
  seed: false,
  env: { REGION: 'manaos', RIESGO_DATOS_ROL: 'productor' },
})

const AHORA = new Date('2026-10-13T12:30:00.000Z')
const MOTIVO_SIN_TESTIGOS = 'Sin testigos configurados para esta región: la cadena de datos no se verificó.'

describe('sonda de cadena de datos en Manaos (sin Prefectura ni testigos)', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  afterEach(async () => {
    await db.delete(infraJobRun)
    vi.restoreAllMocks()
  })

  it('no descarga Prefectura y publica completado sin fallo cuando no hay testigos', async () => {
    const fetchImpl = vi.fn()
    const resultado = await correrSondaCadenaDatos({ ahora: AHORA, fetchImpl })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(resultado).toEqual({ ejecutado: true, estado: 'completo', contadores: { sinTestigos: 1 } })

    const [fila] = await db.select().from(infraJobRun).where(eq(infraJobRun.tipo, 'sonda-cadena-datos'))
    expect(fila.estado).toBe('completado')
    expect(fila.errorSaneado).toBeNull()
    expect(fila.contadores).toEqual({ sinTestigos: 1 })
  })

  it('con testigos por entorno pero sin fuente Prefectura, no descarga Prefectura', async () => {
    process.env.SONDA_ESCUELAS_TESTIGO = '1234567-01'
    process.env.SONDA_ESTACIONES_TESTIGO = 'estacion-manaos-prueba'
    try {
      const fetchImpl = vi.fn()
      const resultado = await correrSondaCadenaDatos({ ahora: AHORA, fetchImpl })
      expect(fetchImpl).not.toHaveBeenCalled()
      expect(resultado.estado).toBe('fallido')
    } finally {
      delete process.env.SONDA_ESCUELAS_TESTIGO
      delete process.env.SONDA_ESTACIONES_TESTIGO
    }
  })

  it('el Centro no informa la cadena como verificada: estado sin_datos con motivo explícito', () => {
    const ultima: EstadoJobRun = {
      tipo: 'sonda-cadena-datos',
      estado: 'completado',
      intento: 1,
      iniciadoEn: AHORA.toISOString(),
      finalizadoEn: AHORA.toISOString(),
      actualizadaEn: AHORA.toISOString(),
      errorSaneado: null,
      leaseVencido: false,
      ultimaCompletadaEn: AHORA.toISOString(),
      contadoresUltimaCompletada: { sinTestigos: 1 },
    }
    const item = clasificarSondaCadena({ ultima, ahora: AHORA })
    expect(item.estado).toBe('sin_datos')
    expect(item.motivo).toBe(MOTIVO_SIN_TESTIGOS)
  })

  it('no hereda los testigos de Corrientes; SONDA_*_TESTIGO sigue ganando', () => {
    expect(escuelasTestigo({} as NodeJS.ProcessEnv)).toEqual([])
    expect(estacionesTestigo({} as NodeJS.ProcessEnv)).toEqual([])
    expect(escuelasTestigo({ SONDA_ESCUELAS_TESTIGO: '1234567-01' } as unknown as NodeJS.ProcessEnv)).toEqual(['1234567-01'])
    expect(estacionesTestigo({ SONDA_ESTACIONES_TESTIGO: 'pna-x' } as unknown as NodeJS.ProcessEnv)).toEqual(['pna-x'])
  })
})
