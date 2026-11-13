import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { cpus, tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb, getRawClient, migrarDb } from '@/lib/db'
import { resolvePoolConfig } from '@/lib/db/config-postgres'
import { bookletCampaign, bookletProduct, infraAfectacion, user } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { crearVerificacion } from '@/lib/infraestructura/verificaciones'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type * as Session from '@/lib/session'
import type * as Contexto from '@/lib/db/contexto'
import type * as ServidorAuditoria from './servidor'
import type { AccionAuditoria } from './catalogo'
import { POST as guardarParte } from '@/app/api/problematicas/parte/route'
import { POST as crearBorrador } from '@/app/api/problematicas/parte/borradores/route'
import { PUT as sincronizarBorrador } from '@/app/api/problematicas/parte/borradores/[draftId]/route'
import { POST as autorizarFotos } from '@/app/api/problematicas/parte/adjuntos/autorizaciones/route'
import { POST as responderVerificacion } from '@/app/api/problematicas/verificaciones/[id]/responder/route'
import { POST as guardarMotivo } from '@/app/api/infraestructura/motivos/route'
import { POST as guardarStock } from '@/app/api/cuadernillos/stock/route'
import { GET as situacion } from '@/app/api/infraestructura/situacion/route'
import { GET as totalesMapa } from '@/app/api/mapas/infraestructura/totales/route'

/*
 * Medición reproducible del presupuesto de rendimiento de la auditoría (A4).
 *
 * Opt-in: sin AUDITORIA_MEDIR=1 todo se omite. Secciones (AUDITORIA_MEDIR_SECCIONES, separadas por coma):
 *   escritura  rutas mutadoras auditadas: handler completo con y sin auditoría, modos alternados.
 *   lecturas   rutas de lectura no auditadas (situación y totales del mapa).
 *   microbench costo de getDb() con y sin contexto transaccional activo.
 *   visor      GET /api/infraestructura/auditoria sobre AUDITORIA_EVENTOS filas sembradas.
 *
 * La línea base "sin auditoría" existe solo dentro de este archivo: cambioAuditado ejecuta la transacción
 * de dominio igual que la real, sin la inserción del evento ni el contexto, y conAuditoria llama al handler.
 * Con DATABASE_URL la base debe llamarse *_test (desechable). Sin DATABASE_URL usa PGlite temporal.
 * El JSON se escribe en AUDITORIA_MEDICION_ARCHIVO o en el directorio temporal del sistema.
 */

const MEDIR = process.env.AUDITORIA_MEDIR === '1'
const SECCIONES = new Set((process.env.AUDITORIA_MEDIR_SECCIONES ?? 'escritura,lecturas,microbench,visor').split(',').map(s => s.trim()))
const MUESTRAS = Number(process.env.AUDITORIA_MUESTRAS ?? 60)
const CALENTAMIENTO = 10
const EVENTOS = Number(process.env.AUDITORIA_EVENTOS ?? 1_000_000)
const ARCHIVO = process.env.AUDITORIA_MEDICION_ARCHIVO ?? join(tmpdir(), 'auditoria-medicion.json')
const PRESUPUESTO_ESCRITURA_MS = 5
const PRESUPUESTO_VISOR_MS = 300

type CambioAuditado = typeof ServidorAuditoria.cambioAuditado
type EjecutorCambio = Parameters<CambioAuditado>[0]
type TxCambio = Parameters<EjecutorCambio>[0]

const medicion = vi.hoisted(() => ({ auditar: true }))
const sesion = vi.hoisted(() => ({
  user: { id: 'benchmark-admin', role: 'admin', banned: false, nivelJurIds: [] as string[], accesoRecursos: 'todos', recursoIds: [] as string[] },
}))

// Sin auditoría: misma transacción de dominio y mismo contexto transaccional que la versión real; no escribe evento.
vi.mock('./servidor', async importOriginal => {
  const actual = await importOriginal<typeof ServidorAuditoria>()
  const { getDb: obtenerDb } = await import('@/lib/db')
  const { transaccionContextual } = await import('@/lib/db/contexto')
  const sinAuditar = (ejecutar: EjecutorCambio, db = obtenerDb()) =>
    db.transaction(tx => transaccionContextual.run(tx, () => ejecutar(tx as TxCambio)))
  return {
    ...actual,
    conAuditoria: (accion: AccionAuditoria, ruta: string, ejecutar: (...args: unknown[]) => Promise<Response>) => {
      const auditado = actual.conAuditoria(accion, ruta, ejecutar)
      return (...args: unknown[]) => (medicion.auditar ? auditado(...args) : ejecutar(...args))
    },
    cambioAuditado: (ejecutar: EjecutorCambio, describir?: Parameters<CambioAuditado>[1], db?: Parameters<CambioAuditado>[2]) =>
      medicion.auditar ? actual.cambioAuditado(ejecutar, describir, db) : sinAuditar(ejecutar, db),
  }
})

