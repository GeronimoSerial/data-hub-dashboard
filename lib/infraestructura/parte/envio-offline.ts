// Persistencia y envío diferido de partes cuando la conexión falla o la
// sesión venció. El borrador nunca se descarta ante un error recuperable:
// se conserva en el almacén local para reintentar sin perder lo cargado ni
// duplicar el envío (la idempotencyKey se reutiliza entre reintentos).

export type EstadoEnvio =
  | 'guardado-local'
  | 'pendiente-envio'
  | 'error-servidor'
  | 'enviando'
  | 'enviado'
  | 'error'

export interface AlmacenClaveValor {
  obtener(clave: string): Promise<string | null>
  guardar(clave: string, valor: string): Promise<void>
  eliminar(clave: string): Promise<void>
}

export interface BorradorParte<T> {
  tipo: string
  cue: string
  idempotencyKey: string
  datos: T
  url?: string
  cuerpo?: unknown
  estado: EstadoEnvio
  motivoError?: string
  intentos: number
  actualizadoEn: string
}

export type ResultadoClasificacion =
  | 'reintentable'
  | 'no-reintentable'
  | 'sesion-vencida'

export interface EnviarOpciones<T> {
  almacen: AlmacenClaveValor
  tipo: string
  cue: string
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>
  url: string
  construirCuerpo: (datos: T, idempotencyKey: string) => unknown
  onCambioEstado?: (borrador: BorradorParte<T>) => void
  // Valida el CUERPO de una respuesta 2xx antes de darla por buena (revisión
  // de gate N1, hallazgo #2): un 2xx con un cuerpo que no cumple el contrato
  // esperado (por ejemplo, sin `movimientoId`) no puede vaciar la cola ni
  // dejar que el próximo intento acuñe una idempotencyKey nueva, porque el
  // director todavía no tiene garantía de que el parte quedó guardado. Si se
  // omite, cualquier 2xx se considera válido (comportamiento previo a este
  // hallazgo, el que siguen usando los tests genéricos del motor).
  validarExito?: (respuesta: unknown) => boolean
  timeoutMs?: number
}

export type ResultadoEnvio =
  | { ok: true; respuesta: unknown }
  | { ok: false; estado: EstadoEnvio; motivo?: string }

export const MENSAJES_ESTADO: Record<EstadoEnvio, string> = {
  'guardado-local': 'Guardado en este dispositivo',
  'pendiente-envio': 'Sin conexión. Su parte queda guardado y se envía solo cuando vuelva.',
  'error-servidor': 'No pudimos enviar. Reintentamos en unos segundos.',
  enviando: 'Enviando…',
  enviado: 'Enviado',
  error: 'No se pudo enviar',
}

export const TIEMPO_MAXIMO_ENVIO_MS = 15000
const MENSAJE_TIEMPO_AGOTADO = 'El servidor no respondió. Su parte queda guardado; puede reintentar.'

const MENSAJE_SESION_VENCIDA =
  'La sesión venció. Iniciá sesión nuevamente para reintentar; el borrador se conserva.'

const MENSAJE_RESPUESTA_INESPERADA = 'respuesta inesperada del servidor'

