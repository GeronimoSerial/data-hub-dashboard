import { abrirAlmacenParte, type TrabajoEnvioLocal } from '../parte/almacen-indexeddb'
import { fetchReportesOfflineFeatures } from '../parte/feature-flags-client'

const AUTHORIZATIONS_URL = '/api/problematicas/parte/adjuntos/autorizaciones'
const UPLOAD_BASE_URL = '/api/problematicas/parte/adjuntos'
const PHOTO_LOCK = 'parte:photo-upload'
const MAX_RETRIES_MS = 60_000

type Variante = 'optimizada' | 'miniatura'
type AutorizacionVariante = {
  url: string
  key: string
  contentType: string
  contentLength: number
  expiresAt: string
}
type AutorizacionAdjunto = { attachmentId: string; optimizada: AutorizacionVariante; miniatura: AutorizacionVariante }
type DatosTrabajoFoto = {
  attachmentId: string
  movimientoId?: string
  bytesOptimizado: number
  bytesMiniatura: number
  optimizadaAuthorization?: AutorizacionVariante
  miniaturaAuthorization?: AutorizacionVariante
  missingVariants?: Variante[]
  intentos?: number
  reintentarDespues?: number
}

export type NuevaSubidaFoto = {
  draftId: string
  attachmentId: string
  optimizada: Blob
  miniatura: Blob
}

function esTrabajoFoto(trabajo: TrabajoEnvioLocal): boolean {
  return trabajo.tipo === 'foto'
}

function leerDatos(trabajo: TrabajoEnvioLocal): DatosTrabajoFoto {
  return trabajo.cuerpo as DatosTrabajoFoto
}

function idempotencyKey(attachmentId: string): string {
  return `foto:${attachmentId}`
}

/** Saves both optimized variants and metadata before the report enters B2. */
export async function encolarSubidasFotos(fotos: readonly NuevaSubidaFoto[]): Promise<void> {
  const almacen = await abrirAlmacenParte()
  try {
    for (const foto of fotos) {
      if (!foto.draftId || !foto.attachmentId || foto.optimizada.type !== 'image/jpeg'
        || foto.miniatura.type !== 'image/jpeg' || foto.optimizada.size < 1 || foto.miniatura.size < 1) {
        throw new TypeError('Photo upload requires a draft, attachment, and optimized JPEG variants.')
      }
      const key = idempotencyKey(foto.attachmentId)
      const existing = (await almacen.obtenerTrabajosEnvio()).find((job) => job.idempotencyKey === key)
      if (existing) {
        const data = leerDatos(existing)
        if (existing.draftId !== foto.draftId || data.bytesOptimizado !== foto.optimizada.size
          || data.bytesMiniatura !== foto.miniatura.size) {
          throw new Error('An attachment identifier cannot be reused with different photo data.')
        }
        continue
      }
      await almacen.guardarArchivo(`${foto.attachmentId}:optimizada`, foto.optimizada)
      await almacen.guardarArchivo(`${foto.attachmentId}:miniatura`, foto.miniatura)
      const trabajo: TrabajoEnvioLocal = {
        idempotencyKey: key,
        draftId: foto.draftId,
        cuerpo: {
          attachmentId: foto.attachmentId,
          bytesOptimizado: foto.optimizada.size,
          bytesMiniatura: foto.miniatura.size,
        } satisfies DatosTrabajoFoto,
        cuerpoHash: `${foto.optimizada.size}:${foto.miniatura.size}`,
        estado: 'pendiente',
        tipo: 'foto',
        version: 1,
        creadoEn: new Date().toISOString(),
      }
      await almacen.guardarTrabajoEnvioSiAusente(trabajo)
    }
  } finally {
    almacen.cerrar()
  }
}

/** Links waiting photo jobs only after B2 stored the final movement confirmation. */
export async function confirmarSubidasFotos(draftId: string, movimientoId: string): Promise<void> {
  const almacen = await abrirAlmacenParte()
  try {
    const jobs = await almacen.obtenerTrabajosEnvio()
    for (const job of jobs) {
      if (!esTrabajoFoto(job) || job.draftId !== draftId) continue
      const data = leerDatos(job)
      if (data.movimientoId && data.movimientoId !== movimientoId) {
        throw new Error('A queued photo is already linked to a different movement.')
      }
      await almacen.guardarTrabajoEnvio({ ...job, cuerpo: { ...data, movimientoId }, estado: 'pendiente' })
    }
  } finally {
    almacen.cerrar()
  }
  iniciarSubidaFotos()
}

/** Installs event-driven recovery. No worker polling or report-queue lock is used. */
export function iniciarSubidaFotos(): () => void {
  if (typeof window === 'undefined') return () => undefined
  if (stopListeners) return stopListeners
  const trigger = () => { void drenarColaFotos() }
  window.addEventListener('online', trigger)
  window.addEventListener('pageshow', trigger)
  document.addEventListener('visibilitychange', trigger)
  trigger()
  stopListeners = () => {
    window.removeEventListener('online', trigger)
    window.removeEventListener('pageshow', trigger)
    document.removeEventListener('visibilitychange', trigger)
    stopListeners = undefined
  }
  return stopListeners
}

