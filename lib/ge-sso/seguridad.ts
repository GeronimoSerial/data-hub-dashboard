import { createHash, timingSafeEqual } from 'node:crypto'

export const GE_ORIGIN_DEFAULT = 'https://ge.mec.gob.ar'

/** Origen de GE permitido para CORS. Sin Origin (llamadas no-browser) no se acepta. */
export function origenGePermitido(origin: string | null): boolean {
  if (!origin) return false
  const permitido = process.env.GE_SSO_ALLOWED_ORIGIN?.trim() || GE_ORIGIN_DEFAULT
  return origin === permitido
}

export function cabecerasCors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

function sha256(valor: string): Buffer {
  return createHash('sha256').update(valor).digest()
}

/** Comparación en tiempo constante. Se comparan los hashes para que el largo
 *  de la clave esperada no se filtre por timing. */
export function apiKeyCoincide(recibida: string, esperada: string): boolean {
  return timingSafeEqual(sha256(recibida), sha256(esperada))
}

export function ipCliente(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const primera = forwarded?.split(',')[0]?.trim()
  return primera || 'desconocida'
}

// Ventana deslizante en memoria por IP. Es por proceso: suficiente como freno
// básico ante fuerza bruta de api_key; no reemplaza un rate limit de borde.
export const GE_RATE_LIMIT_MAX = 30
export const GE_RATE_LIMIT_WINDOW_MS = 60_000

export class VentanaRateLimit {
  private readonly hits = new Map<string, number[]>()
  private readonly max: number
  private readonly ventanaMs: number

  constructor(max = GE_RATE_LIMIT_MAX, ventanaMs = GE_RATE_LIMIT_WINDOW_MS) {
    this.max = max
    this.ventanaMs = ventanaMs
  }

  /** true si la petición entra en el cupo; false si excede el límite. */
  permitir(ip: string, ahora = Date.now()): boolean {
    const desde = ahora - this.ventanaMs
    const recientes = (this.hits.get(ip) ?? []).filter((t) => t > desde)
    if (recientes.length >= this.max) {
      this.hits.set(ip, recientes)
      return false
    }
    recientes.push(ahora)
    this.hits.set(ip, recientes)
    return true
  }

  reset(): void {
    this.hits.clear()
  }
}

export const geRateLimit = new VentanaRateLimit()
