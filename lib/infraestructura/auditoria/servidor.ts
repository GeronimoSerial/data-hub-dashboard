import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { getDb, migrarDb } from '@/lib/db'
import { transaccionContextual } from '@/lib/db/contexto'
import { auditoriaEvento } from '@/lib/db/schema'
import type { AccionAuditoria } from './catalogo'
import { contextoAuditoria, describirAuditoria, type ContextoAuditoria, type DatosAuditoria } from './contexto'

type Db = ReturnType<typeof getDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DescripcionResultado = DatosAuditoria & { status: number }
const CLAVES = new Set([
  'movimientoId', 'draftId', 'verificacionId', 'attachmentId', 'parteId', 'enlaceId', 'permisoId',
  'revision', 'campos', 'formato', 'cantidad', 'jobRunId', 'versionId', 'datasetId', 'disparador', 'invocacionId', 'fase',
])

export function metadatosPermitidos(datos: Record<string, unknown> = {}) {
  const salida: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(datos)) {
    if (!CLAVES.has(clave)) continue
    if (clave === 'revision') {
      if (Number.isFinite(valor)) salida[clave] = valor
      continue
    }
    if (typeof valor === 'number' && Number.isFinite(valor)) salida[clave] = valor
    if (typeof valor === 'string' && /^[\p{L}\p{N}_.:-]{1,128}$/u.test(valor)) salida[clave] = valor
    if (Array.isArray(valor) && valor.length <= 30 && valor.every(v => typeof v === 'string' && /^[a-zA-Z0-9_.-]{1,64}$/.test(v))) salida[clave] = valor
  }
  return Buffer.byteLength(JSON.stringify(salida)) <= 3500 ? salida : {}
}

function resultadoHttp(status: number) {
  if (status >= 500) return 'error'
  if (status === 409) return 'conflicto'
  if (status === 401 || status === 403 || status === 429) return 'rechazado'
  if (status >= 400) return 'invalido'
  return 'exito'
}

function referencia(valor: string | null | undefined) {
  return valor && /^[\p{L}\p{N}_.:-]{1,128}$/u.test(valor) ? valor : null
}

/** Inserta el evento. Si falla, marca el contexto y lanza; quien llama decide la revisión. */
async function escribir(db: Pick<Db, 'insert'>, contexto: ContextoAuditoria, status: number) {
  try {
    await db.insert(auditoriaEvento).values({
      id: contexto.id, requestId: contexto.requestId, ocurridoEn: contexto.ocurridoEn,
      actorTipo: contexto.actorTipo, actorId: referencia(contexto.actorId), actorRol: referencia(contexto.actorRol),
      viaAcceso: contexto.viaAcceso, accion: contexto.accion, metodo: contexto.metodo,
      rutaPlantilla: contexto.rutaPlantilla, objetoTipo: contexto.objetoTipo,
      objetoId: referencia(contexto.objetoId), cueAnexo: referencia(contexto.cueAnexo),
      resultado: contexto.resultado === 'sin_cambio' && status === 409 ? 'sin_cambio'
        : status >= 400 ? resultadoHttp(status) : contexto.resultado ?? resultadoHttp(status),
      httpStatus: contexto.metodo === 'CLI' ? null : status,
      duracionMs: Math.min(2_147_483_647, Math.round(performance.now() - contexto.inicio)),
      metadatos: metadatosPermitidos(contexto.metadatos),
    })
  } catch {
    contexto.fallo = true
    throw new Error('auditoria_no_disponible')
  }
}

/** Evento fuera de cualquier transacción. Nunca lanza: deja `fallo` marcado si no se pudo guardar. */
async function escribirFuera(contexto: ContextoAuditoria, status: number) {
  try {
    await escribir(getDb(), contexto, status)
    contexto.persistido = true
  } catch {
    /* contexto.fallo ya quedó marcado */
  }
}

/** The callback prepares the result before the event and domain changes commit together. */
export async function cambioAuditado<T>(
  ejecutar: (tx: Tx) => Promise<T>,
  describir: (valor: T) => DescripcionResultado = () => ({ status: 200 }),
  db: Db = getDb(),
): Promise<T> {
  const contexto = contextoAuditoria.getStore()
  if (contexto?.persistido) throw new Error('La solicitud ya confirmó su auditoría')
  const valor = await db.transaction(async tx => {
    const cuerpo = async () => {
      const resultado = await ejecutar(tx)
      if (contexto) {
        const datos = describir(resultado)
        describirAuditoria(datos)
        await escribir(tx, contexto, datos.status)
      }
      return resultado
    }
    // Sin contexto no hay evento que escribir: no se expone la transacción a getDb().
    return contexto ? transaccionContextual.run(tx, cuerpo) : cuerpo()
  })
  if (contexto) contexto.persistido = true
  return valor
}

export function respuestaAuditada(ejecutar: () => Promise<Response>): Promise<Response> {
  return cambioAuditado(ejecutar, response => ({ status: response.status }))
}

const NO_STORE = { 'Cache-Control': 'private, no-store' }
function nuevoContexto(accion: string, rutaPlantilla: string, metodo: string): ContextoAuditoria {
  return {
    id: randomUUID(), requestId: randomUUID(), ocurridoEn: new Date(), inicio: performance.now(),
    accion, rutaPlantilla, metodo,
    actorTipo: 'anonimo', actorId: null, actorRol: null, viaAcceso: 'sin_identificar',
    persistido: false, fallo: false,
  }
}

