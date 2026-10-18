import { createHash } from 'node:crypto'
import type { FormatoDataset } from './catalogo'

export type Datos = Record<string, unknown>
export type DocumentoDataset = Datos | Datos[]
export type EntradaVersion = {
  datasetId: string; nombre: string; revision: string; fuente: string
  licencia?: string | null; fechaFuente?: string | null; formato: FormatoDataset
  clave?: string; claves?: string[]; datos: DocumentoDataset; metadatos?: Datos; entradas?: string[]
}

function canonico(valor: unknown): unknown {
  if (typeof valor === 'number' && !Number.isFinite(valor)) throw new Error('Número no finito en dataset')
  if (Array.isArray(valor)) return valor.map(canonico)
  if (valor !== null && typeof valor === 'object') {
    if (Object.getPrototypeOf(valor) !== Object.prototype && Object.getPrototypeOf(valor) !== null) throw new Error('Objeto no JSON en dataset')
    return Object.fromEntries(Object.entries(valor).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => [k, canonico(v)]))
  }
  if (valor === undefined || typeof valor === 'function' || typeof valor === 'bigint') throw new Error('Valor no JSON en dataset')
  return valor
}

export function prepararVersion(entrada: EntradaVersion) {
  if (!/^[a-z][a-z0-9-]{1,100}$/.test(entrada.datasetId) || !entrada.revision || !entrada.fuente) throw new Error('Identidad o procedencia inválida')
  const estructura: Datos = entrada.formato === 'array' ? {} : { ...(entrada.datos as Datos) }
  const filas = entrada.formato === 'array' ? entrada.datos : estructura[entrada.formato]
  if (!Array.isArray(filas)) throw new Error('El dataset debe contener registros')
  if (entrada.formato !== 'array') delete estructura[entrada.formato]
  if (entrada.claves && entrada.claves.length !== filas.length) throw new Error('Cantidad de claves inválida')
  const claves = new Set<string>()
  const registros = filas.map((datos: unknown, orden: number) => {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('Registro inválido')
    const valorClave = entrada.claves ? entrada.claves[orden] : entrada.clave ? entrada.clave.split('.').reduce<unknown>((actual, key) => (actual as Datos | null)?.[key], datos) : orden
    if (valorClave === undefined || valorClave === null || valorClave === '') throw new Error(`Falta clave de registro en fila ${orden}`)
    const clave = String(valorClave)
    if (claves.has(clave)) throw new Error(`Clave duplicada: ${clave}`)
    claves.add(clave)
    return { clave, orden, datos: datos as Datos }
  })
  const entradas = [...new Set(entrada.entradas ?? [])].sort()
  const material = { datasetId: entrada.datasetId, revision: entrada.revision, fuente: entrada.fuente,
    licencia: entrada.licencia ?? null, fechaFuente: entrada.fechaFuente ? new Date(entrada.fechaFuente).toISOString() : null,
    formato: entrada.formato, estructura, metadatos: entrada.metadatos ?? {}, entradas, registros }
  const checksum = createHash('sha256').update(JSON.stringify(canonico(material))).digest('hex')
  return { id: checksum, checksum, estructura, registros, entradas }
}

export function reconstruirDocumento(formato: string, estructura: Datos, filas: Datos[]): DocumentoDataset {
  return formato === 'array' ? filas : { ...estructura, [formato]: filas }
}

export function filasACsv(filas: Datos[]): string {
  if (!filas.length) return ''
  const columnas = Object.keys(filas[0])
  const campo = (v: unknown) => '"' + String(v ?? '').replaceAll('"', '""') + '"'
  return [columnas.map(campo).join(','), ...filas.map((fila) => columnas.map((col) => campo(fila[col])).join(','))].join('\r\n') + '\r\n'
}
