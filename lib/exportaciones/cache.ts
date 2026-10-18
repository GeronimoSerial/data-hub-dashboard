/** Caché acotada por proceso: comparte consultas en curso y descarta errores. */
export function crearCacheExportaciones<T>(maxEntradas: number, ttlMs = 30_000) {
  const entradas = new Map<string, { vence: number; promesa: Promise<T> }>()

  return {
    limpiar() { entradas.clear() },
    obtener(clave: string, cargar: () => Promise<T>): Promise<T> {
      const ahora = Date.now()
      for (const [key, entrada] of entradas) {
        if (entrada.vence <= ahora) entradas.delete(key)
      }
      const existente = entradas.get(clave)
      if (existente) return existente.promesa

      const entrada = { vence: ahora + ttlMs, promesa: Promise.resolve().then(cargar) }
      entradas.set(clave, entrada)
      while (entradas.size > maxEntradas) entradas.delete(entradas.keys().next().value!)
      void entrada.promesa.catch(() => {
        if (entradas.get(clave) === entrada) entradas.delete(clave)
      })
      return entrada.promesa
    },
  }
}