let running: Promise<void> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let stopListeners: (() => void) | undefined

async function withPhotoLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { locks?: { request<R>(name: string, callback: () => Promise<R>): Promise<R> } }).locks
  if (locks?.request) return locks.request(PHOTO_LOCK, task)
  if (running) return running.then(() => task())
  return task()
}

async function drenarColaFotos(): Promise<void> {
  if (!await fetchReportesOfflineFeatures().then((flags) => flags.fotos)) return
  if (running) return running
  running = withPhotoLock(async () => {
    const almacen = await abrirAlmacenParte()
    try {
      await recuperarInterrumpidas(almacen)
      await reactivarPendientesVencidos(almacen)
      while (true) {
        const jobs = (await almacen.obtenerTrabajosEnvio())
          .filter((job) => esTrabajoFoto(job))
          .sort((a, b) => (a.creadoEn ?? '').localeCompare(b.creadoEn ?? ''))
        const listo = jobs.find((job) => {
          const data = leerDatos(job)
          return data.movimientoId && job.estado === 'pendiente'
            && (!data.reintentarDespues || data.reintentarDespues <= Date.now())
        })
        if (!listo) return
        if (await hayReportePrioritario(almacen)) return
        if (!await procesarFoto(almacen, listo)) return
      }
    } finally {
      almacen.cerrar()
    }
  }).finally(() => { running = undefined })
  return running
}

async function recuperarInterrumpidas(almacen: Awaited<ReturnType<typeof abrirAlmacenParte>>) {
  for (const job of await almacen.obtenerTrabajosEnvio()) {
    if (esTrabajoFoto(job) && job.estado === 'enviando') {
      await almacen.guardarTrabajoEnvio({ ...job, estado: 'pendiente' })
    }
  }
}

async function reactivarPendientesVencidos(almacen: Awaited<ReturnType<typeof abrirAlmacenParte>>) {
  for (const job of await almacen.obtenerTrabajosEnvio()) {
    if (!esTrabajoFoto(job) || (job.estado !== 'error' && job.estado !== 'sesion-vencida')) continue
    const data = leerDatos(job)
    if (job.estado === 'sesion-vencida' || !data.reintentarDespues || data.reintentarDespues <= Date.now()) {
      await almacen.guardarTrabajoEnvio({ ...job, estado: 'pendiente' })
    } else if (retryTimer === undefined) {
      retryTimer = setTimeout(() => {
        retryTimer = undefined
        void drenarColaFotos()
      }, data.reintentarDespues - Date.now())
    }
  }
}

async function hayReportePrioritario(almacen: Awaited<ReturnType<typeof abrirAlmacenParte>>) {
  return (await almacen.obtenerTrabajosEnvio()).some((job) =>
    (job.tipo ?? 'reporte_final') === 'reporte_final' && job.estado === 'pendiente',
  )
}

