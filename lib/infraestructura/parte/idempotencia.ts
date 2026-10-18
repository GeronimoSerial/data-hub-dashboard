// Índice único infra_movimiento_idempotency_key_uidx (drizzle/0000). Postgres
// (node-postgres en producción, pglite en tests) reporta la violación con
// code '23505' y `constraint` = nombre del índice.
const CODIGO_UNIQUE_VIOLATION = '23505'
const PATRON_IDEMPOTENCY_KEY = /idempotency_key/i
const PATRON_UNIQUE_SQLITE = /UNIQUE constraint failed.*idempotency_key/i

// Drizzle envuelve el error del driver en `cause` y su `message` contiene el
// SQL completo (con la columna idempotency_key), así que el primer nodo con
// `code` es el único que sirve para decidir.
function nodosDeCausa(err: unknown): Array<{ code?: unknown; constraint?: unknown; message?: unknown }> {
  const nodos: Array<{ code?: unknown; constraint?: unknown; message?: unknown }> = []
  let actual: unknown = err
  for (let i = 0; i < 5 && actual && typeof actual === 'object'; i++) {
    nodos.push(actual as { code?: unknown; constraint?: unknown; message?: unknown })
    actual = (actual as { cause?: unknown }).cause
  }
  return nodos
}

export function esViolacionUniqueIdempotencyKey(err: unknown): boolean {
  const nodos = nodosDeCausa(err)
  const nodoDriver = nodos.find((n) => typeof n.code === 'string')
  if (!nodoDriver) {
    return nodos.some((n) => typeof n.message === 'string' && PATRON_UNIQUE_SQLITE.test(n.message))
  }
  if (nodoDriver.code !== CODIGO_UNIQUE_VIOLATION) return false
  if (typeof nodoDriver.constraint === 'string') return PATRON_IDEMPOTENCY_KEY.test(nodoDriver.constraint)
  return typeof nodoDriver.message === 'string' && PATRON_IDEMPOTENCY_KEY.test(nodoDriver.message)
}