// --- Coordinación entre pestañas (revisión de gate N1, hallazgo #1) -------
//
// El ciclo leer→decidir→escribir de `intentarEnviar` (¿existe ya una
// idempotencyKey para este tipo+cue, o hay que acuñar una?) tiene que ser
// atómico por clave: si dos pestañas del MISMO dispositivo llaman a
// `intentarEnviar` para el mismo tipo+cue antes de que cualquiera de las dos
// haya escrito nada, ambas leían "no hay borrador" y cada una acuñaba su
// propia `crypto.randomUUID()` — el servidor, que dedupe por clave exacta
// (ver app/api/problematicas/parte/route.ts), no podía reconocer que era el
// mismo envío y terminaba creando dos partes.
//
// La primitiva real y correcta para esto es la Web Locks API
// (`navigator.locks`, soportada por Chrome/Edge/Firefox y Safari ≥15.4):
// coordina de verdad entre pestañas del mismo origen, algo que ninguna
// estructura en memoria de este módulo puede hacer (cada pestaña corre su
// propia instancia de este módulo). Cuando no está disponible (navegador
// viejo, o este mismo entorno de test, que corre sobre jsdom sin Web Locks)
// se cae a un mutex en memoria por clave: sólo sincroniza llamadas dentro
// del MISMO proceso de JS. Eso alcanza para "dos pestañas" simuladas en un
// test que comparten el mismo almacén, y para el caso de doble-click dentro
// de una sola pestaña, pero NO sincroniza pestañas reales distintas — ver
// limitación documentada en docs/ejecucion-enos/E1b/registro.md.
interface GestorBloqueosNavegador {
  request<T>(nombre: string, tarea: () => Promise<T> | T): Promise<T>
}

function obtenerGestorBloqueos(): GestorBloqueosNavegador | null {
  if (typeof navigator === 'undefined') return null
  const posible = (navigator as Partial<Navigator>).locks
  return posible && typeof posible.request === 'function' ? (posible as GestorBloqueosNavegador) : null
}

// El mutex de reserva y el caché de resultados en vuelo (abajo) se indexan
// POR ALMACÉN (con un WeakMap), no en un único Map global del módulo: cada
// `AlmacenClaveValor` representa un storage distinto (un "dispositivo"
// simulado en los tests, o el storage real del navegador). Sin este
// aislamiento, dos llamados de tests distintos que casualmente comparten
// tipo+cue+idempotencyKey pero usan almacenes NO relacionados se
// contaminarían entre sí.
function mapaDelAlmacen<V>(indice: WeakMap<AlmacenClaveValor, Map<string, V>>, almacen: AlmacenClaveValor): Map<string, V> {
  let mapa = indice.get(almacen)
  if (!mapa) {
    mapa = new Map<string, V>()
    indice.set(almacen, mapa)
  }
  return mapa
}

const mutexPorAlmacen = new WeakMap<AlmacenClaveValor, Map<string, Promise<unknown>>>()

function conMutexLocal<T>(almacen: AlmacenClaveValor, clave: string, tarea: () => Promise<T>): Promise<T> {
  const mapa = mapaDelAlmacen(mutexPorAlmacen, almacen)
  const anterior = mapa.get(clave) ?? Promise.resolve()
  const siguiente = anterior.then(tarea, tarea)
  // Encadena SIEMPRE (éxito o error) para no bloquear al próximo llamador si
  // esta tarea rechaza; sólo importa que el turno haya terminado.
  mapa.set(
    clave,
    siguiente.then(
      () => undefined,
      () => undefined,
    ),
  )
  return siguiente
}

function conBloqueo<T>(almacen: AlmacenClaveValor, nombre: string, tarea: () => Promise<T>): Promise<T> {
  const gestor = obtenerGestorBloqueos()
  if (gestor) return gestor.request(nombre, tarea)
  return conMutexLocal(almacen, nombre, tarea)
}

// Envíos en curso, para COALESCER (no cachear) el POST cuando dos llamados
// EN EL MISMO PROCESO Y CON EL MISMO ALMACÉN acuerdan la misma
// idempotencyKey mientras el primero todavía está en vuelo (ver
// `intentarEnviar`): el segundo se ENGANCHA a la misma promesa en vez de
// hacer su propio fetch. Deliberadamente NO es un caché de resultados ya
// terminados — la entrada se borra apenas el envío resuelve (éxito o
// error) — porque un reintento deliberado y posterior (por ejemplo,
// disparado por `registrarAutoReintento` bastante después) TIENE que volver
// a golpear la red, no reutilizar ciegamente el resultado de un intento
// anterior con la misma clave.
const enviosEnCursoPorAlmacen = new WeakMap<AlmacenClaveValor, Map<string, Promise<ResultadoEnvio>>>()