async function procesarFoto(
  almacen: Awaited<ReturnType<typeof abrirAlmacenParte>>,
  job: TrabajoEnvioLocal,
): Promise<boolean> {
  const data = leerDatos(job)
  const movimientoId = data.movimientoId!
  await almacen.guardarTrabajoEnvio({ ...job, estado: 'enviando' })

  try {
    const reconcile = await fetch(`${UPLOAD_BASE_URL}/${encodeURIComponent(data.attachmentId)}/confirmacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movimientoId }),
    })
    if (reconcile.status === 200) {
      await completarFoto(almacen, job)
      return true
    }
    if (reconcile.status === 401 || reconcile.status === 403) {
      await pausarSesion(almacen, job)
      return false
    }
    if (reconcile.status !== 409) throw new Error(`Reconciliation failed (${reconcile.status}).`)
    const reconcileBody = await reconcile.json() as { missingVariants?: Variante[] }
    const missing = reconcileBody.missingVariants
    if (!Array.isArray(missing)) throw new Error('The reconciliation response did not identify missing variants.')

    let latest = await getTrabajo(almacen, job.idempotencyKey)
    if (!latest) return true
    let latestData = leerDatos(latest)
    let authorizations = {
      optimizada: latestData.optimizadaAuthorization,
      miniatura: latestData.miniaturaAuthorization,
    }
    const expired = [authorizations.optimizada, authorizations.miniatura]
      .some((auth) => !auth || Date.parse(auth.expiresAt) <= Date.now() + 30_000)
    if (expired) {
      if (!await autorizarPendientesEnLote(almacen, movimientoId)) return false
      latest = await getTrabajo(almacen, job.idempotencyKey)
      if (!latest) return true
      latestData = leerDatos(latest)
      authorizations = {
        optimizada: latestData.optimizadaAuthorization,
        miniatura: latestData.miniaturaAuthorization,
      }
    }

    for (const variant of missing) {
      const authorization = authorizations[variant]
      const file = await almacen.obtenerArchivo(`${data.attachmentId}:${variant}`)
      if (!file || !authorization) throw new Error(`The local ${variant} photo variant is missing.`)
      const response = await fetch(authorization.url, {
        method: 'PUT',
        headers: { 'Content-Type': authorization.contentType },
        body: file,
      })
      if (response.status === 401 || response.status === 403) {
        latestData = { ...latestData, [variant === 'optimizada' ? 'optimizadaAuthorization' : 'miniaturaAuthorization']: undefined }
        const intentos = (latestData.intentos ?? 0) + 1
        const retryMs = Math.min(1000 * 2 ** Math.min(intentos - 1, 6), MAX_RETRIES_MS)
        await almacen.guardarTrabajoEnvio({ ...latest, cuerpo: { ...latestData, intentos, reintentarDespues: Date.now() + retryMs }, estado: 'error' })
        if (retryTimer === undefined) {
          retryTimer = setTimeout(() => {
            retryTimer = undefined
            void drenarColaFotos()
          }, retryMs)
        }
        return true
      }
      if (!response.ok) throw new Error(`OBS upload failed (${response.status}).`)
    }

    const confirm = await fetch(`${UPLOAD_BASE_URL}/${encodeURIComponent(data.attachmentId)}/confirmacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movimientoId }),
    })
    if (confirm.status === 401 || confirm.status === 403) {
      await pausarSesion(almacen, latest)
      return false
    }
    if (!confirm.ok) throw new Error(`Attachment confirmation failed (${confirm.status}).`)
    await completarFoto(almacen, latest)
    return true
  } catch {
    const latest = await getTrabajo(almacen, job.idempotencyKey)
    if (!latest) return true
    const latestData = leerDatos(latest)
    const intentos = (latestData.intentos ?? 0) + 1
    const retryMs = Math.min(1000 * 2 ** Math.min(intentos - 1, 6), MAX_RETRIES_MS)
    await almacen.guardarTrabajoEnvio({
      ...latest,
      estado: 'error',
      cuerpo: { ...latestData, intentos, reintentarDespues: Date.now() + retryMs },
    })
    if (retryTimer === undefined) {
      retryTimer = setTimeout(() => {
        retryTimer = undefined
        void drenarColaFotos()
      }, retryMs)
    }
    return true
  }
}

async function autorizarPendientesEnLote(
  almacen: Awaited<ReturnType<typeof abrirAlmacenParte>>,
  movimientoId: string,
): Promise<boolean> {
  const jobs = (await almacen.obtenerTrabajosEnvio()).filter((job) => {
    if (!esTrabajoFoto(job)) return false
    const data = leerDatos(job)
    return data.movimientoId === movimientoId && job.estado !== 'sesion-vencida'
  })
  if (jobs.length === 0) return true
  const response = await fetch(AUTHORIZATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      movimientoId,
      adjuntos: jobs.map((job) => {
        const data = leerDatos(job)
        return {
          attachmentId: data.attachmentId,
          bytesOptimizado: data.bytesOptimizado,
          bytesMiniatura: data.bytesMiniatura,
        }
      }),
    }),
  })
  if (response.status === 401 || response.status === 403) {
    for (const job of jobs) await pausarSesion(almacen, job)
    return false
  }
  if (!response.ok) throw new Error(`Authorization request failed (${response.status}).`)
  const body = await response.json() as { autorizaciones: AutorizacionAdjunto[] }
  const byId = new Map((body.autorizaciones ?? []).map((authorization) => [authorization.attachmentId, authorization]))
  for (const job of jobs) {
    const data = leerDatos(job)
    const authorization = byId.get(data.attachmentId)
    if (!authorization) throw new Error(`The authorization response omitted ${data.attachmentId}.`)
    await almacen.guardarTrabajoEnvio({
      ...job,
      cuerpo: {
        ...data,
        optimizadaAuthorization: authorization.optimizada,
        miniaturaAuthorization: authorization.miniatura,
      },
    })
  }
  return true
}

async function completarFoto(almacen: Awaited<ReturnType<typeof abrirAlmacenParte>>, job: TrabajoEnvioLocal) {
  const data = leerDatos(job)
  await almacen.eliminarArchivo(`${data.attachmentId}:optimizada`)
  await almacen.eliminarArchivo(`${data.attachmentId}:miniatura`)
  await almacen.eliminarTrabajoEnvio(job.idempotencyKey)
}

async function pausarSesion(almacen: Awaited<ReturnType<typeof abrirAlmacenParte>>, job: TrabajoEnvioLocal) {
  await almacen.guardarTrabajoEnvio({ ...job, estado: 'sesion-vencida' })
}

async function getTrabajo(almacen: Awaited<ReturnType<typeof abrirAlmacenParte>>, key: string) {
  return (await almacen.obtenerTrabajosEnvio()).find((job) => job.idempotencyKey === key) ?? null
}
