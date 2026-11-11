import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guarda: el dataset V29 incluye importes salariales por establecimiento y solo puede servirse por API protegida.
const RAIZ = join(__dirname, '..', '..')
const IGNORADOS = new Set(['node_modules', '.next', '.git'])
const MARCA_DATOS = 'reorganizacion/data'
const PERMITIDOS = new Set(['app/api/mapas/reorganizacion/datos/route.ts'])
const PERMITIDOS_PREFIJO = 'lib/reorganizacion/'

function recorrer(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (IGNORADOS.has(nombre)) return []
    const ruta = join(dir, nombre)
    return statSync(ruta).isDirectory() ? recorrer(ruta) : [ruta]
  })
}

function rel(ruta: string): string {
  return relative(RAIZ, ruta).split(sep).join('/')
}

function archivosEn(carpeta: string): string[] {
  return recorrer(join(RAIZ, carpeta))
}

describe('datos V29 solo en servidor', () => {
  it('ningún archivo de public/ se llama como el dataset o la reorganización', () => {
    const coincidencias = archivosEn('public').map(rel).filter((r) => /v29|reorganizacion/i.test(r))
    expect(coincidencias).toEqual([])
  })

  it('ningún archivo de public/ referencia el dataset', () => {
    const coincidencias = archivosEn('public')
      .filter((ruta) => readFileSync(ruta, 'utf8').includes(MARCA_DATOS))
      .map(rel)
    expect(coincidencias).toEqual([])
  })

  it('solo módulos de servidor de app/ y lib/ referencian el dataset', () => {
    const referencias = [...archivosEn('app'), ...archivosEn('components')]
      .filter((ruta) => readFileSync(ruta, 'utf8').includes(MARCA_DATOS))
      .map(rel)
    const ajenos = referencias.filter((r) => !PERMITIDOS.has(r) && !r.startsWith(PERMITIDOS_PREFIJO))
    expect(ajenos).toEqual([])
  })

  it('ningún módulo marcado como cliente referencia el dataset', () => {
    const cliente = [...archivosEn('app'), ...archivosEn('components')]
      .filter((ruta) => {
        const fuente = readFileSync(ruta, 'utf8')
        return fuente.includes(MARCA_DATOS) && /^\s*['"]use client['"]/m.test(fuente)
      })
      .map(rel)
    expect(cliente).toEqual([])
  })
})