export function crearAlmacenMemoria(): AlmacenClaveValor {
  const valores = new Map<string, string>()
  return {
    async obtener(clave) {
      return valores.has(clave) ? (valores.get(clave) as string) : null
    },
    async guardar(clave, valor) {
      valores.set(clave, valor)
    },
    async eliminar(clave) {
      valores.delete(clave)
    },
  }
}

const NOMBRE_BASE = 'parte-offline'
const NOMBRE_DEPOSITO = 'kv'

function abrirIndice(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    if (typeof indexedDB === 'undefined') {
      rechazar(new Error('IndexedDB no disponible'))
      return
    }
    const solicitud = indexedDB.open(NOMBRE_BASE, 1)
    solicitud.onupgradeneeded = () => {
      const base = solicitud.result
      if (!base.objectStoreNames.contains(NOMBRE_DEPOSITO)) {
        base.createObjectStore(NOMBRE_DEPOSITO)
      }
    }
    solicitud.onsuccess = () => resolver(solicitud.result)
    solicitud.onerror = () =>
      rechazar(solicitud.error ?? new Error('No se pudo abrir IndexedDB'))
  })
}

function operarIndice<T>(
  modo: IDBTransactionMode,
  operacion: (deposito: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return abrirIndice().then(
    (base) =>
      new Promise<T | null>((resolver, rechazar) => {
        try {
          const transaccion = base.transaction(NOMBRE_DEPOSITO, modo)
          const solicitud = operacion(transaccion.objectStore(NOMBRE_DEPOSITO))
          solicitud.onsuccess = () => resolver(solicitud.result ?? null)
          solicitud.onerror = () =>
            rechazar(solicitud.error ?? new Error('Error de IndexedDB'))
        } catch (error) {
          rechazar(error)
        }
      }),
  )
}

export function crearAlmacenLocalStorage(): AlmacenClaveValor {
  return {
    async obtener(clave) {
      try {
        if (typeof localStorage === 'undefined') return null
        return localStorage.getItem(clave)
      } catch {
        return null
      }
    },
    async guardar(clave, valor) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(clave, valor)
      } catch {
        // Cuota llena o almacenamiento bloqueado: el borrador queda sólo en memoria.
      }
    },
    async eliminar(clave) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(clave)
      } catch {
        // Ignorado a propósito: eliminar es best-effort.
      }
    },
  }
}

export function crearAlmacenNavegador(): AlmacenClaveValor {
  const respaldo = crearAlmacenLocalStorage()
  return {
    async obtener(clave) {
      try {
        const valor = await operarIndice('readonly', (deposito) => deposito.get(clave))
        return typeof valor === 'string' ? valor : null
      } catch {
        return respaldo.obtener(clave)
      }
    },
    async guardar(clave, valor) {
      try {
        await operarIndice('readwrite', (deposito) => deposito.put(valor, clave))
      } catch {
        await respaldo.guardar(clave, valor)
      }
    },
    async eliminar(clave) {
      try {
        await operarIndice('readwrite', (deposito) => deposito.delete(clave))
      } catch {
        await respaldo.eliminar(clave)
      }
    },
  }
}

export function claveBorrador(tipo: string, cue: string): string {
  return `parte:${tipo}:${cue}`
}

export async function guardarBorrador<T>(
  almacen: AlmacenClaveValor,
  borrador: BorradorParte<T>,
): Promise<void> {
  await almacen.guardar(claveBorrador(borrador.tipo, borrador.cue), JSON.stringify(borrador))
}

export async function leerBorrador<T>(
  almacen: AlmacenClaveValor,
  tipo: string,
  cue: string,
): Promise<BorradorParte<T> | null> {
  const crudo = await almacen.obtener(claveBorrador(tipo, cue))
  if (crudo === null) return null
  try {
    return JSON.parse(crudo) as BorradorParte<T>
  } catch {
    return null
  }
}

