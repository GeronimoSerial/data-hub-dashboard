import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// CA1: the motor must not import anything Prefectura-specific. Only the
// adapter (adaptadores/) and motor/rio-prefectura.ts may name it.
const RAIZ_MOTOR = fileURLToPath(new URL('.', import.meta.url))
const IMPORT_RE = /(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g

export function buscarImportsPrefectura(fuente: string): string[] {
  return [...fuente.matchAll(IMPORT_RE)].map((m) => m[1]).filter((ruta) => /prefectura/i.test(ruta))
}

function archivosMotorNeutral(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) return entrada.name === 'adaptadores' ? [] : archivosMotorNeutral(ruta)
    if (!entrada.name.endsWith('.ts')) return []
    if (entrada.name.endsWith('.test.ts') || entrada.name === 'rio-prefectura.ts') return []
    return [ruta]
  })
}

describe('buscarImportsPrefectura (scanner)', () => {
  it('flags static, type-only, side-effect, dynamic and require imports', () => {
    const fuente = [
      "import { x } from './rio-prefectura'",
      "import type { Y } from '../../hidrometria/estaciones-prefectura'",
      "import './prefectura-setup'",
      "const m = await import('./sub/PREFECTURA-mod')",
      "const r = require('./prefectura')",
      "export * from './tramos-prefectura'",
    ].join('\n')
    expect(buscarImportsPrefectura(fuente)).toEqual([
      './rio-prefectura',
      '../../hidrometria/estaciones-prefectura',
      './prefectura-setup',
      './sub/PREFECTURA-mod',
      './prefectura',
      './tramos-prefectura',
    ])
  })

  it('ignores neutral imports and Prefectura words outside import paths', () => {
    const fuente = [
      "import { valorAmenazaRio } from './nivel-rio'",
      "const texto = 'estado de prefectura, sin import'",
    ].join('\n')
    expect(buscarImportsPrefectura(fuente)).toEqual([])
  })
})

describe('motor neutral (CA1)', () => {
  it('no motor file outside adaptadores/ imports a Prefectura path', () => {
    const archivos = archivosMotorNeutral(RAIZ_MOTOR)
    expect(archivos.length).toBeGreaterThan(5)
    const infracciones = archivos.flatMap((ruta) => {
      const hallazgos = buscarImportsPrefectura(readFileSync(ruta, 'utf8'))
      return hallazgos.map((imp) => `${ruta}: ${imp}`)
    })
    expect(infracciones).toEqual([])
  })
})
