import { eq, or } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardSourceHealth, radarMeteoRun } from '@/lib/db/schema'
import type { LoteRadar } from './provider'
import { VARIABLES_RADAR } from './provider'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import type * as SaludFuente from '../riesgo/jobs/salud-fuente'

vi.mock('../riesgo/jobs/salud-fuente', async (importOriginal) => {
  const real = await importOriginal<typeof SaludFuente>()
  return { ...real, actualizarSaludFuente: vi.fn(real.actualizarSaludFuente) }
})

usarDbTemporal('radar-meteo-job-')

let ejecutarSyncRadarMeteo: typeof import('./job-sync').ejecutarSyncRadarMeteo
beforeAll(async () => {
  ;({ ejecutarSyncRadarMeteo } = await import('./job-sync'))
})

function lote(): LoteRadar {
  const values = Object.fromEntries(VARIABLES_RADAR.map((v) => [v, [[1, null]]])) as LoteRadar['values']
  return {
    times: ['2026-09-30T00:00:00Z', '2026-09-30T01:00:00Z'],
    cells: [{ id: 'r-140c-290', lat: -28, lon: -58, latModelo: -28.1, lonModelo: -58.1 }],
    values,
    units: { precipitation: 'mm' },
  }
}

function pronosticoFake() {
  return vi.fn(async () => ({ lotes: [lote()], pesoTotal: 1 }))
}

describe('job de sincronización del radar meteorológico', () => {
  it('no consulta ni vuelve a escribir en la segunda ejecución del mismo slot de 3 horas', async () => {
    const ahora = new Date('2026-09-30T04:45:00Z')
    const obtener = pronosticoFake()
    const primero = await ejecutarSyncRadarMeteo({ ahora, celdas: [], obtener })
    const segundo = await ejecutarSyncRadarMeteo({ ahora: new Date('2026-09-30T05:55:00Z'), celdas: [], obtener })
    expect(primero.estado).toBe('completo')
    expect(segundo.ejecutado).toBe(false)
    expect(segundo.runId).toBe(primero.runId)
    expect(obtener).toHaveBeenCalledTimes(1)
    expect(await getDb().select().from(radarMeteoRun).where(eq(radarMeteoRun.status, 'completo'))).toHaveLength(1)
  })

  it('una falla parcial deja el run fallido, nunca completo, y permite reintentar el slot', async () => {
    const ahora = new Date('2026-09-30T09:10:00Z')
    const fallar = vi.fn(async () => { throw new Error('falló un lote') })
    await expect(ejecutarSyncRadarMeteo({ ahora, celdas: [], obtener: fallar })).rejects.toThrow('falló un lote')
    expect(await getDb().select().from(radarMeteoRun).where(eq(radarMeteoRun.status, 'completo'))).toHaveLength(1)
    expect(await getDb().select().from(radarMeteoRun).where(eq(radarMeteoRun.status, 'fallido'))).toHaveLength(1)
    const reintento = await ejecutarSyncRadarMeteo({ ahora, celdas: [], obtener: pronosticoFake() })
    expect(reintento.estado).toBe('completo')
  })

  it('purga runs completos con más de 14 días al publicar un run nuevo', async () => {
    const db = getDb()
    const viejo = new Date('2026-09-01T00:00:00Z').toISOString()
    await db.insert(radarMeteoRun).values({
      id: 'run-viejo', provider: 'open-meteo', model: 'best_match', gridVersion: 'corrientes-0.2-v1',
      runAt: viejo, fetchedAt: viejo, forecastStart: viejo, forecastEnd: viejo, stepMinutes: 60,
      units: {}, status: 'completo', idempotencyKey: 'run-viejo', payload: {},
    })
    await db.insert(radarMeteoRun).values({
      id: 'run-fallido-viejo', provider: 'open-meteo', model: 'best_match', gridVersion: 'corrientes-0.2-v1',
      runAt: viejo, fetchedAt: viejo, forecastStart: '', forecastEnd: '', stepMinutes: 60,
      units: {}, status: 'fallido', idempotencyKey: 'run-fallido-viejo', payload: {},
    })
    const publicado = await ejecutarSyncRadarMeteo({ ahora: new Date('2026-09-30T15:30:00Z'), celdas: [], obtener: pronosticoFake() })
    const obsoletos = await db.select().from(radarMeteoRun).where(or(eq(radarMeteoRun.id, 'run-viejo'), eq(radarMeteoRun.id, 'run-fallido-viejo')))
    expect(obsoletos).toHaveLength(0)
    expect(await db.select().from(radarMeteoRun).where(eq(radarMeteoRun.id, publicado.runId!))).toHaveLength(1)
  })

  it('registra salud de fuente ok tras una sincronización exitosa', async () => {
    await ejecutarSyncRadarMeteo({ ahora: new Date('2026-10-01T06:00:00Z'), celdas: [], obtener: pronosticoFake() })
    const [salud] = await getDb().select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, 'open-meteo-radar'))
    expect(salud?.estado).toBe('ok')
    expect(salud?.ultimoErrorSaneado).toBeNull()
    expect(salud?.ttlMinutos).toBe(240)
  })

  it('registra salud no_disponible con error saneado cuando el proveedor falla', async () => {
    const fallar = vi.fn(async () => { throw new Error('HTTP 500 apikey=SECRETO-123 cuerpo: <html>') })
    await expect(ejecutarSyncRadarMeteo({ ahora: new Date('2026-10-01T12:00:00Z'), celdas: [], obtener: fallar })).rejects.toThrow('apikey=SECRETO-123')
    const [salud] = await getDb().select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, 'open-meteo-radar'))
    expect(salud?.estado).toBe('no_disponible')
    expect(salud?.ultimoErrorSaneado).toBe('fallo al sincronizar radar meteorológico')
    expect(salud?.ultimoErrorSaneado).not.toContain('SECRETO')
  })

  it('un fallo al escribir la salud tras un run exitoso no altera el resultado ni crea un run fallido', async () => {
    const ahora = new Date('2026-10-01T18:00:00Z')
    const fallidosAntes = await getDb().select().from(radarMeteoRun).where(eq(radarMeteoRun.status, 'fallido'))
    vi.mocked(actualizarSaludFuente).mockRejectedValueOnce(new Error('SQLITE_BUSY tabla hazard_source_health'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const resultado = await ejecutarSyncRadarMeteo({ ahora, celdas: [], obtener: pronosticoFake() })
    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    const [run] = await getDb().select().from(radarMeteoRun).where(eq(radarMeteoRun.id, resultado.runId!))
    expect(run?.status).toBe('completo')
    expect(await getDb().select().from(radarMeteoRun).where(eq(radarMeteoRun.status, 'fallido'))).toHaveLength(fallidosAntes.length)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.join(' ')).not.toContain('SQLITE_BUSY')
    warn.mockRestore()
  })
})
