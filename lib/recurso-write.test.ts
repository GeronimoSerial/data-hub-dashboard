import { describe, expect, it } from 'vitest'
import {
  deferPublishUntilFile,
  isAllowedRuta,
  parseRecursoBody,
  publicadoXorInvalid,
  rutaStorageKeyConflict,
} from './recurso-write'

describe('rutaStorageKeyConflict', () => {
  it('is true only when both ruta and storageKey are set', () => {
    expect(rutaStorageKeyConflict('/mapas/matricula', 'uploads/a')).toBe(true)
    expect(rutaStorageKeyConflict('/mapas/matricula', undefined)).toBe(false)
    expect(rutaStorageKeyConflict(undefined, 'uploads/a')).toBe(false)
    expect(rutaStorageKeyConflict('  ', 'uploads/a')).toBe(false)
    expect(rutaStorageKeyConflict(null, null)).toBe(false)
  })
})

describe('deferPublishUntilFile', () => {
  it('defers publish when creating a published recurso with a new file and no storageKey', () => {
    expect(deferPublishUntilFile('publicado', undefined, true)).toBe(true)
    expect(deferPublishUntilFile('publicado', '', true)).toBe(true)
  })

  it('does not defer when already a borrador, replacing an existing file, or not uploading', () => {
    expect(deferPublishUntilFile('borrador', undefined, true)).toBe(false)
    expect(deferPublishUntilFile('publicado', 'rec-1/file-a', true)).toBe(false)
    expect(deferPublishUntilFile('publicado', undefined, false)).toBe(false)
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

  it('accepts in-app rutas and omits empty ruta', () => {
    expect(parseRecursoBody({ ...base, ruta: '/mapas/matricula' })?.ruta).toBe(
      '/mapas/matricula',
    )
    expect(parseRecursoBody({ ...base, ruta: '/tablero' })?.ruta).toBe(
      '/tablero',
    )
    expect(
      parseRecursoBody({ ...base, ruta: '/mapa_interactivo' })?.ruta,
    ).toBe('/mapa_interactivo')
    expect(
      parseRecursoBody({
        ...base,
        ruta: '/recursos/reporte-sobreedad-inicial.pdf',
      })?.ruta,
    ).toBe('/recursos/reporte-sobreedad-inicial.pdf')
    expect(parseRecursoBody({ ...base, ruta: '' })?.ruta).toBeUndefined()
    expect(parseRecursoBody({ ...base, ruta: '  ' })?.ruta).toBeUndefined()
  })

  it('rejects protocol-relative, absolute, and off-allowlist rutas', () => {
    expect(parseRecursoBody({ ...base, ruta: '//evil.example' })).toBeNull()
    expect(
      parseRecursoBody({ ...base, ruta: 'https://evil.example/x' }),
    ).toBeNull()
    expect(parseRecursoBody({ ...base, ruta: '/admin' })).toBeNull()
    expect(parseRecursoBody({ ...base, ruta: '/login' })).toBeNull()
    expect(parseRecursoBody({ ...base, ruta: '/api/recursos' })).toBeNull()
  })

  it('rejects mime retags outside VIEWER_MIMES/DOWNLOAD_MIMES', () => {
    expect(
      parseRecursoBody({ ...base, mime: 'image/svg+xml' }),
    ).toBeNull()
    expect(
      parseRecursoBody({ ...base, mime: 'application/javascript' }),
    ).toBeNull()
    expect(parseRecursoBody({ ...base, mime: 'text/html' })?.mime).toBe(
      'text/html',
    )
  })
})

describe('isAllowedRuta', () => {
  it('requires a single slash and an in-app prefix', () => {
    expect(isAllowedRuta('/mapas/matricula')).toBe(true)
    expect(isAllowedRuta('/tablero')).toBe(true)
    expect(isAllowedRuta('/tablero/index.html')).toBe(true)
    expect(isAllowedRuta('/mapa_sobreedad')).toBe(true)
    expect(isAllowedRuta('/mapa_notas/foo')).toBe(true)
    expect(isAllowedRuta('/recursos/a.pdf')).toBe(true)
    expect(isAllowedRuta('//evil.example')).toBe(false)
    expect(isAllowedRuta('/mapas/')).toBe(false)
    expect(isAllowedRuta('/recursos/')).toBe(false)
    expect(isAllowedRuta('/tableroevil')).toBe(false)
  })
})

describe('publicadoXorInvalid', () => {
  it('rejects publicado with neither ruta nor file, or both', () => {
    expect(publicadoXorInvalid('publicado', undefined, undefined)).toBe(true)
    expect(publicadoXorInvalid('publicado', '', '')).toBe(true)
    expect(publicadoXorInvalid('publicado', '/tablero', 'rec/file')).toBe(true)
  })

  it('accepts publicado with exactly one of ruta or storageKey', () => {
    expect(publicadoXorInvalid('publicado', '/tablero', undefined)).toBe(false)
    expect(publicadoXorInvalid('publicado', undefined, 'rec/file')).toBe(false)
  })

  it('does not apply XOR to borrador', () => {
    expect(publicadoXorInvalid('borrador', undefined, undefined)).toBe(false)
    expect(publicadoXorInvalid('borrador', '/tablero', undefined)).toBe(false)
  })
})