export async function borrarBorrador(
  almacen: AlmacenClaveValor,
  tipo: string,
  cue: string,
): Promise<void> {
  await almacen.eliminar(claveBorrador(tipo, cue))
}

export function clasificarRespuesta(status: number | 'red'): ResultadoClasificacion {
  if (status === 'red') return 'reintentable'
  if (status >= 500 && status <= 599) return 'reintentable'
  if (status === 401 || status === 403 || status === 410) return 'sesion-vencida'
  return 'no-reintentable'
}

export function calcularEsperaReintento(intentos: number): number {
  const espera = 1000 * 2 ** intentos
  return Math.min(espera, 30000)
}

export async function intentarEnviar<T>(
  datos: T,
  opciones: EnviarOpciones<T>,
): Promise<ResultadoEnvio> {
  const clave = claveBorrador(opciones.tipo, opciones.cue)

  // Paso 1 — decidir (hallazgo #1a): leer el borrador existente, decidir la
  // idempotencyKey (reusar la que ya hay, o acuñar una) y persistir el
  // estado 'enviando' son una sola sección crítica, serializada por clave.
  // Deliberadamente NO se sostiene este bloqueo durante el fetch de abajo:
  // sostenerlo ahí le ganaría de mano a la reutilización, porque la segunda
  // pestaña recién podría leer después de que la primera ya terminó y borró
  // la cola (ver más abajo). Soltarlo apenas se persiste 'enviando' es lo
  // que le permite a una segunda pestaña, que entra mientras la primera
  // todavía está en vuelo, VER esa clave recién escrita y reutilizarla en
  // vez de acuñar la suya.
  const { idempotencyKey, intentos, borradorEnviando } = await conBloqueo(
    opciones.almacen,
    `parte-offline:decidir:${clave}`,
    async () => {
      const existente = await leerBorrador<T>(opciones.almacen, opciones.tipo, opciones.cue)
      const idempotencyKeyDecidida = existente?.idempotencyKey ?? crypto.randomUUID()
      const intentosPrevios = existente?.intentos ?? 0
      const borrador: BorradorParte<T> = {
        tipo: opciones.tipo,
        cue: opciones.cue,
        idempotencyKey: idempotencyKeyDecidida,
        datos,
        estado: 'enviando',
        intentos: intentosPrevios,
        actualizadoEn: new Date().toISOString(),
      }
      await guardarBorrador(opciones.almacen, borrador)
      return { idempotencyKey: idempotencyKeyDecidida, intentos: intentosPrevios, borradorEnviando: borrador }
    },
  )
  opciones.onCambioEstado?.(borradorEnviando)

  // Paso 2 — enviar, coordinando envíos en vuelo (hallazgo #1a): una vez que
  // dos pestañas acordaron la MISMA idempotencyKey en el paso 1, si la
  // segunda llega MIENTRAS la primera todavía está esperando la respuesta,
  // se engancha a esa MISMA promesa en vez de hacer su propio POST — así que
  // "sólo una pestaña envía a la vez" para el caso que de verdad importa (la
  // ráfaga casi simultánea). Si no hay nada en vuelo (pestañas reales
  // distintas — el mapa en memoria no las cruza — o un reintento deliberado
  // y posterior), hace su propio POST con la MISMA clave: el servidor real
  // ya trata eso como el replay idempotente que prueba
  // app/api/problematicas/parte/route.test.ts (varios POST secuenciales o
  // concurrentes con la misma idempotencyKey producen un único movimiento).
  const claveResultado = `${clave}:${idempotencyKey}`
  const enCurso = mapaDelAlmacen(enviosEnCursoPorAlmacen, opciones.almacen)
  const promesaExistente = enCurso.get(claveResultado)
  if (promesaExistente) return promesaExistente

  const promesaEnvio = completarEnvio(datos, opciones, borradorEnviando, idempotencyKey, intentos).finally(
    () => {
      // Sólo se borra a sí misma: si para cuando termina ya hay una entrada
      // NUEVA (un reintento posterior que arrancó después de que ésta se
      // hubiera borrado y volvió a registrar), no la pisa.
      if (enCurso.get(claveResultado) === promesaEnvio) enCurso.delete(claveResultado)
    },
  )
  enCurso.set(claveResultado, promesaEnvio)
  return promesaEnvio
}

