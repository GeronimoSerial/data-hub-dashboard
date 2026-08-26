import { describe, expect, it } from 'vitest'
import { parseRecursoBody, rutaStorageKeyConflict } from './recurso-write'

describe('rutaStorageKeyConflict', () => {
  it('is true only when both ruta and storageKey are set', () => {
    expect(rutaStorageKeyConflict('/mapas/matricula', 'uploads/a')).toBe(true)
    expect(rutaStorageKeyConflict('/mapas/matricula', undefined)).toBe(false)
    expect(rutaStorageKeyConflict(undefined, 'uploads/a')).toBe(false)
    expect(rutaStorageKeyConflict('  ', 'uploads/a')).toBe(false)
    expect(rutaStorageKeyConflict(null, null)).toBe(false)
  })
})

describe('parseRecursoBody', () => {
  const base = {
    id: 'r-new',
    titulo: 'Título',
    descripcion: 'Desc',
    formato: 'reporte',
    nivelId: 'primario',
    tipoId: 'informe',
    categoriaId: 'matricula',
    tagIds: ['anual'],
    area: 'DSI',
    actualizado: '2026-08-26',
    estado: 'borrador',
  }

  it('accepts a valid recurso', () => {
    expect(parseRecursoBody(base)?.id).toBe('r-new')
  })

  it('rejects missing id and invalid formato', () => {
    expect(parseRecursoBody({ ...base, id: '' })).toBeNull()
    expect(parseRecursoBody({ ...base, formato: 'pdf' })).toBeNull()
  })
})