// La sesión real observa la identidad para la auditoría; el módulo solo existe en la versión auditada.
vi.mock('@/lib/session', async importOriginal => {
  const actual = await importOriginal<typeof Session>()
  return {
    ...actual,
    getSessionUser: async () => {
      const contexto = await import('@/lib/infraestructura/auditoria/contexto').catch(() => null)
      contexto?.observarUsuarioAuditoria(sesion.user)
      return sesion.user
    },
  }
})
// Mismo criterio que los tests de cada ruta: el acceso al parte se mide aparte, no es parte de la auditoría.
vi.mock('@/lib/infraestructura/acceso-parte', () => ({ tieneAccesoAlParteParaCue: vi.fn(async () => true) }))

usarDbTemporal('auditoria-rendimiento', { seed: false, env: {
  PROBLEMATICAS_ACCESO_PASSWORD: 'prueba-auditoria-rendimiento',
  REPORTES_OFFLINE_BORRADORES_SYNC: 'true',
  REPORTES_OFFLINE_FOTOS: 'true',
  OBS_BUCKET: 'auditoria-local', OBS_REGION: 'us-east-1', OBS_ENDPOINT: 'https://obs.example.test',
  OBS_ACCESS_KEY_ID: 'benchmark-local', OBS_SECRET_ACCESS_KEY: 'benchmark-local-no-network',
} })


/** INSERT ... SELECT de `cantidad` filas con valores aleatorios reproducibles en distribución (no bit a bit). */
function sqlSemilla(cantidad: number, acciones: string, rara: string) {
  return `
      INSERT INTO auditoria_evento (id, request_id, ocurrido_en, actor_tipo, actor_id, actor_rol, via_acceso, accion, metodo, ruta_plantilla,
        objeto_tipo, objeto_id, cue_anexo, resultado, http_status, duracion_ms, metadatos)
      SELECT
        gen_random_uuid()::text, gen_random_uuid()::text,
        date_trunc('milliseconds', timestamptz '2025-11-13 00:00:00+00' + d.r_fecha * interval '365 days'),
        CASE WHEN d.r_actor < 0.03 THEN 'sistema' ELSE 'usuario' END,
        CASE WHEN d.r_actor < 0.03 THEN 'infra-jobs' ELSE 'u-' || lpad(floor(d.r_usuario * 500)::int::text, 3, '0') END,
        CASE WHEN d.r_actor < 0.03 THEN NULL ELSE (ARRAY['admin','editor','consulta'])[1 + floor(d.r_rol * 3)::int] END,
        CASE WHEN d.r_actor < 0.03 THEN 'cli' ELSE 'sesion' END,
        d.accion,
        CASE WHEN d.r_metodo < 0.8 THEN 'POST' ELSE 'PUT' END,
        '/api/' || replace(d.accion, '.', '/'),
        (ARRAY['parte','borrador','verificacion','motivo','recurso','movimiento','campana','adjunto'])[1 + floor(d.r_objeto_tipo * 8)::int],
        'obj-' || lpad(floor(d.r_objeto * 300000)::int::text, 6, '0'),
        '1801605-' || lpad(floor(d.r_cue * 400)::int::text, 3, '0'),
        CASE WHEN d.r_resultado < 0.90 THEN 'exito' WHEN d.r_resultado < 0.94 THEN 'rechazado'
             WHEN d.r_resultado < 0.97 THEN 'invalido' WHEN d.r_resultado < 0.99 THEN 'conflicto' ELSE 'repetido' END,
        CASE WHEN d.r_resultado < 0.90 THEN 200 WHEN d.r_resultado < 0.94 THEN 403
             WHEN d.r_resultado < 0.97 THEN 400 WHEN d.r_resultado < 0.99 THEN 409 ELSE 200 END,
        1 + floor(d.r_duracion * 400)::int,
        jsonb_build_object(
          'movimientoId', gen_random_uuid()::text,
          'revision', floor(d.r_meta * 40)::int,
          'campos', jsonb_build_array('respuestas', 'paso'),
          'region', CASE WHEN d.r_cue < 0.8 THEN 'corrientes' ELSE 'manaos' END,
          'disparador', 'programado',
          'formato', 'pdf'
        )
      FROM (
        SELECT r_fecha, r_actor, r_usuario, r_rol, r_metodo, r_objeto_tipo, r_objeto, r_cue, r_resultado, r_duracion, r_meta,
          CASE WHEN r_accion < 0.0003 THEN ${rara} ELSE (ARRAY[${acciones}])[1 + floor(24 * power(r_accion / 0.9997, 3))::int] END AS accion
        FROM (
          SELECT random() AS r_fecha, random() AS r_actor, random() AS r_usuario, random() AS r_rol, random() AS r_metodo,
            random() AS r_objeto_tipo, random() AS r_objeto, random() AS r_cue, random() AS r_resultado, random() AS r_duracion,
            random() AS r_meta, random() AS r_accion
          FROM generate_series(1, ${cantidad})
        ) base
      ) d
    `
}