async function completarEnvio<T>(
  datos: T,
  opciones: EnviarOpciones<T>,
  borradorEnviando: BorradorParte<T>,
  idempotencyKey: string,
  intentos: number,
): Promise<ResultadoEnvio> {
  const cuerpo = opciones.construirCuerpo(datos, idempotencyKey)
  let respuesta: Response
  const controlador = new AbortController()
  let tiempoAgotado = false
  const temporizador = setTimeout(() => {
    tiempoAgotado = true
    controlador.abort()
  }, opciones.timeoutMs ?? TIEMPO_MAXIMO_ENVIO_MS)
  try {
    const fetchImpl = opciones.fetchImpl
    // Browser fetch requires `this` to be undefined or window.
    respuesta = await fetchImpl(opciones.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: controlador.signal,
    })
  } catch {
    if (tiempoAgotado) {
      const pendiente = await registrarPendiente(opciones, borradorEnviando, intentos, 'error-servidor', cuerpo, MENSAJE_TIEMPO_AGOTADO)
      return { ok: false, estado: pendiente.estado, motivo: MENSAJE_TIEMPO_AGOTADO }
    }
    const pendiente = await registrarPendiente(opciones, borradorEnviando, intentos, 'pendiente-envio', cuerpo)
    return { ok: false, estado: pendiente.estado }
  } finally {
    clearTimeout(temporizador)
  }

  if (respuesta.ok) {
    let json: unknown = {}
    try {
      json = await respuesta.json()
    } catch {
      json = {}
    }
    const esValida = opciones.validarExito ? opciones.validarExito(json) : true
    if (esValida) {
      await borrarBorrador(opciones.almacen, opciones.tipo, opciones.cue)
      return { ok: true, respuesta: json }
    }
    // Hallazgo #2: un 2xx con un cuerpo que no cumple el contrato esperado
    // NO vacía la cola ni acuña una idempotencyKey nueva para el próximo
    // intento — se conserva el MISMO borrador (misma idempotencyKey) marcado
    // como error, para que un reintento posterior siga pudiendo deduplicar
    // contra lo que el servidor haya llegado a persistir.
    await registrarError(opciones, borradorEnviando, MENSAJE_RESPUESTA_INESPERADA, cuerpo)
    return { ok: false, estado: 'error', motivo: MENSAJE_RESPUESTA_INESPERADA }
  }

  let errorCuerpo: unknown = null
  try {
    errorCuerpo = await respuesta.json()
  } catch {
    errorCuerpo = null
  }
  const motivo = (errorCuerpo as { error?: string } | null)?.error
  const clasificacion = clasificarRespuesta(respuesta.status)

  if (clasificacion === 'reintentable') {
    const pendiente = await registrarPendiente(opciones, borradorEnviando, intentos, 'error-servidor', cuerpo)
    return { ok: false, estado: pendiente.estado }
  }

  const motivoError =
    clasificacion === 'sesion-vencida'
      ? MENSAJE_SESION_VENCIDA
      : motivo ?? MENSAJES_ESTADO.error

  await registrarError(opciones, borradorEnviando, motivoError, cuerpo)
  return { ok: false, estado: 'error', motivo: motivoError }
}

async function registrarError<T>(opciones: EnviarOpciones<T>, borrador: BorradorParte<T>, motivoError: string, cuerpo: unknown): Promise<void> {
  const borradorError: BorradorParte<T> = {
    ...borrador,
    url: opciones.url,
    cuerpo,
    estado: 'error',
    motivoError,
    actualizadoEn: new Date().toISOString(),
  }
  await guardarBorrador(opciones.almacen, borradorError)
  opciones.onCambioEstado?.(borradorError)
}

