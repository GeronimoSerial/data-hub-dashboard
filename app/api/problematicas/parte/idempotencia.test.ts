import { describe, expect, it } from 'vitest'
import { esViolacionUniqueIdempotencyKey } from './idempotencia'

// Forma que deja Drizzle al envolver el error del driver: el texto de la
// query (que incluye la columna idempotency_key) va en `message` y el error
// real del driver en `cause`.
function envuelto(cause: unknown, query = 'insert into "infra_movimiento" ("idempotency_key") values ($1)'): Error {
  return Object.assign(new Error(`Failed query: ${query}`), { cause })
}

function errorPg(constraint: string | undefined, message: string, code = '23505'): Error {
  return Object.assign(new Error(message), { code, constraint })
}

describe('esViolacionUniqueIdempotencyKey', () => {
  it('detecta por código 23505 y constraint del índice único, aunque el mensaje no mencione la columna', () => {
    const err = envuelto(errorPg('infra_movimiento_idempotency_key_uidx', 'duplicate key value violates unique constraint "infra_movimiento_idempotency_key_uidx"'))
    expect(esViolacionUniqueIdempotencyKey(err)).toBe(true)
  })

  it('detecta el error del driver directamente, sin envoltorio', () => {
    expect(esViolacionUniqueIdempotencyKey(errorPg('infra_movimiento_idempotency_key_uidx', 'duplicate key'))).toBe(true)
  })

  it('no confunde otra violación de unicidad cuyo texto de query menciona idempotency_key', () => {
    const err = envuelto(errorPg('infra_parte_cue_uidx', 'duplicate key value violates unique constraint "infra_parte_cue_uidx"'))
    expect(esViolacionUniqueIdempotencyKey(err)).toBe(false)
  })

  it('sin constraint en el error del driver, usa el mensaje del propio driver (no el de la query)', () => {
    const duplicadoPorMensaje = errorPg(undefined, 'duplicate key value violates unique constraint "infra_movimiento_idempotency_key_uidx"')
    expect(esViolacionUniqueIdempotencyKey(envuelto(duplicadoPorMensaje))).toBe(true)

    const otroConQueryConLaColumna = errorPg(undefined, 'duplicate key value violates unique constraint "infra_parte_cue_uidx"')
    expect(esViolacionUniqueIdempotencyKey(envuelto(otroConQueryConLaColumna))).toBe(false)
  })

  it('sin código de driver, reconoce el mensaje de SQLite por UNIQUE constraint', () => {
    expect(esViolacionUniqueIdempotencyKey(new Error('UNIQUE constraint failed: infra_movimiento.idempotency_key'))).toBe(true)
  })

  it('ignora otros códigos de error y errores sin relación', () => {
    expect(esViolacionUniqueIdempotencyKey(envuelto(errorPg('infra_movimiento_idempotency_key_uidx', 'could not serialize', '40001')))).toBe(false)
    expect(esViolacionUniqueIdempotencyKey(new Error('connection reset'))).toBe(false)
    expect(esViolacionUniqueIdempotencyKey(null)).toBe(false)
  })
})
