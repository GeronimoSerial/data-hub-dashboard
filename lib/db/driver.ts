// DB1/F2: SQLite fue reemplazado por Postgres. 'postgres' es
// drizzle-orm/node-postgres contra DATABASE_URL (producción, staging, RDS);
// 'pglite' es drizzle-orm/pglite (@electric-sql/pglite), sin servicio
// externo, para tests (en memoria) y desarrollo local (persistida en
// DATA_DIR/pg) cuando no hay DATABASE_URL.
export type DbDriver = 'pglite' | 'postgres'

export function resolveDriver(): DbDriver {
  const url = process.env.DATABASE_URL
  if (url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
    return 'postgres'
  }
  return 'pglite'
}
