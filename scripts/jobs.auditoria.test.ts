import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { ejecutarJobAuditado, mensajeFalloDespacho } from './jobs.mjs'

const mocks = vi.hoisted(() => ({ enosJobsEnabled: vi.fn(() => true) }))
vi.mock('../lib/infraestructura/jobs/flags.ts', () => ({ enosJobsEnabled: mocks.enosJobsEnabled }))

const RAIZ = join(import.meta.dirname, '..')
const SIN_DESPACHO = { ejecutado: false, motivo: 'flag_deshabilitado' }

usarDbTemporal('jobs-auditoria', { env: { REGION: undefined, INFRA_AUDIT_TRIGGER: undefined, INVOCATION_ID: undefined, DATABASE_URL: undefined } })
beforeAll(() => migrarDb())
afterEach(() => {
  mocks.enosJobsEnabled.mockReset()
  mocks.enosJobsEnabled.mockImplementation(() => true)
})

const eventosDe = (nombre: string) => getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.accion, `job.${nombre}`))
const porFase = (filas: Awaited<ReturnType<typeof eventosDe>>, fase: string) =>
  filas.find(fila => (fila.metadatos as Record<string, unknown>).fase === fase)

describe('scripts/jobs.mjs: auditoría de jobs', () => {
  it('deja un evento de intención pendiente y un evento de resultado por corrida, con el mismo requestId', async () => {
    mocks.enosJobsEnabled.mockReturnValue(false)
    expect(await ejecutarJobAuditado('veredicto-cierre')).toEqual(SIN_DESPACHO)

    const filas = await eventosDe('veredicto-cierre')
    expect(filas).toHaveLength(2)
    expect(filas[0].requestId).toBe(filas[1].requestId)
    const intencion = porFase(filas, 'inicio')!
    const resultado = porFase(filas, 'fin')!
    expect(intencion).toMatchObject({ resultado: 'pendiente', actorTipo: 'sistema', viaAcceso: 'cli', metodo: 'CLI',
      objetoTipo: 'job', objetoId: 'veredicto-cierre', httpStatus: null })
    expect(resultado).toMatchObject({ resultado: 'exito', objetoId: 'veredicto-cierre', httpStatus: null })
  })

  it('no despacha el job cuando la intención no se puede guardar: falla cerrado y no deja eventos', async () => {
    await expect(conFalloAuditoria(() => ejecutarJobAuditado('calcular-riesgo'))).rejects.toThrow('auditoria_no_disponible')
    expect(mocks.enosJobsEnabled).not.toHaveBeenCalled()
    expect(await eventosDe('calcular-riesgo')).toHaveLength(0)
  })

  it('una excepción del job deja evento de error y relanza el error original', async () => {
    mocks.enosJobsEnabled.mockImplementationOnce(() => { throw new Error('fallo simulado del job') })
    await expect(ejecutarJobAuditado('sonda-cadena-datos')).rejects.toThrow('fallo simulado del job')

    const filas = await eventosDe('sonda-cadena-datos')
    expect(filas).toHaveLength(2)
    expect(porFase(filas, 'inicio')).toMatchObject({ resultado: 'pendiente' })
    expect(porFase(filas, 'fin')).toMatchObject({ resultado: 'error' })
  })

  it('un job que no aplica a la región se rechaza igual y deja el par intención + error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jobs-auditoria-region-'))
    writeFileSync(join(dir, 'manaos.json'), JSON.stringify({ id: 'manaos', fuentesRio: ['ana', 'sgb'] }))
    const previas = { REGION: process.env.REGION, ENOS_REGION_CONFIG_DIR: process.env.ENOS_REGION_CONFIG_DIR }
    try {
      process.env.REGION = 'manaos'
      process.env.ENOS_REGION_CONFIG_DIR = dir
      await expect(ejecutarJobAuditado('sync-prefectura-alturas')).rejects.toThrow('job sync-prefectura-alturas does not apply to region manaos')
    } finally {
      for (const [clave, valor] of Object.entries(previas)) {
        if (valor === undefined) delete process.env[clave]
        else process.env[clave] = valor
      }
      rmSync(dir, { recursive: true, force: true })
    }
    const filas = await eventosDe('sync-prefectura-alturas')
    expect(filas).toHaveLength(2)
    expect(porFase(filas, 'fin')).toMatchObject({ resultado: 'error' })
    expect(mocks.enosJobsEnabled).not.toHaveBeenCalled()
  })

  it('registra el disparador desde INFRA_AUDIT_TRIGGER y, sin él, desde INVOCATION_ID', async () => {
    mocks.enosJobsEnabled.mockReturnValue(false)
    const previas = { INFRA_AUDIT_TRIGGER: process.env.INFRA_AUDIT_TRIGGER, INVOCATION_ID: process.env.INVOCATION_ID }
    try {
      process.env.INFRA_AUDIT_TRIGGER = 'manual'
      await ejecutarJobAuditado('situacion-corte')
      delete process.env.INFRA_AUDIT_TRIGGER
      process.env.INVOCATION_ID = 'abc123'
      await ejecutarJobAuditado('centros-evacuados')
    } finally {
      for (const [clave, valor] of Object.entries(previas)) {
        if (valor === undefined) delete process.env[clave]
        else process.env[clave] = valor
      }
    }
    expect(porFase(await eventosDe('situacion-corte'), 'inicio')?.metadatos).toMatchObject({ disparador: 'manual' })
    expect(porFase(await eventosDe('centros-evacuados'), 'inicio')?.metadatos).toMatchObject({ disparador: 'systemd', invocacionId: 'abc123' })
  })

  it('un nombre de job desconocido se rechaza sin auditoría', async () => {
    await expect(ejecutarJobAuditado('no-existe')).rejects.toThrow('Job desconocido')
    expect(await eventosDe('no-existe')).toHaveLength(0)
  })

  it('el mensaje de falla de auditoría dice que el job no se registró y no oculta el código', () => {
    const mensaje = mensajeFalloDespacho('calcular-riesgo', new Error('auditoria_no_disponible'))
    expect(mensaje).toContain('auditoria_no_disponible')
    expect(mensaje).toContain('calcular-riesgo')
    expect(mensajeFalloDespacho('calcular-riesgo', new Error('otra falla'))).toBe('otra falla')
  })
})

describe('scripts/jobs.mjs por CLI: stdout y código de salida sin cambios', () => {
  it('stdout es el JSON de siempre y el código 0, con la auditoría activa y una base limpia', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jobs-auditoria-cli-'))
    try {
      const entorno: NodeJS.ProcessEnv = { ...process.env, DATA_DIR: dir, ENOS_JOBS_ENABLED: 'false', REGION: '' }
      delete entorno.DATABASE_URL
      delete entorno.INFRA_AUDIT_TRIGGER
      delete entorno.INVOCATION_ID
      const salida = spawnSync(process.execPath, ['scripts/jobs.mjs', 'veredicto-cierre'], { cwd: RAIZ, encoding: 'utf8', env: entorno, timeout: 120_000 })
      expect(salida.status).toBe(0)
      expect(salida.stdout).toBe(`${JSON.stringify(SIN_DESPACHO)}\n`)
      // Node avisa por stderr de los módulos .ts sin "type" en package.json (ya ocurre en el camino de flags.ts):
      // este test solo exige que no aparezca ningún fallo de auditoría.
      expect(salida.stderr).not.toContain('auditoria_no_disponible')
      expect(salida.stderr).not.toContain('[jobs] "veredicto-cierre": auditoria')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
