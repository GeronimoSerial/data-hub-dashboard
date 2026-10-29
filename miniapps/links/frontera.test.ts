import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The miniapp may reuse shared infrastructure (db driver, ui primitives, brand,
// rate limiter) but nothing that belongs to the Hub's domain.
const PROHIBIDO = [
  /@\/lib\/(auth|session|acl)/,
  /@\/components\/admin/,
  /@\/components\/admin-shell/,
  /adminPageGate|staffGuard|getSessionUser/,
]

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre)
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta]
  })
}

describe('frontera de la miniapp de enlaces', () => {
  const raices = [path.join(__dirname), path.join(__dirname, '../../app/(miniapps)/(links)')]
  const fuentes = raices.flatMap(archivos).filter((f) => /\.(ts|tsx)$/.test(f) && !/frontera\.test\.ts$/.test(f) && !/\.test\./.test(f))

  it('encuentra archivos que revisar', () => {
    expect(fuentes.length).toBeGreaterThan(5)
  })

  it.each(fuentes.map((f) => [path.relative(process.cwd(), f), f]))('%s no importa nada del Hub', (_nombre, archivo) => {
    const texto = readFileSync(archivo, 'utf8')
    for (const patron of PROHIBIDO) expect(texto).not.toMatch(patron)
  })
})
