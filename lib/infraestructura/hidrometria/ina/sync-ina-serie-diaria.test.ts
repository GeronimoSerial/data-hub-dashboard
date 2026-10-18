import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardSourceHealth, hidroLoteCrudo, hidroSerieDiaria } from '@/lib/db/schema'
import type { ResultadoHttp } from '@/lib/infraestructura/riesgo/providers/cliente-http'
import { CATALOGO_A5 } from './catalogo-a5'
import type { ClienteA5, LoteObservacionesA5 } from './cliente-a5'
import { leerSerieDiaria } from './serie-diaria-repo'
import { sincronizarSerieDiariaIna } from './sync-ina-serie-diaria'

usarDbTemporal('ina-sync-serie-diaria-', { seed: false })

beforeAll(async () => {
  await migrarDb()
})

beforeEach(async () => {
  const db = getDb()
  await db.delete(hidroSerieDiaria)
  await db.delete(hidroLoteCrudo)
  await db.delete(hazardSourceHealth)
})

const AHORA = new Date('2026-10-17T15:00:00.000Z')
const corrientes = CATALOGO_A5.find((e) => e.estacionId === 'pna-corrientes')!
const goya = CATALOGO_A5.find((e) => e.estacionId === 'pna-goya')!
const catalogo = [
  { ...corrientes, historiaDesde: '2026-10-01' },
  { ...goya, historiaDesde: '2026-10-01' },
]

type Llamada = { serieId: number; desde: string; hasta: string }

// Cliente falso: Goya falla siempre; Corrientes devuelve una observación por día pedido (00 h local).
function clienteFalso(llamadas: Llamada[]): ClienteA5 {
  return {
    obtenerEstaciones: async () => ({ ok: false, motivo: 'http_error', detalle: 'no usado' }),
    obtenerObservaciones: async (serieId, desde, hasta): Promise<ResultadoHttp<LoteObservacionesA5>> => {
      llamadas.push({ serieId, desde, hasta })
      if (serieId === goya.a5SerieAlturaDiariaId) return { ok: false, motivo: 'timeout', detalle: 'timeout tras 10ms' }
      const observaciones = []
      for (let d = new Date(`${desde}T03:00:00.000Z`); d < new Date(`${hasta}T03:00:00.000Z`); d.setUTCDate(d.getUTCDate() + 1)) {
        observaciones.push({ id: d.getTime(), timestart: d.toISOString(), valor: 4 + d.getUTCDate() / 100, qualifier: null })
      }
      return { ok: true, datos: { url: `u/${serieId}/${desde}`, payload: observaciones, sha256: `${desde}-${hasta}`.padEnd(64, '0'), observaciones } }
    },
  }
}

describe('sincronizarSerieDiariaIna', () => {
  it('descarga por ventanas acotadas, guarda las estaciones que responden y sigue cuando una falla', async () => {
    const llamadas: Llamada[] = []
    const r = await sincronizarSerieDiariaIna({ catalogo, cliente: clienteFalso(llamadas), ahora: AHORA, ventanaDias: 7 })
    expect(r).toMatchObject({ ejecutado: true, estado: 'parcial' })
    expect(r.porEstacion['pna-corrientes']).toMatchObject({ estado: 'ok', insertadas: 17 })
    expect(r.porEstacion['pna-goya']).toMatchObject({ estado: 'fallido', error: 'timeout: timeout tras 10ms' })
    expect(llamadas.filter((l) => l.serieId === corrientes.a5SerieAlturaDiariaId)).toEqual([
      { serieId: 19, desde: '2026-10-01', hasta: '2026-10-08' },
      { serieId: 19, desde: '2026-10-08', hasta: '2026-10-15' },
      { serieId: 19, desde: '2026-10-15', hasta: '2026-10-18' },
    ])
    const serie = await leerSerieDiaria(getDb(), 'pna-corrientes', '2026-10-17')
    expect(serie.map((f) => f.fecha).at(-1)).toBe('2026-10-17')
    const [salud] = await getDb().select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, 'ina-a5'))
    expect(salud).toMatchObject({ estado: 'degradado' })
  })

  it('es incremental y no crea filas nuevas al reejecutar el mismo día', async () => {
    await sincronizarSerieDiariaIna({ catalogo: [catalogo[0]], cliente: clienteFalso([]), ahora: AHORA, ventanaDias: 30 })
    const llamadas: Llamada[] = []
    const r = await sincronizarSerieDiariaIna({ catalogo: [catalogo[0]], cliente: clienteFalso(llamadas), ahora: AHORA, ventanaDias: 30 })
    expect(r.estado).toBe('completo')
    expect(llamadas).toEqual([{ serieId: 19, desde: '2026-10-10', hasta: '2026-10-18' }])
    expect(r.porEstacion['pna-corrientes']).toMatchObject({ insertadas: 0, discrepancias: 0 })
    expect(await getDb().select().from(hidroSerieDiaria)).toHaveLength(17)
  })

  it('respeta el presupuesto total de solicitudes', async () => {
    const llamadas: Llamada[] = []
    const r = await sincronizarSerieDiariaIna({ catalogo, cliente: clienteFalso(llamadas), ahora: AHORA, ventanaDias: 1, maxSolicitudes: 4 })
    expect(llamadas).toHaveLength(4)
    expect(r.estado).toBe('parcial')
    expect(r.presupuestoAgotado).toBe(true)
  })
})
