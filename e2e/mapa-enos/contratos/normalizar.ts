// Normalizes API responses before they are compared with a snapshot.
//
// Only values that change on every seed run are replaced. Real values are never removed:
// names, counts, numbers, booleans, nulls and the order of arrays stay as they are.
//
// - UUIDs become `<uuid:N>`. N is assigned by first appearance in the normalized output, so
//   the same UUID always gets the same N within one call, and two seed runs with different
//   UUIDs produce the same text.
// - ISO dates and timestamps become `<fecha>`. The seed generates them relative to "now".
//   Known trade-off: a wrong date is not detected by a snapshot. Assert dates in a
//   dedicated test when the date itself is the behavior under test.
// - Object keys are sorted, so the output does not depend on insertion order.
// - Arrays keep their order, because order is part of the contract. Use `ordenarPor` only
//   when the endpoint documents no order.
// - Numeric ids are kept: the seed runs on a fresh database, so sequences are deterministic.

export type OpcionesNormalizar = {
  /** Sorts every array whose items are all plain objects having this key. Applied recursively. */
  ordenarPor?: string
}

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const FECHA = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g

export const MARCA_FECHA = '<fecha>'

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return false
  const proto = Object.getPrototypeOf(valor)
  return proto === Object.prototype || proto === null
}

function ordenarArreglo(items: unknown[], clave: string): unknown[] {
  const todosConClave = items.every((item) => esObjetoPlano(item) && clave in item)
  if (!todosConClave) return items
  return [...items].sort((a, b) => {
    const x = (a as Record<string, unknown>)[clave]
    const y = (b as Record<string, unknown>)[clave]
    if (x === y) return 0
    return String(x) < String(y) ? -1 : 1
  })
}

/**
 * Returns a deterministic copy of `valor` with volatile values replaced. Pure: the input is not modified.
 * Calling it twice on the same input yields the same output.
 */
export function normalizar(valor: unknown, opciones: OpcionesNormalizar = {}): unknown {
  const uuids = new Map<string, number>()

  const numerarUuid = (uuid: string): string => {
    const clave = uuid.toLowerCase()
    let numero = uuids.get(clave)
    if (numero === undefined) {
      numero = uuids.size + 1
      uuids.set(clave, numero)
    }
    return `<uuid:${numero}>`
  }

  const normalizarTexto = (texto: string): string =>
    texto.replace(UUID, numerarUuid).replace(FECHA, MARCA_FECHA)

  const visitar = (actual: unknown): unknown => {
    if (actual === null || typeof actual === 'boolean' || typeof actual === 'number') return actual
    if (typeof actual === 'string') return normalizarTexto(actual)
    if (actual instanceof Date) return MARCA_FECHA
    if (Array.isArray(actual)) {
      const items = opciones.ordenarPor ? ordenarArreglo(actual, opciones.ordenarPor) : actual
      return items.map(visitar)
    }
    if (esObjetoPlano(actual)) {
      const salida: Record<string, unknown> = {}
      for (const clave of Object.keys(actual).sort()) {
        if (actual[clave] === undefined) continue
        salida[clave] = visitar(actual[clave])
      }
      return salida
    }
    return String(actual)
  }

  return visitar(valor)
}
