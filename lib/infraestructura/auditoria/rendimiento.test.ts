import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { getDb, getRawClient } from '@/lib/db'
import { infraAfectacion } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { POST as guardarParte } from '@/app/api/problematicas/parte/route'
import { POST as crearBorrador } from '@/app/api/problematicas/parte/borradores/route'
import { PUT as sincronizarBorrador } from '@/app/api/problematicas/parte/borradores/[draftId]/route'
import { POST as crearVerificacion } from '@/app/api/infraestructura/verificaciones/route'
import { POST as responderVerificacion } from '@/app/api/problematicas/verificaciones/[id]/responder/route'
import { POST as autorizarFotos } from '@/app/api/problematicas/parte/adjuntos/autorizaciones/route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type * as ServidorAuditoria from './servidor'

usarDbTemporal('auditoria-rendimiento', { seed: false })

// Only this test bypasses the route wrapper to measure the same workload without the event.
const medicion = vi.hoisted(() => ({ auditar: true }))
vi.mock('./servidor', async importOriginal => {
  const actual = await importOriginal<typeof ServidorAuditoria>()
  return { ...actual, conAuditoria: (accion: string, ruta: string, ejecutar: (...args: unknown[]) => Promise<Response>) => {
    const auditado = actual.conAuditoria(accion, ruta, ejecutar)
    return (...args: unknown[]) => medicion.auditar ? auditado(...args) : ejecutar(...args)
  } }
})
vi.mock('@/lib/session', () => ({ getSessionUser: async () => ({ id: 'benchmark-admin', role: 'admin', banned: false }), staffGuard: () => null }))
vi.mock('@/lib/infraestructura/limites', () => ({ getClientIp: () => 'local', ipExcedeLimite: () => false }))

function percentiles(datos: number[]) {
  const ordenados = [...datos].sort((a, b) => a - b)
  const valor = (p: number) => Number(ordenados[Math.ceil(ordenados.length * p) - 1].toFixed(3))
  return { p50: valor(.5), p95: valor(.95), solicitudesPorSegundo: Number((datos.length * 1000 / datos.reduce((a,b) => a+b, 0)).toFixed(1)) }
}

it.skipIf(process.env.AUDITORIA_MEDIR !== '1')('mide parte, sync, firmas de fotos y verificación en una base temporal', async () => {
  const previas = { ...process.env }
  const medidas: Record<string, unknown>[] = []
  try {
    if (process.env.DATABASE_URL && !new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) {
      throw new Error('La medición requiere una base desechable cuyo nombre termine en _test')
    }
    Object.assign(process.env, {
      PROBLEMATICAS_ACCESO_PASSWORD: 'prueba-auditoria-rendimiento', REPORTES_OFFLINE_BORRADORES_SYNC: 'true', REPORTES_OFFLINE_FOTOS: 'true',
      OBS_BUCKET: 'auditoria-local', OBS_REGION: 'us-east-1', OBS_ENDPOINT: 'https://obs.example.test',
      OBS_ACCESS_KEY_ID: 'benchmark-local', OBS_SECRET_ACCESS_KEY: 'benchmark-local-no-network',
    })
    await ensureSeeded()
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    await client.execute("INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2026, '2026-10-19T00:00:00Z', 'vigente')")
    const cue = '1801605-99'
    await client.execute("INSERT INTO ge.ge_localizacion (cue_anexo, nombre, departamento, localidad) VALUES ('1801605-99', 'Escuela de prueba', 'Capital', 'Corrientes')")
    for (const id of [9910,9920]) await client.execute({ sql: "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, '1', 'A', 'PRIMARIA', 'MAÑANA')", args: [id, cue] })
    const cookie = `${NOMBRE_COOKIE}=${crearTokenSesion().token}`
    function request(ruta: string, body: unknown, method = 'POST') {
      return new Request(`http://localhost${ruta}`, { method, headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    async function exitoso(respuesta: Response) {
      const body = await respuesta.json()
      expect(respuesta.status, JSON.stringify(body)).toBeLessThan(300)
      return body
    }
    const inicial = await exitoso(await guardarParte(request('/api/problematicas/parte', {
      cue, idempotencyKey: randomUUID(), rigeDesde: new Date().toISOString(),
      afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [9910] }],
    })))
    const [afectacion] = await getDb().select().from(infraAfectacion)
    const draftId = randomUUID()
    await exitoso(await crearBorrador(request('/api/problematicas/parte/borradores', {
      version: 1, draftId, generacion: 1, contexto: { version: 1, draftId, cue, flujo: 'inicial', escuela: { nombre: 'Escuela', cue, departamento: 'Capital' } },
      paso: 'situacion', respuestas: { estado: 'habitual' }, actividadEn: new Date().toISOString(),
    })))
    let revision = 0
    const flujos: Record<string, () => Promise<() => Promise<Response>>> = {
      parte: async () => () => guardarParte(request('/api/problematicas/parte', {
        cue, idempotencyKey: randomUUID(), rigeDesde: new Date().toISOString(), afectacionesConfirmadas: [afectacion.id],
      })),
      sync: async () => () => sincronizarBorrador(request('/api/problematicas/parte/borradores/id', {
        version: 1, baseRevision: revision++, paso: 'evidencias', actividadEn: new Date().toISOString(), respuestas: { descripcion: `revision-${revision}` },
      }, 'PUT'), { params: Promise.resolve({ draftId }) }),
      fotos: async () => () => autorizarFotos(request('/api/problematicas/parte/adjuntos/autorizaciones', {
        movimientoId: inicial.movimientoId, adjuntos: [{ attachmentId: randomUUID(), bytesOptimizado: 1024, bytesMiniatura: 256 }],
      })),
      verificacion: async () => {
        const creada = await exitoso(await crearVerificacion(request('/api/infraestructura/verificaciones', { cueAnexo: cue })))
        return () => responderVerificacion(request('/api/problematicas/verificaciones/id/responder', { token: creada.token, resultado: 'no_disponible' }), { params: Promise.resolve({ id: creada.verificacion.id }) })
      },
    }
    for (const [flujo, preparar] of Object.entries(flujos)) {
      const sin: number[] = [], con: number[] = []
      // Alternate modes under the same load and connection pool to reduce warm-up bias.
      for (let i=0; i<70; i++) {
        for (const auditar of i%2 ? [true,false] : [false,true]) {
          medicion.auditar = auditar
          const ejecutar = await preparar()
          const inicio = performance.now()
          await exitoso(await ejecutar())
          if (i>=10) (auditar ? con : sin).push(performance.now()-inicio)
        }
      }
      const sinAuditoria = percentiles(sin), conAuditoria = percentiles(con)
      medidas.push({ driver: process.env.DATABASE_URL ? 'postgres' : 'pglite', flujo, muestrasPorModo: con.length,
        sinAuditoria, conAuditoria, deltaP95Ms: Number((conAuditoria.p95-sinAuditoria.p95).toFixed(3)) })
    }
    writeFileSync(process.env.AUDITORIA_MEDICION_ARCHIVO ?? '/tmp/auditoria-medicion.json', JSON.stringify(medidas, null, 2))
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previas)) delete process.env[key]
    Object.assign(process.env, previas)
  }
}, 60_000)
