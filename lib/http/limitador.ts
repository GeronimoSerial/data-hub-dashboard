// Fixed-window rate limiter keyed by an arbitrary string (IP, user, CUE).
// In-memory per process: it protects a single instance from bursts; a shared
// store would be needed to enforce a global limit across replicas.
export interface Limitador {
  // Returns the seconds to wait when the key exceeded its limit, or null.
  consumir(clave: string, ahora?: number): number | null
  reiniciar(): void
}

const limitadores = new Set<Limitador>()

// Hard bound on tracked keys: a flood of distinct keys (spoofed IPs) must not grow memory.
const MAX_CLAVES = 10_000

export function crearLimitador(opciones: { ventanaMs: number; max: number }): Limitador {
  const buckets = new Map<string, { cuenta: number; inicio: number }>()
  const limitador: Limitador = {
    consumir(clave, ahora = Date.now()) {
      const bucket = buckets.get(clave)
      if (!bucket || ahora - bucket.inicio >= opciones.ventanaMs) {
        if (!bucket && buckets.size >= MAX_CLAVES) {
          // Drop expired buckets first; if none expired, evict the oldest key (Map keeps insertion order).
          for (const [k, b] of buckets) if (ahora - b.inicio >= opciones.ventanaMs) buckets.delete(k)
          if (buckets.size >= MAX_CLAVES) buckets.delete(buckets.keys().next().value as string)
        }
        buckets.set(clave, { cuenta: 1, inicio: ahora })
        return null
      }
      bucket.cuenta += 1
      if (bucket.cuenta <= opciones.max) return null
      return Math.max(1, Math.ceil((bucket.inicio + opciones.ventanaMs - ahora) / 1000))
    },
    reiniciar() {
      buckets.clear()
    },
  }
  limitadores.add(limitador)
  return limitador
}

export function _reiniciarLimitadoresParaTests(): void {
  for (const limitador of limitadores) limitador.reiniciar()
}
