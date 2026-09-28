// Reintento compartido ante SQLITE_BUSY ("database is locked"). Extraído de
// app/api/problematicas/parte/route.ts (fix/parte-alta-concurrente): esa ruta
// abre transacciones de escritura con BEGIN IMMEDIATE y, si pierde la carrera
// por el lock contra otro escritor concurrente, reintenta el bloque completo
// con un backoff corto y jitter en vez de devolver un 500.
//
// Deliberadamente NO se resuelve con el `timeout` (busy_timeout) nativo de
// @libsql/client (ver el comentario en lib/db/index.ts): esa espera es
// sincrónica dentro del único hilo de JS de Node, así que con dos escritores
// del MISMO proceso compitiendo por el mismo lock se termina esperando el
// timeout entero, porque el que tiene el lock nunca puede correr para
// soltarlo (el hilo está ocupado en la espera nativa del otro). Acá se
// reintenta a mano con un `setTimeout` real, que sí cede el hilo y deja
// correr al que tiene el lock.
//
// Con Postgres (vía `pg` y `PGlite`) esta misma función también reintenta ante
// los conflictos de serialización, deadlock y lock no disponible: `40001`
// (serialization_failure), `40P01` (deadlock_detected) y `55P03`
// (lock_not_available). Son la forma en que Postgres devuelve la misma clase de
// "perdiste la carrera, reintentá el bloque completo" que representaba
// SQLITE_BUSY en SQLite. Se mantiene la detección de SQLITE_BUSY/"database is
// locked" como fallback: no cuesta nada y permite correr en un entorno mixto
// durante la transición.
//
// Todo lo que se envuelva con `conReintentoPorBloqueo` tiene que ser
// re-ejecutable desde cero sin duplicar efectos: o bien re-lee el estado
// fresco en cada intento (como el bloque de la ruta de parte), o bien está
// enteramente dentro de una transacción que se revierte por completo si
// falla a mitad de camino. Ver los call sites para el razonamiento
// caso a caso.

// Códigos de error que representan "perdiste la carrera por el lock, reintentá
// el bloque completo": SQLITE_BUSY de libsql, y los de Postgres.
const CODIGOS_LOCK_POSTGRES = new Set(['40001', '40P01', '55P03'])

function tieneCodigoDeLock(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' && (code === 'SQLITE_BUSY' || CODIGOS_LOCK_POSTGRES.has(code))
}

export function esErrorLockOcupado(err: unknown): boolean {
  if (tieneCodigoDeLock(err)) return true
  if (tieneCodigoDeLock((err as { cause?: unknown } | null)?.cause)) return true
  const msg = err instanceof Error ? err.message : String(err)
  const causaMsg = err instanceof Error && err.cause instanceof Error ? err.cause.message : ''
  return /SQLITE_BUSY|database is locked/i.test(msg) || /SQLITE_BUSY|database is locked/i.test(causaMsg)
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Backoff con jitter por defecto: idéntico al que ya usaba la ruta de parte
// antes de esta extracción (15ms base + hasta 35ms de jitter, escalado por
// intento).
function esperaPorDefecto(intento: number): number {
  return 15 + Math.floor(Math.random() * 35) * (intento + 1)
}

export interface OpcionesReintentoPorBloqueo {
  // Cantidad máxima de intentos (el primero cuenta como intento 0). Default 8,
  // igual que la ruta de parte.
  maxIntentos?: number
  // Milisegundos de espera antes de cada reintento, en función del número de
  // intento ya fallado (0-based).
  calcularEsperaMs?: (intento: number) => number
  // Se corre ante CUALQUIER error del intento (no sólo SQLITE_BUSY), antes de
  // decidir si se reintenta o se relanza — para que quien envuelve una
  // transacción manual (rawTx) pueda hacer su rollback ahí, igual que hacía
  // el catch original de la ruta de parte.
  alFallarIntento?: (err: unknown, intento: number) => Promise<void> | void
}

// Ejecuta `fn` y, si lanza un error de lock ocupado, reintenta el bloque
// COMPLETO (nunca sólo una parte) tras una espera corta con jitter, hasta
// `maxIntentos` veces. Cualquier otro error (o el lock ocupado en el último
// intento) se relanza tal cual, para que el caller decida qué hacer (rollback
// diferido, respuesta 409/500, etc.).
export async function conReintentoPorBloqueo<T>(
  fn: (intento: number) => Promise<T>,
  opciones: OpcionesReintentoPorBloqueo = {},
): Promise<T> {
  const maxIntentos = opciones.maxIntentos ?? 8
  const calcularEsperaMs = opciones.calcularEsperaMs ?? esperaPorDefecto

  let ultimoError: unknown
  for (let intento = 0; intento < maxIntentos; intento++) {
    try {
      return await fn(intento)
    } catch (err) {
      ultimoError = err
      if (opciones.alFallarIntento) await opciones.alFallarIntento(err, intento)
      if (esErrorLockOcupado(err) && intento < maxIntentos - 1) {
        await esperar(calcularEsperaMs(intento))
        continue
      }
      throw err
    }
  }
  // Inalcanzable (el loop siempre retorna o lanza), pero TypeScript no puede
  // seguir esa garantía a través del for.
  throw ultimoError
}
