// Límites del endpoint público de solo-CUE. El tope por CUE de alertas
// vivientes (CUE_MAX_ALERTAS_ACTIVAS) quedó sin implementación cuando la Fase
// 4 retiró el conteo contra el modelo deprecado: el modelo de parte tiene un
// único parte por CUE y período, así que ese tope ya no aplica (ver el
// comentario de idempotencia en app/api/problematicas/parte/route.ts).
export const IP_WINDOW_MS = 60_000
export const IP_MAX_REQUESTS = 10

export const CUE_WINDOW_MS = 24 * 60 * 60 * 1000
export const CUE_MAX_ALERTAS_ACTIVAS = 5

interface Bucket {
  count: number
  windowStart: number
}

const ipBuckets = new Map<string, Bucket>()

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

// true = excede el límite y la request debe rechazarse. Cada máximo tiene su
// propio contador: rutas con distinto tope (acceso/parte 10, verificaciones 100)
// no comparten bucket.
export function ipExcedeLimite(ip: string, now: number = Date.now(), max: number = IP_MAX_REQUESTS): boolean {
  const clave = `${max}|${ip}`
  const bucket = ipBuckets.get(clave)
  if (!bucket || now - bucket.windowStart > IP_WINDOW_MS) {
    ipBuckets.set(clave, { count: 1, windowStart: now })
    return false
  }
  bucket.count += 1
  return bucket.count > max
}

export function _resetLimitesParaTests(): void {
  ipBuckets.clear()
}
