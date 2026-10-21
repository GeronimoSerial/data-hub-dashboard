import { describe, it, expect } from 'vitest'
import { cargarMateriales, materialesPublicados } from './materiales'

describe('catálogo público de materiales', () => {
  it('separa los tres documentos publicados en las dos colecciones', async () => {
    const colecciones = await cargarMateriales()
    expect(colecciones.map(c => [c.id, c.materiales.length])).toEqual([['manuales', 1], ['cuadernillos', 2]])
    expect(colecciones[0].materiales[0]).toMatchObject({ href: '/api/materiales/manual-1/descargar', paginas: 15 })
  })
  it('usa identificadores únicos y objetos versionados por contenido', () => {
    expect(new Set(materialesPublicados.map(m => m.id)).size).toBe(3)
    for (const material of materialesPublicados) {
      expect(material.storageKey).toBe(`materiales/${material.coleccion}/${material.archivo}`)
      expect(material.archivo).toContain(material.sha256.slice(0, 12))
      expect(material.bytes).toBeGreaterThan(0)
    }
  })
})