const resultados: Record<string, unknown> = {}

function guardarArchivo() {
  writeFileSync(ARCHIVO, JSON.stringify(resultados, null, 2))
}

function redondear(valor: number, decimales = 3) {
  return Number(valor.toFixed(decimales))
}

function percentil(ordenados: number[], p: number) {
  return ordenados[Math.min(ordenados.length - 1, Math.ceil(ordenados.length * p) - 1)]!
}

function resumen(muestras: number[]) {
  const ordenados = [...muestras].sort((a, b) => a - b)
  const media = muestras.reduce((a, b) => a + b, 0) / muestras.length
  return {
    n: muestras.length,
    p50: redondear(percentil(ordenados, 0.5)),
    p95: redondear(percentil(ordenados, 0.95)),
    p99: redondear(percentil(ordenados, 0.99)),
    media: redondear(media),
  }
}

/** Filas de un execute() en node-postgres y PGlite. */
function filasDe(resultado: unknown): Record<string, unknown>[] {
  return ((resultado as { rows?: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[]
}

async function contarEventos(ruta: string, metodo: string) {
  const filas = filasDe(await getDb().execute(sql`SELECT count(*) AS n FROM auditoria_evento WHERE ruta_plantilla = ${ruta} AND metodo = ${metodo}`))
  return Number(filas[0]!.n)
}

// Cada pedido tiene su propia IP: los límites por IP de las rutas no se mezclan con la medición.
let contadorIp = 0
function ipUnica() {
  contadorIp++
  return `10.${Math.floor(contadorIp / 65025) % 255}.${Math.floor(contadorIp / 255) % 255}.${contadorIp % 255}`
}

function pedido(ruta: string, cuerpo: unknown, metodo = 'POST', cookie?: string) {
  return new Request(`http://localhost${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ipUnica(), ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(cuerpo),
  })
}

type Escenario = {
  nombre: string
  ruta: string
  metodo: string
  esperado: number
  preparar: () => Promise<() => Promise<Response>>
}

/** Alterna modos por par, con calentamiento y el mismo pool. Cada modo debe escribir exactamente sus eventos. */
async function medirEscritura(escenario: Escenario) {
  const conAuditoriaMuestras: number[] = []
  const sinAuditoriaMuestras: number[] = []
  const antes = await contarEventos(escenario.ruta, escenario.metodo)
  let llamadasAuditadas = 0
  for (let i = 0; i < MUESTRAS + CALENTAMIENTO; i++) {
    for (const auditar of i % 2 ? [true, false] : [false, true]) {
      medicion.auditar = auditar
      const ejecutar = await escenario.preparar()
      const inicio = performance.now()
      const respuesta = await ejecutar()
      const cuerpo = await respuesta.json()
      const duracion = performance.now() - inicio
      expect(respuesta.status, `${escenario.nombre}: ${JSON.stringify(cuerpo)}`).toBe(escenario.esperado)
      if (auditar) llamadasAuditadas++
      if (i >= CALENTAMIENTO) (auditar ? conAuditoriaMuestras : sinAuditoriaMuestras).push(duracion)
    }
  }
  medicion.auditar = true
  const eventos = (await contarEventos(escenario.ruta, escenario.metodo)) - antes
  expect(eventos, `${escenario.nombre}: eventos escritos`).toBe(llamadasAuditadas)
  const sin = resumen(sinAuditoriaMuestras)
  const con = resumen(conAuditoriaMuestras)
  return {
    recorrido: escenario.nombre,
    ruta: escenario.ruta,
    sinAuditoria: sin,
    conAuditoria: con,
    delta: { p50: redondear(con.p50 - sin.p50), p95: redondear(con.p95 - sin.p95), p99: redondear(con.p99 - sin.p99) },
    eventosEscritos: eventos,
    presupuestoP95Ms: PRESUPUESTO_ESCRITURA_MS,
    cumplePresupuesto: con.p95 - sin.p95 <= PRESUPUESTO_ESCRITURA_MS,
  }
}

async function medirLectura(nombre: string, ejecutar: () => Promise<Response>) {
  const muestras: number[] = []
  for (let i = 0; i < MUESTRAS + CALENTAMIENTO; i++) {
    const inicio = performance.now()
    const respuesta = await ejecutar()
    await respuesta.text()
    const duracion = performance.now() - inicio
    expect(respuesta.status, nombre).toBe(200)
    if (i >= CALENTAMIENTO) muestras.push(duracion)
  }
  return { recorrido: nombre, ...resumen(muestras) }
}

const ruidoEntorno = () => ({
  cpu: cpus()[0]?.model ?? 'desconocido',
  nucleosLogicos: cpus().length,
  memoriaTotalMb: Math.round(totalmem() / 1024 / 1024),
  node: process.version,
  driver: process.env.DATABASE_URL ? 'postgres' : 'pglite',
  poolMax: resolvePoolConfig().max ?? 10,
  muestrasPorModo: MUESTRAS,
  calentamientoPares: CALENTAMIENTO,
})

beforeAll(() => {
  if (!MEDIR) return
  const url = process.env.DATABASE_URL
  if (url && !new URL(url).pathname.replace(/^\//, '').endsWith('_test')) {
    throw new Error('La medición requiere una base desechable cuyo nombre termine en _test')
  }
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe.skipIf(!MEDIR)('rendimiento de la auditoría', () => {
  it.skipIf(!SECCIONES.has('escritura'))('escritura: handler completo con y sin auditoría', async () => {
    await ensureSeeded()
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    await client.execute("INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2026, '2026-10-19T00:00:00Z', 'vigente')")
    const cueParte = '1801605-99'
    const cueBorrador = '1801605-98'
    for (const cue of [cueParte, cueBorrador]) {
      await client.execute(`INSERT INTO ge.ge_localizacion (cue_anexo, nombre, departamento, localidad) VALUES ('${cue}', 'Escuela de prueba', 'Capital', 'Corrientes')`)
      for (const id of [Number(`${cue.slice(-2)}10`), Number(`${cue.slice(-2)}20`)]) {
        await client.execute({ sql: "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, '1', 'A', 'PRIMARIA', 'MAÑANA')", args: [id, cue] })
      }
    }
    const cookie = `${NOMBRE_COOKIE}=${crearTokenSesion().token}`
    const parteSecciones = [Number(`${cueParte.slice(-2)}10`), Number(`${cueParte.slice(-2)}20`)]

    const altaInicial = await guardarParte(pedido('/api/problematicas/parte', {
      cue: cueParte, idempotencyKey: randomUUID(), rigeDesde: new Date().toISOString(),
      afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: parteSecciones }],
    }, 'POST', cookie))
    expect(altaInicial.status).toBe(201)
    const movimientoInicial = (await altaInicial.json()).movimientoId as string
    const [afectacion] = await getDb().select().from(infraAfectacion).limit(1)
    expect(afectacion).toBeDefined()

    const draftId = randomUUID()
    const creado = await crearBorrador(pedido('/api/problematicas/parte/borradores', {
      version: 1, draftId, generacion: 1,
      contexto: { version: 1, draftId, cue: cueBorrador, flujo: 'inicial', escuela: { nombre: 'Escuela', cue: cueBorrador, departamento: 'Capital' } },
      paso: 'situacion', respuestas: { estado: 'habitual' }, actividadEn: new Date().toISOString(),
    }))
    expect(creado.status).toBe(201)
    const paramsBorrador = { params: Promise.resolve({ draftId }) }
    let revisionEsperada = 0

    const verificacionesCreadas: Array<{ id: string; token: string }> = []
    let contadorCue = 0

    const motivoBase = randomUUID().slice(0, 8)
    const stockCampana = `camp-${randomUUID()}`
    const stockProducto = `prod-${randomUUID()}`
    await getDb().insert(user).values({ id: 'benchmark-admin', name: 'benchmark-admin', email: 'benchmark-admin@test.local', emailVerified: true }).onConflictDoNothing()
    await getDb().insert(bookletCampaign).values({ id: stockCampana, name: stockCampana, status: 'active', distributionEnabled: true, overassignmentAllowed: false })
    await getDb().insert(bookletProduct).values({ id: stockProducto, name: stockProducto, levelCode: '1', gradeCode: '1' })
    const stockInicial = await guardarStock(pedido('/api/cuadernillos/stock', {
      campaignId: stockCampana, productId: stockProducto, quantity: 5, movement: 'initial', idempotencyKey: randomUUID(),
    }, 'POST'))
    expect(stockInicial.status).toBe(200)

    const escenarios: Escenario[] = [
      {
        nombre: 'parte.guardar (confirma afectación existente)', ruta: '/api/problematicas/parte', metodo: 'POST', esperado: 201,
        preparar: async () => () => guardarParte(pedido('/api/problematicas/parte', {
          cue: cueParte, idempotencyKey: randomUUID(), rigeDesde: new Date().toISOString(), afectacionesConfirmadas: [afectacion!.id],
        }, 'POST', cookie)),
      },
      {
        nombre: 'borrador.sincronizar (PUT)', ruta: '/api/problematicas/parte/borradores/[draftId]', metodo: 'PUT', esperado: 200,
        preparar: async () => {
          const baseRevision = revisionEsperada++
          return () => sincronizarBorrador(pedido(`/api/problematicas/parte/borradores/${draftId}`, {
            version: 1, baseRevision, respuestas: { observacion: `revision-${baseRevision}` }, paso: 'situacion', actividadEn: new Date().toISOString(),
          }, 'PUT'), paramsBorrador)
        },
      },
      {
        nombre: 'foto.autorizar_carga', ruta: '/api/problematicas/parte/adjuntos/autorizaciones', metodo: 'POST', esperado: 200,
        preparar: async () => () => autorizarFotos(pedido('/api/problematicas/parte/adjuntos/autorizaciones', {
          movimientoId: movimientoInicial, adjuntos: [{ attachmentId: randomUUID(), bytesOptimizado: 1024, bytesMiniatura: 256 }],
        }, 'POST', cookie)),
      },
      {
        nombre: 'verificacion.responder', ruta: '/api/problematicas/verificaciones/[id]/responder', metodo: 'POST', esperado: 200,
        preparar: async () => {
          contadorCue++
          const creada = await crearVerificacion({ cueAnexo: `1801605-${700 + contadorCue}`, solicitadaPorUserId: 'user-director' })
          if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
          verificacionesCreadas.push({ id: creada.verificacion.id, token: creada.token })
          const { id, token } = verificacionesCreadas.at(-1)!
          return () => responderVerificacion(pedido(`/api/problematicas/verificaciones/${id}/responder`, { token, resultado: 'no_disponible' }),
            { params: Promise.resolve({ id }) })
        },
      },
      {
        nombre: 'motivo.guardar (admin)', ruta: '/api/infraestructura/motivos', metodo: 'POST', esperado: 200,
        preparar: async () => () => guardarMotivo(pedido('/api/infraestructura/motivos', {
          id: randomUUID(), nombre: `Motivo ${motivoBase}-${randomUUID()}`, categoria: 'establecimiento',
        })),
      },
      {
        nombre: 'cuadernillo.stock_guardar', ruta: '/api/cuadernillos/stock', metodo: 'POST', esperado: 200,
        preparar: async () => () => guardarStock(pedido('/api/cuadernillos/stock', {
          campaignId: stockCampana, productId: stockProducto, quantity: 1, movement: 'replenishment', idempotencyKey: randomUUID(),
        })),
      },
    ]

    const resultadosEscritura = []
    for (const escenario of escenarios) {
      resultadosEscritura.push(await medirEscritura(escenario))
      resultados.escritura = resultadosEscritura
      resultados.entorno = ruidoEntorno()
      guardarArchivo()
    }
    expect(resultadosEscritura).toHaveLength(escenarios.length)
    expect(verificacionesCreadas.length).toBeGreaterThan(0)
  }, 1_800_000)

  it.skipIf(!SECCIONES.has('lecturas'))('lecturas no auditadas: situación y totales del mapa', async () => {
    await ensureSeeded()
    const lecturas = [
      await medirLectura('infraestructura.situacion.get', () => situacion(new Request('http://localhost/api/infraestructura/situacion', { headers: { 'x-forwarded-for': ipUnica() } }))),
      await medirLectura('mapas.infraestructura.totales.get', () => totalesMapa(new Request('http://localhost/api/mapas/infraestructura/totales', { headers: { 'x-forwarded-for': ipUnica() } }))),
    ]
    resultados.lecturas = lecturas
    resultados.entorno = ruidoEntorno()
    guardarArchivo()
  }, 600_000)

  it.skipIf(!SECCIONES.has('microbench'))('microbench: getDb() con y sin contexto transaccional', async () => {
    const llamadas = 1_000_000
    const db = getDb()
    const medir = (ejecutar: () => unknown) => {
      for (let i = 0; i < 100_000; i++) ejecutar()
      const inicio = performance.now()
      for (let i = 0; i < llamadas; i++) ejecutar()
      return redondear(((performance.now() - inicio) * 1e6) / llamadas, 1)
    }
    let contextual: typeof Contexto | null = null
    try {
      contextual = await import('@/lib/db/contexto')
    } catch {
      contextual = null
    }
    const sinContexto = medir(() => getDb())
    if (!contextual) {
      resultados.microbench = { llamadas, getDbSinContextoNs: sinContexto, getDbConContextoNs: null, nota: 'sin AsyncLocalStorage transaccional en esta revisión' }
    } else {
      const { transaccionContextual } = contextual
      const conContexto = transaccionContextual.run(db, () => medir(() => getDb()))
      const soloLookup = transaccionContextual.run(db, () => medir(() => transaccionContextual.getStore()))
      resultados.microbench = {
        llamadas,
        getDbSinContextoNs: sinContexto,
        getDbConContextoNs: conContexto,
        getStoreConContextoNs: soloLookup,
        deltaNs: redondear(conContexto - sinContexto, 1),
      }
    }
    resultados.entorno = ruidoEntorno()
    guardarArchivo()
  }, 600_000)

  it.skipIf(!SECCIONES.has('visor'))('visor: GET /api/infraestructura/auditoria con EVENTOS sembrados', async () => {
    await migrarDb()
    const { ACCIONES_AUDITORIA } = await import('./catalogo')
    const { GET } = await import('@/app/api/infraestructura/auditoria/route')
    const existentes = filasDe(await getDb().execute(sql`SELECT count(*) AS n FROM auditoria_evento`))
    if (Number(existentes[0]!.n) !== 0) throw new Error('La medición del visor requiere una tabla auditoria_evento vacía (base nueva)')

    const acciones = ACCIONES_AUDITORIA.slice(0, -1).map(a => `'${a}'`).join(',')
    const rara = `'${ACCIONES_AUDITORIA.at(-1)}'`
    const inicioSiembra = performance.now()
    // Por tandas: una sola sentencia de 1 millón superaría el statement_timeout de la conexión (30 s por defecto).
    const TANDA = 100_000
    for (let restantes = EVENTOS; restantes > 0; restantes -= TANDA) {
      await getDb().execute(sql.raw(sqlSemilla(Math.min(TANDA, restantes), acciones, rara)))
    }
    await getDb().execute(sql.raw('ANALYZE auditoria_evento'))
    const sembrado = performance.now() - inicioSiembra

    const storage = filasDe(await getDb().execute(sql`
      SELECT count(*) AS filas,
        pg_total_relation_size('auditoria_evento') AS total_bytes,
        pg_relation_size('auditoria_evento') AS tabla_bytes,
        pg_indexes_size('auditoria_evento') AS indices_bytes,
        avg(octet_length(metadatos::text)) AS metadatos_promedio_bytes
      FROM auditoria_evento`))[0]!
    const indices = filasDe(await getDb().execute(sql`
      SELECT indexname AS nombre, pg_relation_size(indexname::regclass) AS bytes
      FROM pg_indexes WHERE tablename = 'auditoria_evento' ORDER BY indexname`))
    const filas = Number(storage.filas)
    const bytesPorFila = Number(storage.total_bytes) / filas

    const frecuente = filasDe(await getDb().execute(sql`SELECT accion FROM auditoria_evento GROUP BY accion ORDER BY count(*) DESC LIMIT 1`))[0]!.accion as string
    const actorTipico = filasDe(await getDb().execute(sql`SELECT actor_id FROM auditoria_evento WHERE actor_id LIKE 'u-%' LIMIT 1`))[0]!.actor_id as string
    const objetoTipico = filasDe(await getDb().execute(sql.raw(`SELECT objeto_id FROM auditoria_evento OFFSET ${Math.floor(filas / 2)} LIMIT 1`)))[0]!.objeto_id as string
    const accionRara = ACCIONES_AUDITORIA.at(-1) as string

    const pedirVisor = (query: string) => GET(new Request(`http://localhost/api/infraestructura/auditoria${query}`, { headers: { 'x-forwarded-for': ipUnica() } }))
    async function cursorDePagina(numero: number) {
      let cursor: string | null = null
      for (let p = 1; p < numero; p++) {
        const respuesta = await pedirVisor(cursor ? `?cursor=${encodeURIComponent(cursor)}` : '')
        cursor = (await respuesta.json()).nextCursor as string | null
        expect(cursor, `pagina ${p}`).not.toBeNull()
      }
      return cursor!
    }
    const cursorPagina200 = await cursorDePagina(200)

    const desde = '2026-06-01T00:00:00.000Z'
    const hasta = '2026-06-02T00:00:00.000Z'
    const escenarios: Array<{ nombre: string; query: string }> = [
      { nombre: 'primera pagina (limite 50)', query: '' },
      { nombre: 'pagina 200 por cursor', query: `?cursor=${encodeURIComponent(cursorPagina200)}` },
      { nombre: `actor ${actorTipico}`, query: `?actorId=${actorTipico}` },
      { nombre: `accion frecuente ${frecuente}`, query: `?accion=${encodeURIComponent(frecuente)}` },
      { nombre: `accion rara ${accionRara}`, query: `?accion=${encodeURIComponent(accionRara)}` },
      { nombre: 'accion sin coincidencias', query: '?accion=accion.inexistente' },
      { nombre: 'objeto', query: `?objetoId=${encodeURIComponent(objetoTipico)}` },
      { nombre: 'rango de un dia', query: `?desde=${desde}&hasta=${hasta}` },
      { nombre: 'resultado exito', query: '?resultado=exito' },
      { nombre: 'resultado sin coincidencias (error)', query: '?resultado=error' },
    ]

    const medidas = []
    for (const escenario of escenarios) {
      const muestras: number[] = []
      let items = 0
      for (let i = 0; i < 100 + 5; i++) {
        const inicio = performance.now()
        const respuesta = await pedirVisor(escenario.query)
        const cuerpo = await respuesta.json()
        const duracion = performance.now() - inicio
        expect(respuesta.status, escenario.nombre).toBe(200)
        items = cuerpo.items.length
        if (i >= 5) muestras.push(duracion)
      }
      const r = resumen(muestras)
      medidas.push({ recorrido: escenario.nombre, ...r, itemsPorPagina: items, cumplePresupuesto: r.p95 < PRESUPUESTO_VISOR_MS })
      resultados.visor = { ...resultados.visor as object, escenarios: medidas }
      guardarArchivo()
    }

    resultados.visor = {
      eventos: filas,
      presupuestoP95Ms: PRESUPUESTO_VISOR_MS,
      sembradoSegundos: redondear(sembrado / 1000, 1),
      almacenamiento: {
        totalBytes: Number(storage.total_bytes),
        tablaBytes: Number(storage.tabla_bytes),
        indicesBytes: Number(storage.indices_bytes),
        bytesPorFilaTotal: redondear(bytesPorFila, 1),
        metadatosPromedioBytes: redondear(Number(storage.metadatos_promedio_bytes), 1),
        indices: indices.map(i => ({ nombre: i.nombre, bytes: Number(i.bytes) })),
      },
      escenarios: medidas,
    }
    resultados.entorno = ruidoEntorno()
    guardarArchivo()
    expect(medidas).toHaveLength(escenarios.length)
  }, 3_600_000)
})
