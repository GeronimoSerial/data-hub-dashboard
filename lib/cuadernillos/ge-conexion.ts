import { getRawClient } from '@/lib/db'
import { transaccionContextual } from '@/lib/db/contexto'
import { crearEjecutorSql, ensureGeSchema, type EjecutorSql, type GeSchemaReady } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'

let preparado: Promise<GeSchemaReady> | null = null

/**
 * Adjunta GE y asegura su esquema una sola vez por proceso, por el cliente crudo.
 * Las rutas la llaman antes de abrir cambioAuditado: así ningún DDL corre con la transacción abierta.
 */
export function prepararEsquemaGe(): Promise<GeSchemaReady> {
  preparado ??= (async () => {
    const client = crearEjecutorSql(getRawClient())
    await asegurarGeAdjuntada(client)
    return ensureGeSchema(client)
  })().catch((error: unknown) => {
    preparado = null
    throw error
  })
  return preparado
}

/** Dentro de cambioAuditado lee por la misma conexión de la transacción; fuera, por el cliente crudo. */
export function ejecutorGe(): EjecutorSql {
  const transaccion = transaccionContextual.getStore()
  return crearEjecutorSql(transaccion ?? getRawClient())
}
