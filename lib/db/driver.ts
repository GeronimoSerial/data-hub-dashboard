export type DbDriver = 'sqlite' | 'postgres'

export function resolveDriver(): DbDriver {
  const url = process.env.DATABASE_URL
  if (url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
    return 'postgres'
  }
  return 'sqlite'
}
