import { describe, it, expect } from 'vitest'
import { cargarMateriales, materialesPublicados } from './materiales'

describe('catálogo público de materiales', () => {
  it('separa los materiales publicados en las dos colecciones', async () => {
    const colecciones = await cargarMateriales()
    expect(colecciones.map(c => [c.id, c.materiales.length])).toEqual([['manuales', 2], ['cuadernillos', 7]])
    expect(colecciones[0].materiales[0]).toMatchObject({ href: '/api/materiales/manual-1/descargar', paginas: 15 })
    expect(colecciones[0].materiales[1]).toMatchObject({ tipo: 'video', href: '/api/materiales/video-manual-directivos/video', poster: '/materiales/manuales/video-manual-directivos.jpg' })
  })
  it('usa identificadores únicos y objetos versionados por contenido', () => {
    expect(new Set(materialesPublicados.map(m => m.id)).size).toBe(9)
    for (const material of materialesPublicados) {
      expect(material.storageKey).toBe(`materiales/${material.coleccion}/${material.archivo}`)
      expect(material.archivo).toContain(material.sha256.slice(0, 12))
      expect(material.bytes).toBeGreaterThan(0)
    }
  })
  it('includes initial and the supplied third–sixth grade versions', async () => {
    const collections = await cargarMateriales()
    expect(collections[1].materiales.map(m => [m.href, m.paginas])).toEqual([
      ['/api/materiales/cuadernillo-nivel-inicial/descargar', 112],
      ['/api/materiales/cuadernillo-1-grado/descargar', 129],
      ['/api/materiales/cuadernillo-2-grado/descargar', 132],
      ['/api/materiales/cuadernillo-3-grado/descargar', 212],
      ['/api/materiales/cuadernillo-4-grado/descargar', 135],
      ['/api/materiales/cuadernillo-5-grado/descargar', 176],
      ['/api/materiales/cuadernillo-6-grado/descargar', 136],
    ])
  })
})
