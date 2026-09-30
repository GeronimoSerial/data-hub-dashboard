// DB1/F5: configuración del `pg.Pool` extraída de `lib/db/index.ts` y
// ampliada. Módulo puro: no conecta a nada, sólo traduce variables de entorno
// (y una ruta de CA opcional) a las opciones que consume `pg`. El driver real
// (postgres vs. pglite) lo resuelve `./driver`, que no cambia.
import { readFileSync } from 'node:fs'
import type { PoolConfig } from 'pg'

export type SslConfig = boolean | { rejectUnauthorized: boolean; ca?: string }

// SSL. Prioridad:
// 1. DATABASE_SSL_CA_PATH: valida el CA contra ese archivo (TLS estricto). Un
//    CA mal configurado revienta ruidoso al arrancar (error nativo de Node),
//    nunca cae silenciosamente a SSL sin validar.
// 2. TLS forzado sin validar CA (PGSSLMODE=require, DATABASE_SSL=require, o
//    un host RDS): el bundle default de RDS no siempre está en el store de
//    Node, así que se mantiene el comportamiento histórico.
// 3. DATABASE_SSL=true/'1': TLS validando.
// 4. Cualquier otro caso: sin SSL (podman local / Postgres de dev sin TLS).
export function resolveSslConfig(connectionString: string): SslConfig {
  const caPath = process.env.DATABASE_SSL_CA_PATH
  if (caPath) {
    const ca = readFileSync(caPath, 'utf8')
    return { rejectUnauthorized: true, ca }
  }

  const tlsSinValidar =
    process.env.PGSSLMODE === 'require' ||
    process.env.DATABASE_SSL === 'require' ||
    connectionString.includes('rds.amazonaws.com')
  if (tlsSinValidar) return { rejectUnauthorized: false }

  const valor = process.env.DATABASE_SSL
  if (valor === 'true' || valor === '1') return { rejectUnauthorized: true }

  return false
}

// Parsea una env var numérica. Cualquier valor ausente, vacío, no numérico,
// no finito o <= 0 se ignora (devuelve undefined) para no romper el arranque
// por una variable mal escrita.
function numeroPositivo(valor: string | undefined): number | undefined {
  if (valor === undefined) return undefined
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function resolvePoolConfig(): {
  max?: number
  idleTimeoutMillis?: number
  connectionTimeoutMillis?: number
  statement_timeout?: number
} {
  return {
    // Sin default explícito: si no está seteada, `pg` usa su propio 10.
    max: numeroPositivo(process.env.DATABASE_POOL_MAX),
    // 10000 es el default de `pg`; lo dejamos explícito para documentarlo.
    idleTimeoutMillis: numeroPositivo(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS) ?? 10000,
    // `pg` no tiene timeout de conexión por default (0/sin límite); contra RDS
    // conviene fallar rápido en vez de colgarse.
    connectionTimeoutMillis: numeroPositivo(process.env.DATABASE_POOL_CONNECT_TIMEOUT_MS) ?? 5000,
    // Protege contra queries colgadas. Opción soportada por `pg.Pool`, se
    // aplica por conexión.
    statement_timeout: numeroPositivo(process.env.DATABASE_STATEMENT_TIMEOUT_MS) ?? 30000,
  }
}

export function buildPgPoolConfig(connectionString: string): PoolConfig {
  return {
    connectionString,
    ssl: resolveSslConfig(connectionString),
    ...resolvePoolConfig(),
  }
}
