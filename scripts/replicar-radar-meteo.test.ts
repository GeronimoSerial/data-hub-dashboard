import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replicarRadar, validarDestinosRadar } from './lib/replicacion-radar.mjs'

let origen: PGlite, destino: PGlite
const tablas = ['radar_meteo_run', 'radar_meteo_ensemble_run']
const ahora = new Date('2026-10-17T12:00:00Z')
async function insertar(db: PGlite, id: string, fecha: string, valor = 1) {
  for (const tabla of tablas) await db.query(`INSERT INTO ${tabla} VALUES ($1,$2,$3,$4,$5)`,
    [id, 'clave-' + id, fecha, 'completo', JSON.stringify({ valor, puntos: [null, 2] })])
  await db.query('INSERT INTO radar_meteo_verificacion VALUES ($1,$2,$3,$4)',
    [fecha.slice(0, 10), id, id, valor])
}
describe('réplica radar', () => {
beforeEach(async () => {
  origen = new PGlite(); destino = new PGlite()
  for (const db of [origen, destino]) {
    for (const tabla of tablas) await db.exec(`CREATE TABLE ${tabla} (
      id text PRIMARY KEY, idempotency_key text UNIQUE NOT NULL, fetched_at text NOT NULL,
      status text NOT NULL, payload jsonb NOT NULL)`)
    await db.exec(`CREATE TABLE radar_meteo_verificacion (
      fecha text, departamento text, run_id text, observado_mm real, PRIMARY KEY(fecha,departamento))`)
  }
})
afterEach(async () => { vi.unstubAllGlobals(); await origen.close(); await destino.close() })

  it('copia, actualiza e importa dos veces sin duplicar ni llamar APIs', async () => {
    const fetch = vi.fn(() => { throw new Error('No debe llamar APIs') })
    vi.stubGlobal('fetch', fetch)
    await insertar(origen, 'reciente', '2026-10-17T00:00:00Z')
    await insertar(destino, 'reciente', '2026-10-17T00:00:00Z', 0)
    await replicarRadar(origen, destino, ahora)
    await origen.query("UPDATE radar_meteo_run SET payload = '{\"nuevo\":true}', status='parcial'")
    await origen.query('UPDATE radar_meteo_verificacion SET observado_mm = 9')
    await replicarRadar(origen, destino, ahora)
    for (const t of tablas) expect((await destino.query(`SELECT * FROM ${t}`)).rows).toHaveLength(1)
    expect((await destino.query('SELECT payload,status FROM radar_meteo_run')).rows)
      .toEqual([{ payload: { nuevo: true }, status: 'parcial' }])
    expect((await destino.query('SELECT observado_mm FROM radar_meteo_verificacion')).rows).toEqual([{ observado_mm: 9 }])
    expect(fetch).not.toHaveBeenCalled()
  })
  it('retiene 14 días, incluye el límite y no modifica el origen', async () => {
    for (const db of [origen, destino]) {
      await insertar(db, 'viejo', '2026-10-02T00:00:00Z')
      await insertar(db, 'limite', '2026-10-03T12:00:00.000Z')
    }
    await replicarRadar(origen, destino, ahora)
    for (const t of [...tablas, 'radar_meteo_verificacion']) {
      expect((await destino.query(`SELECT * FROM ${t}`)).rows).toHaveLength(1)
      expect((await origen.query(`SELECT * FROM ${t}`)).rows).toHaveLength(2)
    }
  })
  it('revierte toda la entrega si falla una tabla posterior', async () => {
    await insertar(origen, 'nuevo', '2026-10-17T00:00:00Z')
    await destino.exec('ALTER TABLE radar_meteo_verificacion ADD CONSTRAINT rechazo CHECK (observado_mm < 0)')
    await expect(replicarRadar(origen, destino, ahora)).rejects.toThrow()
    for (const t of tablas) expect((await destino.query(`SELECT * FROM ${t}`)).rows).toHaveLength(0)
  })
  it('copia más de un lote sin omitir filas', async () => {
    for (let i = 0; i < 12; i++) await insertar(origen, 'lote-' + i, '2026-10-17T00:00:00Z')
    const resultado = await replicarRadar(origen, destino, ahora)
    for (const t of [...tablas, 'radar_meteo_verificacion']) {
      expect((await destino.query(`SELECT * FROM ${t}`)).rows).toHaveLength(12)
      expect(resultado[t].copiadas).toBe(12)
    }
  })
  it('no purga filas actuales cuando el origen está vacío', async () => {
    await insertar(destino, 'actual', '2026-10-17T00:00:00Z')
    await replicarRadar(origen, destino, ahora)
    expect((await destino.query('SELECT * FROM radar_meteo_run')).rows).toHaveLength(1)
  })
})

it.each(['hub_staging', 'hub_dev'])('permite réplica prod → %s', destino => {
  expect(() => validarDestinosRadar('postgresql://source/hub_prod', `postgres://target/${destino}`)).not.toThrow()
})
it.each([
  [undefined, 'postgres://target/hub_dev'],
  ['postgres://source/hub_staging', 'postgres://target/hub_dev'],
  ['postgres://source/hub_prod', 'postgres://target/hub_prod'],
  ['postgres://source/hub_prod', 'postgres://target/otra'],
  ['https://source/hub_prod', 'postgres://target/hub_dev'],
  ['postgres://source/hub_prod', 'invalido'],
])('rechaza destinos no autorizados (%s)', (source, target) => {
  expect(() => validarDestinosRadar(source, target)).toThrow(/requiere origen/)
})
