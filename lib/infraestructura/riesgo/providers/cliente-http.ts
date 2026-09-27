// Cliente HTTP compartido para los adapters de Open-Meteo (ECMWF, Archive,
// Flood). Centraliza lo que el plan exige para robustez de E2: timeout,
// backoff acotado, manejo explícito de 429 y cuarentena de payload inválido —
// para no reimplementarlo tres veces con matices distintos por adapter.
//
// Por qué no usa un test de red: los tests de los adapters inyectan un
// `fetchImpl` fixture (ver ejecutarConReintentos con `fetchImpl` opcional);
// nunca golpean la red real. Las pruebas reales fechadas son manuales,
// documentadas en docs/ejecucion-enos/E2/registro.md §3.

export type ResultadoHttp<T> =
  | { ok: true; datos: T }
  | { ok: false; motivo: 'timeout' | 'rate_limited' | 'http_error' | 'payload_invalido'; detalle: string }

type FetchImpl = typeof fetch

export type ParametrosSolicitud<T> = {
  url: string
  fetchImpl?: FetchImpl
  timeoutMs?: number
  maxIntentos?: number
  /** Backoff base en ms; el intento N espera base * 2^(N-1), acotado por backoffMaxMs. */
  backoffBaseMs?: number
  backoffMaxMs?: number
  parsearPayload: (json: unknown) => T
}

const TIMEOUT_MS_DEFAULT = 10_000
const MAX_INTENTOS_DEFAULT = 3
const BACKOFF_BASE_MS_DEFAULT = 500
const BACKOFF_MAX_MS_DEFAULT = 8_000

function backoffMs(intento: number, baseMs: number, maxMs: number): number {
  return Math.min(baseMs * 2 ** (intento - 1), maxMs)
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Ejecuta una solicitud HTTP con timeout, reintentos acotados con backoff
 * exponencial, tratamiento explícito de 429 (respeta `Retry-After` si viene,
 * si no usa el backoff calculado) y cuarentena de payload inválido: si
 * `parsearPayload` lanza, NO reintenta (el payload ya llegó, reintentar no lo
 * arregla) — devuelve `payload_invalido` con el cuerpo crudo saneado a 500
 * caracteres para diagnóstico, sin secretos.
 */
export async function ejecutarConReintentos<T>(
  params: ParametrosSolicitud<T>,
): Promise<ResultadoHttp<T>> {
  const fetchImpl = params.fetchImpl ?? fetch
  const timeoutMs = params.timeoutMs ?? TIMEOUT_MS_DEFAULT
  const maxIntentos = params.maxIntentos ?? MAX_INTENTOS_DEFAULT
  const backoffBaseMs = params.backoffBaseMs ?? BACKOFF_BASE_MS_DEFAULT
  const backoffMaxMs = params.backoffMaxMs ?? BACKOFF_MAX_MS_DEFAULT

  let ultimoError: ResultadoHttp<T> = {
    ok: false,
    motivo: 'http_error',
    detalle: 'no se intentó ninguna solicitud',
  }

  for (let intento = 1; intento <= maxIntentos; intento++) {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    // Se corre contra una promesa de timeout propia (no sólo el AbortSignal)
    // porque un fetchImpl de test puede no respetar la señal de abort; así el
    // timeout se cumple igual, sin depender de que el implementor colabore.
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new DOMException('timeout', 'AbortError'))
      }, timeoutMs)
    })
    try {
      const respuesta = await Promise.race([
        fetchImpl(params.url, { signal: controller.signal }),
        timeoutPromise,
      ])
      clearTimeout(timer)

      if (respuesta.status === 429) {
        const retryAfterHeader = respuesta.headers.get('retry-after')
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN
        ultimoError = {
          ok: false,
          motivo: 'rate_limited',
          detalle: `HTTP 429 en intento ${intento}/${maxIntentos}`,
        }
        if (intento < maxIntentos) {
          const espera = Number.isFinite(retryAfterMs)
            ? Math.min(retryAfterMs, backoffMaxMs)
            : backoffMs(intento, backoffBaseMs, backoffMaxMs)
          await esperar(espera)
          continue
        }
        return ultimoError
      }

      if (!respuesta.ok) {
        ultimoError = {
          ok: false,
          motivo: 'http_error',
          detalle: `HTTP ${respuesta.status} en intento ${intento}/${maxIntentos}`,
        }
        if (intento < maxIntentos) {
          await esperar(backoffMs(intento, backoffBaseMs, backoffMaxMs))
          continue
        }
        return ultimoError
      }

      const texto = await respuesta.text()
      let json: unknown
      try {
        json = JSON.parse(texto)
      } catch {
        return {
          ok: false,
          motivo: 'payload_invalido',
          detalle: `JSON inválido, cuerpo (recortado): ${texto.slice(0, 500)}`,
        }
      }

      try {
        const datos = params.parsearPayload(json)
        return { ok: true, datos }
      } catch (error) {
        return {
          ok: false,
          motivo: 'payload_invalido',
          detalle: `payload no cumple el contrato esperado: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }
      }
    } catch (error) {
      clearTimeout(timer)
      const esAbort =
        (error instanceof Error && error.name === 'AbortError') ||
        (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
      ultimoError = {
        ok: false,
        motivo: esAbort ? 'timeout' : 'http_error',
        detalle: esAbort
          ? `timeout tras ${timeoutMs}ms en intento ${intento}/${maxIntentos}`
          : `error de red en intento ${intento}/${maxIntentos}: ${
              error instanceof Error ? error.message : String(error)
            }`,
      }
      if (intento < maxIntentos) {
        await esperar(backoffMs(intento, backoffBaseMs, backoffMaxMs))
        continue
      }
      return ultimoError
    }
  }

  return ultimoError
}
