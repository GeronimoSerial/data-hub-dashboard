import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ acceso: { ok: true, user: { id: 'test' } } as { ok: boolean; status?: number; user?: { id: string } }, enabled: true, run: null as unknown, alertas: [] as unknown[], ensemble: null as unknown }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn(async () => mocks.acceso) }))
vi.mock('@/lib/infraestructura/riesgo/flags', () => ({ riskRadarEnabled: vi.fn(() => mocks.enabled) }))
vi.mock('@/lib/infraestructura/radar-meteo/job-sync', () => ({ obtenerUltimoRunRadarMeteo: vi.fn(async () => mocks.run) }))
vi.mock('@/lib/infraestructura/radar-meteo/smn-alertas', () => ({ alertasSmnActivas: vi.fn(async () => mocks.alertas), severidadCAPEnEspanol: (s:string) => s==='Moderate'?'Moderada':s }))
vi.mock('@/lib/infraestructura/radar-meteo/ensemble', () => ({ alertasAndEnsemble: vi.fn(async () => mocks.ensemble) }))
vi.mock('@/lib/infraestructura/radar-meteo/verificacion', () => ({ obtenerMetricasVerificacion: vi.fn(async () => ({ estado: 'sin_datos', sesgoMm: null, pod: null, far: null, nPares: 0, nEventos: 0, desde: '2026-09-16', hasta: '2026-09-29', cobertura: 0 })) }))
import { GET } from './route'
const req = (headers?: HeadersInit) => new Request('http://localhost/api/infraestructura/radar-meteo/resumen', { headers })
describe('GET /api/infraestructura/radar-meteo/resumen', () => {
  beforeEach(() => { mocks.acceso = { ok: true, user: { id: 'test' } }; mocks.enabled = true; mocks.run = null; mocks.alertas=[]; mocks.ensemble=null })
  afterEach(() => { vi.useRealTimers() })
  it('requiere acceso y respeta el flag', async () => {
    mocks.acceso = { ok: false, status: 401 }
    expect((await GET(req())).status).toBe(401)
    mocks.acceso = { ok: true, user: { id: 'test' } }; mocks.enabled = false
    expect((await GET(req())).status).toBe(404)
  })
  it('devuelve sinDatos explícito y conserva ETag/cache', async () => {
    const response = await GET(req())
    expect(await response.json()).toMatchObject({ sinDatos: true, runId: null, dias: [], departamentos: [], alertasSmn: [], verificacion: { estado: 'sin_datos' } })
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=300')
    expect((await GET(req({ 'If-None-Match': response.headers.get('ETag')! }))).status).toBe(304)
  })
  it('combina las alertas activas y el ensemble con el resumen por día', async () => {
    // El resumen sólo incluye días desde hoy (Buenos Aires): fijar el reloj al día del run.
    vi.setSystemTime(new Date('2026-09-30T12:00:00-03:00'))
    mocks.run = { id:'radar-1', runAt:'2026-09-30T12:00:00Z', gridVersion:'g', payload:{times:['2026-09-30T12:00:00Z'],cells:[],values:{}} }
    const resumenDiario={p10:1,p50:2,p90:3,pMayor10:.4,pMayor25:.2,pMayor50:.1,miembrosValidos:50}
    mocks.ensemble={runId:'ens-1',runAt:'2026-09-30T12:00:00Z',modelo:'ecmwf_ifs025',diarios:{'18133':{'2026-09-30':resumenDiario}}}
    mocks.alertas=[{id:'alert-1',severity:'Moderate',departamentos:[{id:'18133',nombre:'San Cosme'}]}]
    const body=await (await GET(req())).json()
    expect(body.alertasSmn).toHaveLength(1)
    expect(body.ensamble).toMatchObject({runId:'ens-1',modelo:'ecmwf_ifs025'})
    expect(body.departamentos.find((d:{id:string})=>d.id==='18133').dias[0].ensamble).toEqual(resumenDiario)
  })
  it('refreshes the cached local-day summary after midnight in Buenos Aires', async () => {
    mocks.run = { id:'radar-1', runAt:'2026-09-30T12:00:00Z', gridVersion:'g', payload:{times:['2026-09-30T12:00:00Z'],cells:[],values:{}} }
    vi.setSystemTime(new Date('2026-09-30T23:59:00-03:00'))
    const antes = await GET(req())
    vi.setSystemTime(new Date('2026-10-01T00:01:00-03:00'))
    const despues = await GET(req({ 'If-None-Match': antes.headers.get('ETag')! }))
    expect(despues.status).toBe(200)
    expect(despues.headers.get('ETag')).not.toBe(antes.headers.get('ETag'))
    vi.useRealTimers()
  })
})
