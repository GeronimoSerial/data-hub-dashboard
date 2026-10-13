// Download client for the Prefectura Naval heights page. It fetches the raw
// HTML and hands it to the pure parser (prefectura-parser.ts).
//
// Why not ejecutarConReintentos (providers/cliente-http.ts): it has no way to
// send custom headers (User-Agent, Accept), it JSON-parses the body (raw HTML
// would become `payload_invalido`), and its sleep is not injectable. Reusing
// it would require extending a shared client, so this module carries a small
// local loop with the same policy: timeout, 3 attempts, exponential backoff,
// 429 Retry-After honored with a cap.
//
// Error messages are fixed strings. They never include the response body.

import {
  EstructuraPrefecturaCambiadaError,
  type FilaAlturaPrefectura,
  parsearAlturasPrefectura,
} from './prefectura-parser'

export const URL_ALTURAS_PREFECTURA =
  'https://contenidosweb.prefecturanaval.gob.ar/alturas/index.php'

// Identified agent. It must not carry a personal email address.
export const USER_AGENT_PREFECTURA =
  'data-hub-dashboard/1.0 (+https://analisis.sistemas.mec.gob.ar; monitoreo hidrometrico horario)'

const TIMEOUT_MS_DEFAULT = 15_000
const MAX_INTENTOS = 3
const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 8_000
const RETRY_AFTER_MAX_MS = 30_000

type FetchImpl = typeof fetch

export type ParametrosDescargaPrefectura = {
  fetchImpl?: FetchImpl
  timeoutMs?: number
  /** Injectable sleep so tests never wait for real time. */
  esperar?: (ms: number) => Promise<void>
}

// Fields are assigned explicitly: Node's strip-only TypeScript mode (used by
// scripts/jobs.mjs in production) rejects constructor parameter properties.
export class HttpPrefecturaError extends Error {
  readonly status: number
  readonly retryAfterMs?: number

  constructor(status: number, retryAfterMs?: number) {
    super(`HTTP ${status}`)
    this.name = 'HttpPrefecturaError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

export class ErrorRedPrefectura extends Error {
  readonly motivo: 'timeout' | 'red'

  constructor(motivo: 'timeout' | 'red') {
    super(
      motivo === 'timeout'
        ? 'timeout al consultar la tabla de alturas de Prefectura'
        : 'error de red al consultar la tabla de alturas de Prefectura',
    )
    this.name = 'ErrorRedPrefectura'
    this.motivo = motivo
  }
}

export class OrigenPrefecturaBloqueadoError extends Error {
  constructor() {
    super('El origen de Prefectura no devolvió HTML; no se actualizaron alturas.')
    this.name = 'OrigenPrefecturaBloqueadoError'
  }
}

function backoffMs(intento: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (intento - 1), BACKOFF_MAX_MS)
}

function retryAfterMsDe(valor: string | null): number | undefined {
  if (!valor) return undefined
  const segundos = Number(valor)
  if (!Number.isFinite(segundos) || segundos < 0) return undefined
  return Math.min(segundos * 1000, RETRY_AFTER_MAX_MS)
}

function esReintentable(error: unknown): boolean {
  if (error instanceof ErrorRedPrefectura) return true
  if (error instanceof HttpPrefecturaError) return error.status === 429 || error.status >= 500
  return false
}

async function pedirHtmlUnaVez(fetchImpl: FetchImpl, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  // A test or runtime fetch may ignore the abort signal, so the timeout is
  // enforced by its own promise as well.
  const limite = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new ErrorRedPrefectura('timeout'))
    }, timeoutMs)
  })

  const solicitud = (async (): Promise<string> => {
    const respuesta = await fetchImpl(URL_ALTURAS_PREFECTURA, {
      headers: {
        'User-Agent': USER_AGENT_PREFECTURA,
        Accept: 'text/html',
      },
      signal: controller.signal,
    })
    if (respuesta.status === 429) {
      throw new HttpPrefecturaError(429, retryAfterMsDe(respuesta.headers.get('retry-after')))
    }
    if (!respuesta.ok) throw new HttpPrefecturaError(respuesta.status)

    const tipo = respuesta.headers.get('content-type')
    if (tipo !== null && !/text\/html/i.test(tipo)) throw new OrigenPrefecturaBloqueadoError()

    return respuesta.text()
  })()

  try {
    return await Promise.race([solicitud, limite])
  } catch (error) {
    if (
      error instanceof ErrorRedPrefectura ||
      error instanceof HttpPrefecturaError ||
      error instanceof OrigenPrefecturaBloqueadoError
    ) {
      throw error
    }
    throw new ErrorRedPrefectura('red')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Downloads and parses the Prefectura heights table. Retries 429, 5xx,
 * timeouts and network errors up to 3 attempts. Other HTTP errors, blocked
 * responses and structure changes are not retried.
 */
export async function descargarAlturasPrefectura(
  params: ParametrosDescargaPrefectura = {},
): Promise<FilaAlturaPrefectura[]> {
  const fetchImpl = params.fetchImpl ?? fetch
  const timeoutMs = params.timeoutMs ?? TIMEOUT_MS_DEFAULT
  const esperar = params.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  for (let intento = 1; ; intento++) {
    try {
      const html = await pedirHtmlUnaVez(fetchImpl, timeoutMs)
      return parsearAlturasPrefectura(html)
    } catch (error) {
      if (!esReintentable(error) || intento >= MAX_INTENTOS) throw error
      const espera =
        error instanceof HttpPrefecturaError && error.retryAfterMs !== undefined
          ? error.retryAfterMs
          : backoffMs(intento)
      await esperar(espera)
    }
  }
}

/**
 * Maps a download or parse failure to the health state used by the sync job.
 * 429, 5xx, timeouts and network errors are `degradado`; blocked responses,
 * other HTTP errors and structure changes are `no_disponible`.
 */
export function clasificarErrorPrefectura(error: unknown): 'degradado' | 'no_disponible' {
  if (error instanceof HttpPrefecturaError) {
    return error.status === 429 || error.status >= 500 ? 'degradado' : 'no_disponible'
  }
  if (error instanceof ErrorRedPrefectura) return 'degradado'
  if (error instanceof OrigenPrefecturaBloqueadoError) return 'no_disponible'
  if (error instanceof EstructuraPrefecturaCambiadaError) return 'no_disponible'
  return 'no_disponible'
}
