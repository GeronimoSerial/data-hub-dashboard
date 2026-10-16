// Memoria derivada de la publicación en DB. No contiene datos de referencia.
// Compartida entre bundles de Next; separada por conexión/entorno.
type Referencia = { versionId: string; documento: unknown; revision: string }
type Estado = { referencias: Map<string, Referencia>; cargadoEn: number }
const clave = Symbol.for('infra.datasets.memoria')
export function estadoReferencias(): Estado {
  const global = globalThis as typeof globalThis & { [clave]?: Map<string, Estado> }
  const entornos = global[clave] ??= new Map()
  const entorno = process.env.DATABASE_URL ?? (process.env.VITEST ? 'test' : process.env.DATA_DIR ?? 'local')
  let estado = entornos.get(entorno)
  if (!estado) { estado = { referencias: new Map(), cargadoEn: 0 }; entornos.set(entorno, estado) }
  return estado
}
export function referencia<T>(id: string): T {
  const actual = estadoReferencias().referencias.get(id)
  if (!actual) throw new Error(`Dataset sin publicar: ${id}. Ejecutar datasets:importar o datasets:replicar.`)
  return actual.documento as T
}
export function versionReferencia(id: string): string {
  const actual = estadoReferencias().referencias.get(id)
  if (!actual) throw new Error(`Dataset sin publicar: ${id}`)
  return actual.versionId
}
