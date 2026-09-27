import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { getSqlitePath } from '@/lib/data-dir'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export interface OpcionesGetDb {
  // Busy timeout nativo (ms) para ESTA conexión. Ver el comentario largo de
  // más abajo: sólo es seguro pasarlo desde un proceso de job de ejecución
  // finita (scripts/job-*.mjs), nunca desde el proceso web. Sólo tiene
  // efecto en la llamada que efectivamente crea el cliente (la primera de
  // este proceso); llamadas posteriores, con o sin esta opción, reciben la
  // misma conexión ya memoizada.
  busyTimeoutMs?: number
}

export function getDb(opciones?: OpcionesGetDb) {
  if (_db) return _db
  const url = `file:${getSqlitePath()}`
  // Deliberadamente SIN `timeout` (busy timeout) por default: ese
  // busy_timeout de @libsql/client/sqlite3.js espera adentro de la llamada
  // nativa (sincrónica) al `libsql` binding, que corre en el único hilo de
  // JS de Node — si dos escritores del MISMO proceso compiten (dos BEGIN
  // IMMEDIATE, ver app/api/problematicas/parte/route.ts), esa espera
  // CONGELA todo el proceso, incluyendo al escritor que ya tiene el lock y
  // necesita ese mismo hilo para terminar y liberar (probado durante el
  // desarrollo del fix de la carrera cross-device: con `timeout` alto, el
  // segundo escritor siempre agota el timeout entero porque el primero
  // nunca puede avanzar para soltar el lock). En el proceso WEB, que sirve
  // requests concurrentes sobre esta misma conexión memoizada, ese riesgo
  // sigue vigente: la ruta que escribe con BEGIN IMMEDIATE reintenta ella
  // misma con backoff asincrónico real (setTimeout, que sí cede el hilo)
  // cuando el lock está ocupado (ver lib/db/reintento.ts), en vez de
  // depender de este timeout nativo.
  //
  // Los jobs de ejecución finita (scripts/job-*.mjs) son distintos: cada
  // invocación es su PROPIO proceso de Node con una única conexión — no hay
  // un segundo escritor en el mismo hilo esperando a que éste suelte el
  // lock, así que el busy-wait sincrónico no puede congelar nada del lado
  // de ESTE proceso; sólo espera a que el proceso web (u otro job) libere
  // el lock cruzado. Por eso esos scripts, y sólo ellos, pueden pasar
  // `busyTimeoutMs` acá (ver su primera llamada a getDb(), antes de
  // cualquier otra, en cada script) para evitar un SQLITE_BUSY duro cuando
  // el lock nativo se libera dentro de ese margen — el reintento manual de
  // lib/db/reintento.ts sigue siendo la red de seguridad si no alcanza.
  const client = createClient({
    url,
    ...(opciones?.busyTimeoutMs ? { timeout: opciones.busyTimeoutMs } : {}),
  })
  _db = drizzle(client, { schema })
  return _db
}