async function registrarPendiente<T>(
  opciones: EnviarOpciones<T>,
  borrador: BorradorParte<T>,
  intentos: number,
  estado: 'pendiente-envio' | 'error-servidor',
  cuerpo: unknown,
  motivoError?: string,
): Promise<BorradorParte<T>> {
  const pendiente: BorradorParte<T> = {
    ...borrador,
    url: opciones.url,
    cuerpo,
    estado,
    ...(motivoError ? { motivoError } : {}),
    intentos: intentos + 1,
    actualizadoEn: new Date().toISOString(),
  }
  await guardarBorrador(opciones.almacen, pendiente)
  opciones.onCambioEstado?.(pendiente)
  return pendiente
}

// Hallazgo #4 de la revisión de gate N1: `calcularEsperaReintento` (backoff
// exponencial acotado) quedaba declarada sin ningún call site. Acá se cablea
// para amortiguar "flapping" de conectividad: si la conexión sube y baja
// varias veces seguidas (típico de una red mala, no de un corte limpio),
// cada evento 'online'/'visibilitychange' ya NO dispara un reintento
// inmediato — el primero de una ráfaga sí (no hay motivo para demorar un
// reintento aislado), pero los siguientes, mientras dure la ráfaga, se
// amortiguan con la misma espera acotada, para no martillar al servidor con
// un POST por cada online/offline. El reintento amortiguado nunca se
// pierde: siempre queda programado para cuando termine la espera.
export function registrarAutoReintento(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  let intentosSeguidos = 0
  let ultimoDisparoEn = 0
  let temporizador: ReturnType<typeof setTimeout> | null = null

  function dispararAhora(): void {
    ultimoDisparoEn = Date.now()
    intentosSeguidos = 0
    temporizador = null
    callback()
  }

  function programarDisparo(): void {
    if (temporizador !== null) {
      // Ya hay un reintento amortiguado en camino: este evento sólo cuenta
      // como otra ráfaga de "flapping" para que la próxima espera crezca.
      intentosSeguidos += 1
      return
    }
    const espera = calcularEsperaReintento(intentosSeguidos)
    const transcurrido = Date.now() - ultimoDisparoEn
    if (transcurrido >= espera) {
      dispararAhora()
      return
    }
    intentosSeguidos += 1
    temporizador = setTimeout(dispararAhora, espera - transcurrido)
  }

  const manejarConexion = () => programarDisparo()
  const manejarVisibilidad = () => {
    if (document.visibilityState === 'visible') programarDisparo()
  }

  window.addEventListener('online', manejarConexion)
  document.addEventListener('visibilitychange', manejarVisibilidad)

  return () => {
    window.removeEventListener('online', manejarConexion)
    document.removeEventListener('visibilitychange', manejarVisibilidad)
    if (temporizador !== null) {
      clearTimeout(temporizador)
      temporizador = null
    }
  }
}

// Un envío que quedó en cola por red o por un 5xx se puede reintentar sin
// intervención del director; 'error' (4xx) y 'sesion-vencida' no.
export function esEstadoReintentable(estado: EstadoEnvio | null): boolean {
  return estado === 'pendiente-envio' || estado === 'error-servidor'
}

// Reintenta con los datos guardados en la cola y conserva su idempotencyKey.
export async function reenviarCola<T>(opciones: EnviarOpciones<T>): Promise<ResultadoEnvio | null> {
  const cola = await leerBorrador<T>(opciones.almacen, opciones.tipo, opciones.cue)
  if (!cola || !esEstadoReintentable(cola.estado)) return null
  return intentarEnviar(cola.datos, opciones)
}

export function programarReintento(intentos: number, callback: () => void): () => void {
  const temporizador = setTimeout(callback, calcularEsperaReintento(intentos))
  return () => clearTimeout(temporizador)
}
