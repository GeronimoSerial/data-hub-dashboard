import { mkdtemp, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { buildInventory, parseConfig, readInventory, csv, prepareOutput, PHOTO_SQL } from './inventario-fotos-duplicadas.mjs'
const row = (movement: string, hash: string, extra = {}) => ({ id: `${movement}-${hash}`, parteId: 'p', cue: '180', movimientoId: movement, tipo: 'evidencia_fotografica', documentaMovimientoId: 'base', documentaTipo: 'reporte_inicial', creadaEn: movement === 'a' ? '2026-10-22T21:21:00Z' : '2026-10-22T21:29:00Z', creadaPor: 'u', autor: 'User', estado: 'confirmed', optimizadaEtag: hash, optimizadaSize: 10, miniaturaEtag: `t-${hash}`, miniaturaSize: 2, ...extra })
describe('read-only photo inventory', () => {
  it('handles asynchronous driver error events without an unhandled secret-bearing exception', async () => {
    const client = Object.assign(new EventEmitter(), {
      connect: async () => undefined, end: async () => undefined,
      query: async (sql: string) => {
        if (sql.startsWith('SELECT current_database')) {
          client.emit('error', new Error('driver-sensitive-fixture'))
          return { rows: [{ database: 'hub_prod' }] }
        }
        return { rows: [{ total: 0 }] }
      },
    })
    expect((await readInventory(client)).resumen.reportesEscaneados).toBe(0)
  })
  it('counts duplicate photo rows and bytes once while comparing complete batches', () => {
    const result = buildInventory([row('a','1'), row('a','2'), row('b','1'), row('b','2')], 4)
    expect(result.resumen).toMatchObject({ reportesEscaneados: 4, gruposConDuplicados: 2, accidentales: 2, filasFotosExtra: 2, bytesInvolucrados: 24 })
    expect(buildInventory([row('a','1'), row('a','2'), row('b','1')], 1).grupos[0].clasificacion).toBe('DUDOSO')
  })
  it('requires explicit distinct confirmations or updates to classify legitimate', () => {
    expect(buildInventory([row('a','1', {documentaTipo:'confirmacion'}), row('b','1', {documentaTipo:'actualizacion',documentaMovimientoId:'other'})],1).grupos[0].clasificacion).toBe('LEGITIMO')
    expect(buildInventory([row('a','1'),row('b','1',{creadaPor:'other'})],1).grupos[0].clasificacion).toBe('DUDOSO')
  })
  it('never treats unknown pending fingerprints as duplicates', () => {
    const result = buildInventory([row('a','1',{estado:'pending',optimizadaEtag:null}),row('b','1',{estado:'pending',optimizadaEtag:null})],1)
    expect(result.grupos).toEqual([])
    expect(result.resumen.fotosSinHuellaCompleta).toBe(2)
  })
  it('parses dotenv and JSON without exposing malformed connection input', () => {
    expect(parseConfig('DATABASE_URL=postgresql://user:pass@localhost/hub_prod').database).toBe('hub_prod')
    expect(parseConfig(JSON.stringify([{key:'DATABASE_URL',value:'postgresql://user:pass@localhost/hub_prod'}])).database).toBe('hub_prod')
    expect(() => parseConfig('DATABASE_URL=SECRET_BAD_URL')).toThrow(/^Invalid database configuration\.$/)
    expect(() => parseConfig('DATABASE_URL=postgresql://user:pass@localhost/other')).toThrow(/^Invalid database configuration\.$/)
  })
  it('rolls back and closes after SELECT failure without returning secret errors', async () => {
    const queries: string[] = []; let ended = false
    const client = { connect: async()=>{}, end: async()=>{ended=true}, query: async (sql:string)=>{ queries.push(sql); if(sql.startsWith('SELECT current_database')) return {rows:[{database:'hub_prod'}]}; if(sql.startsWith('SELECT count')) throw Error('SECRET'); return {rows:[]} } }
    await expect(readInventory(client)).rejects.toThrow(/^Inventory query failed\.$/)
    expect(queries.slice(0,3)).toEqual(['BEGIN','SET TRANSACTION READ ONLY',"SELECT current_database() AS database"])
    expect(queries.at(-1)).toBe('ROLLBACK'); expect(ended).toBe(true)
  })
  it('scans all reports with a read-only query and always rolls back on success', async () => {
    const queries: string[] = []
    const client = { connect: async()=>{}, end: async()=>{}, query: async (sql:string)=>{
      queries.push(sql)
      if(sql.startsWith('SELECT current_database')) return {rows:[{database:'hub_prod'}]}
      if(sql.startsWith('SELECT count')) return {rows:[{total:9}]}
      return {rows:[]}
    } }
    expect((await readInventory(client)).resumen.reportesEscaneados).toBe(9)
    expect(queries).toEqual(['BEGIN','SET TRANSACTION READ ONLY','SELECT current_database() AS database','SELECT count(*)::integer AS total FROM infra_parte',PHOTO_SQL,'ROLLBACK'])
    expect(PHOTO_SQL).not.toMatch(/obs_key|password|email/i)
  })
  it('creates missing output parents while refusing reuse of an existing output', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'photo-inventory-'))
    const output = join(scratch, 'missing', 'inventory')
    try {
      await prepareOutput(output)
      await access(output)
      await expect(prepareOutput(output)).rejects.toThrow()
    } finally { await rm(scratch, {recursive:true, force:true}) }
  })
  it('neutralizes spreadsheet formulas in CSV', () => {
    expect(csv([{value:'=SECRET',quote:'a"b'}])).toContain("' =SECRET".replace("' ","'"))
  })
})
