import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardSourceHealth, infraJobRun, smnAlerta } from '@/lib/db/schema'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import type * as SaludFuente from '../riesgo/jobs/salud-fuente'
import { alertasSmnActivas, departamentosIntersectados, extraerUrlsCAP, parsearCAP, parsearXmlSeguro, planificarMensajeCAP, severidadCAPEnEspanol, syncSmnAlertas } from './smn-alertas'

vi.mock('../riesgo/jobs/salud-fuente', async (importOriginal) => {
  const real = await importOriginal<typeof SaludFuente>()
  return { ...real, actualizarSaludFuente: vi.fn(real.actualizarSaludFuente) }
})
const base='docs/radar-meteo/muestras/'
usarDbTemporal('smn-alertas-')
describe('ingesta CAP del SMN',()=>{
 it('interpreta las muestras CAP oficiales conservando severidad y polígono',()=>{for(const f of ['smn-cap-tormentas-2026-09-29.xml','smn-cap-corrientes-expired-2026-09-29.xml']){const a=parsearCAP(readFileSync(base+f,'utf8'));expect(a.identifier).toContain('urn:oid');expect(a.severity).toBeTruthy();expect(a.poligonos.length).toBeGreaterThan(0)}})
 it('acepta la ruta actual de CAP enlazada por el RSS del SMN',()=>{const urls=extraerUrlsCAP(readFileSync(base+'smn-cap-rss.xml','utf8'));expect(urls.length).toBeGreaterThan(0);expect(urls[0]).toMatch(/^https:\/\/ssl\.smn\.gob\.ar\/feeds\/CAP\/xml_generados\//)})
 it('la geometría oriental de la fixture intersecta Ituzaingó',()=>{const a=parsearCAP(readFileSync(base+'smn-cap-corrientes-expired-2026-09-29.xml','utf8'));expect(departamentosIntersectados(a.poligonos).map(x=>x.nombre)).toContain('Ituzaingó')})
 it('rechaza DTD y entidades externas',()=>{expect(()=>parsearXmlSeguro('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>')).toThrow();expect(()=>parsearXmlSeguro('<x>&evil;</x>')).toThrow()})
 it('decodifica entidades en una sola pasada',()=>{const xml=parsearXmlSeguro('<root>&amp;lt;</root>');expect(xml.hijos[0].texto).toBe('&lt;')})
 it('reemplaza referencias numéricas inválidas o fuera de rango',()=>{const xml=parsearXmlSeguro('<root>&#x110000;|&#99999999;|&#xD800;|&#xZZ;</root>');expect(xml.hijos[0].texto).toBe('\uFFFD|\uFFFD|\uFFFD|\uFFFD')})
 it('conserva CDATA como texto XML literal',()=>{const xml=parsearXmlSeguro('<root><![CDATA[<tag>&amp;lt;</tag>]]></root>');expect(xml.hijos[0].texto).toBe('<tag>&amp;lt;</tag>')})
 it('expira los mensajes referenciados por Update y Cancel',()=>{expect(planificarMensajeCAP({identifier:'new',msgType:'Update',references:['old']},true)).toEqual({cancelar:[],reemplazar:['old'],guardar:true});expect(planificarMensajeCAP({identifier:'cancel',msgType:'Cancel',references:['old']},false)).toEqual({cancelar:['old'],reemplazar:[],guardar:false})})
 it('traduce severity a español sin inferir color SAT',()=>{expect(severidadCAPEnEspanol('Moderate')).toBe('Moderada');expect(severidadCAPEnEspanol('Unexpected')).toBe('Unexpected')})
 it.each([
  ['cabecera HTML', () => new Response('<html>challenge</html>', { status: 403, headers: { 'content-type': 'text/html' } })],
  ['HTML en el cuerpo', () => new Response('<!DOCTYPE html><html>challenge</html>', { status: 403 })],
 ])('registra %s sin alterar las alertas guardadas', async (_caso, respuesta) => {
   const db=getDb()
   const anterior={id:'conservada',sender:'smn',sent:'2026-10-31T00:00:00Z',onset:'2026-10-31T00:00:00Z',expires:'2026-11-02T00:00:00Z',event:'Tormentas',severity:'Moderate',departamentos:[],poligonos:[],raw:'fixture',fetchedAt:'2026-10-31T00:00:00Z',cancelada:false}
   await db.insert(smnAlerta).values(anterior).onConflictDoNothing()
   const fetchImpl=vi.fn(async()=>respuesta())
   const hora=_caso==='cabecera HTML'?'01':'02'
   const resultado=await syncSmnAlertas({ahora:new Date(`2026-11-01T${hora}:00:00Z`),fetchImpl})
   expect(resultado.estado).toBe('bloqueado_por_origen')
   expect(resultado.mensaje).toContain('HTML en lugar de XML')
   expect(fetchImpl).toHaveBeenCalledTimes(1)
   expect((await db.select().from(smnAlerta)).find(x=>x.id==='conservada')?.raw).toBe('fixture')
   expect((await db.select().from(infraJobRun)).some(x=>x.estado==='fallido'&&x.errorSaneado?.includes('HTML en lugar de XML'))).toBe(true)
 })

 it('registra salud ok tras una sincronización exitosa del SMN', async () => {
   const fetchImpl = vi.fn(async () => new Response('<rss><channel></channel></rss>', { status: 200, headers: { 'content-type': 'application/xml' } }))
   const resultado = await syncSmnAlertas({ ahora: new Date('2026-11-01T03:00:00Z'), fetchImpl })
   expect(resultado.estado).toBe('completo')
   const [salud] = await getDb().select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, 'smn-alertas'))
   expect(salud?.estado).toBe('ok')
   expect(salud?.ultimoErrorSaneado).toBeNull()
   expect(salud?.ttlMinutos).toBe(60)
 })

 it('registra salud degradado ante HTTP 429 sin filtrar el cuerpo del proveedor', async () => {
   const fetchImpl = vi.fn(async () => new Response('rate limit apikey=SECRETO-123', { status: 429 }))
   await expect(syncSmnAlertas({ ahora: new Date('2026-11-01T04:00:00Z'), fetchImpl })).rejects.toThrow('HTTP 429')
   const [salud] = await getDb().select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, 'smn-alertas'))
   expect(salud?.estado).toBe('degradado')
   expect(salud?.ultimoErrorSaneado).toBe('SMN limitó las consultas (HTTP 429)')
   expect(salud?.ultimoErrorSaneado).not.toContain('SECRETO')
 })

 it('registra salud no_disponible con mensaje fijo ante otro error sin filtrar secretos', async () => {
   const fetchImpl = vi.fn(async () => { throw new Error('connect ECONNRESET apikey=SECRETO-123') })
   await expect(syncSmnAlertas({ ahora: new Date('2026-11-01T05:00:00Z'), fetchImpl })).rejects.toThrow('SECRETO-123')
   const [salud] = await getDb().select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, 'smn-alertas'))
   expect(salud?.estado).toBe('no_disponible')
   expect(salud?.ultimoErrorSaneado).toBe('fallo al sincronizar alertas del SMN')
   expect(salud?.ultimoErrorSaneado).not.toContain('SECRETO')
 })
 it('un fallo al escribir la salud tras un sync exitoso no altera el resultado ni crea un run fallido', async () => {
  const fallidosAntes = (await getDb().select().from(infraJobRun)).filter((x) => x.estado === 'fallido')
  vi.mocked(actualizarSaludFuente).mockRejectedValueOnce(new Error('SQLITE_BUSY tabla hazard_source_health'))
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const fetchImpl = vi.fn(async () => new Response('<rss><channel></channel></rss>', { status: 200, headers: { 'content-type': 'application/xml' } }))
  const resultado = await syncSmnAlertas({ ahora: new Date('2026-11-01T06:00:00Z'), fetchImpl })
  expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
  expect((await getDb().select().from(infraJobRun)).filter((x) => x.estado === 'fallido')).toHaveLength(fallidosAntes.length)
  expect(warn).toHaveBeenCalledOnce()
  expect(warn.mock.calls[0]?.join(' ')).not.toContain('SQLITE_BUSY')
  warn.mockRestore()
})
it('lista alertas no canceladas vigentes y próximas, sin vencidas, y deduplica por identifier',async()=>{const db=getDb(),baseRow={sender:'smn',sent:'2026-09-30T00:00:00Z',onset:'2026-09-30T00:00:00Z',event:'Tormentas',severity:'Moderate',departamentos:[],poligonos:[],raw:'<alert/>',fetchedAt:'2026-09-30T00:00:00Z'};await db.insert(smnAlerta).values([{id:'vigente',...baseRow,expires:'2026-10-01T00:00:00Z',cancelada:false},{id:'offset',...baseRow,onset:'2026-09-30T08:00:00-03:00',expires:'2026-09-30T10:00:00-03:00',cancelada:false},{id:'vencida',...baseRow,expires:'2026-09-29T00:00:00Z',cancelada:false},{id:'cancelada',...baseRow,expires:'2026-10-01T00:00:00Z',cancelada:true},{id:'proxima',...baseRow,onset:'2026-10-01T21:00:00-03:00',expires:'2026-10-02T09:00:00-03:00',cancelada:false}]);await db.insert(smnAlerta).values({id:'vigente',...baseRow,expires:'2026-10-01T00:00:00Z',cancelada:false}).onConflictDoUpdate({target:smnAlerta.id,set:{headline:'actualizada'}});const rows=await alertasSmnActivas(new Date('2026-09-30T12:00:00Z'));expect(rows.map(x=>x.id).sort()).toEqual(['conservada','offset','proxima','vigente']);expect(rows.slice(-2).map(x=>x.id)).toEqual(['proxima','conservada']);expect(await db.select().from(smnAlerta)).toHaveLength(6)})
})