/** 503 sin cookies ni URLs de la respuesta descartada: solo se devuelve el código y el id de correlación. */
function respuestaNoDisponible(contexto: ContextoAuditoria): Response {
  console.error('[auditoria] persistencia fallida', { requestId: contexto.requestId, accion: contexto.accion })
  return Response.json(
    { code: 'auditoria_no_disponible', error: 'No se pudo registrar la operación. Reintentá en unos instantes.' },
    { status: 503, headers: { ...NO_STORE, 'X-Request-Id': contexto.requestId, 'X-Audit-Id': contexto.requestId } },
  )
}

export async function lecturaAuditada<T>(accion: AccionAuditoria, ruta: string, ejecutar: () => Promise<T>, describir: (valor: T) => DescripcionResultado): Promise<T> {
  const contexto = nuevoContexto(accion, ruta, 'GET')
  return contextoAuditoria.run(contexto, async () => {
    try {
      const valor = await ejecutar()
      const datos = describir(valor)
      describirAuditoria(datos)
      await escribir(getDb(), contexto, datos.status)
      contexto.persistido = true
      return valor
    } catch (error) {
      if (!contexto.fallo && !contexto.persistido) await escribirFuera(contexto, 500)
      throw error
    }
  })
}

/** Jobs can commit several batches and affect OBS: persist intent before dispatch. */
export async function jobAuditado<T>(nombre: string, ejecutar: () => Promise<T>, exitoso: (valor: T) => boolean): Promise<T> {
  const contexto = nuevoContexto(`job.${nombre}`, 'scripts/jobs.mjs', 'CLI')
  contexto.actorTipo = 'sistema'
  contexto.actorId = referencia(process.env.INFRA_AUDIT_OPERATOR) ?? 'infra-jobs'
  contexto.viaAcceso = 'cli'
  contexto.objetoTipo = 'job'
  contexto.objetoId = nombre
  contexto.resultado = 'pendiente'
  const declarado = process.env.INFRA_AUDIT_TRIGGER
  const disparador = declarado === 'manual' || declarado === 'programado'
    ? declarado : process.env.INVOCATION_ID ? 'systemd' : 'cli'
  contexto.metadatos = { fase: 'inicio', disparador, invocacionId: process.env.INVOCATION_ID }
  await migrarDb()
  await escribir(getDb(), contexto, 202)
  contexto.id = randomUUID()
  contexto.resultado = undefined
  contexto.metadatos = { ...contexto.metadatos, fase: 'fin' }
  try {
    const valor = await ejecutar()
    contexto.ocurridoEn = new Date()
    if (valor && typeof valor === 'object' && 'jobRunId' in valor) contexto.metadatos.jobRunId = valor.jobRunId
    await escribir(getDb(), contexto, exitoso(valor) ? 200 : 500)
    return valor
  } catch (error) {
    contexto.ocurridoEn = new Date()
    if (!contexto.fallo) await escribirFuera(contexto, 500)
    throw error
  }
}

export async function comandoAtomicoAuditado<T>(accion: string, ejecutar: () => Promise<T>): Promise<T> {
  const contexto = nuevoContexto(`dataset.${accion}`, 'scripts/datasets-infraestructura.mjs', 'CLI')
  contexto.actorTipo = 'sistema'
  contexto.actorId = referencia(process.env.INFRA_AUDIT_OPERATOR) ?? 'infra-datasets'
  contexto.viaAcceso = 'cli'
  return contextoAuditoria.run(contexto, async () => {
    await migrarDb()
    try { return await cambioAuditado(ejecutar) }
    catch (error) {
      if (!contexto.fallo && !contexto.persistido) await escribirFuera(contexto, 500)
      throw error
    }
  })
}

/**
 * Envuelve un Route Handler. Una sola inserción por solicitud: la del cambio (si el handler usa
 * cambioAuditado) o la del retorno o la excepción. Las excepciones se relanzan sin tocar.
 * El único 503 que produce la envoltura es el de falla de la inserción de auditoría.
 */
export function conAuditoria<A extends unknown[]>(accion: AccionAuditoria, rutaPlantilla: string, ejecutar: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const contexto = nuevoContexto(accion, rutaPlantilla, (args[0] as Request | undefined)?.method ?? 'DESCONOCIDO')
    return contextoAuditoria.run(contexto, async () => {
      let response: Response
      try {
        response = await ejecutar(...args)
      } catch (error) {
        if (!contexto.fallo && !contexto.persistido) await escribirFuera(contexto, 500)
        if (contexto.fallo) return respuestaNoDisponible(contexto)
        throw error
      }
      if (!contexto.fallo && !contexto.persistido) await escribirFuera(contexto, response.status)
      if (contexto.fallo) return respuestaNoDisponible(contexto)
      return conIdsDeAuditoria(response, contexto.requestId)
    })
  }
}

/**
 * Sin X-Request-Id previo, el id de auditoría va en X-Request-Id. Si el handler ya lo puso (p. ej. `ruta`),
 * se conserva y el id de auditoría va en X-Audit-Id para correlacionar con el evento.
 */
function conIdsDeAuditoria(response: Response, requestId: string): Response {
  return response.headers.has('X-Request-Id')
    ? conCabeceras(response, { 'X-Audit-Id': requestId })
    : conCabeceras(response, { 'X-Request-Id': requestId })
}

/** Respuestas como Response.redirect() tienen cabeceras inmutables: se reconstruyen con las cabeceras nuevas. */
function conCabeceras(response: Response, cabeceras: Record<string, string>): Response {
  try {
    for (const [nombre, valor] of Object.entries(cabeceras)) response.headers.set(nombre, valor)
    return response
  } catch {
    // Response.error() tiene estado 0, que el constructor no admite: se devuelve tal cual.
    if (response.status < 200 || response.status > 599) return response
    const headers = new Headers(response.headers)
    for (const [nombre, valor] of Object.entries(cabeceras)) headers.set(nombre, valor)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
}
