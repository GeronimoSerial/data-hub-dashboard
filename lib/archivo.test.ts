import { describe, expect, it } from 'vitest'
import type { RecursoAccess, SessionUser } from './acl'
import {
  archivoGate,
  archivoResponseHeaders,
  archivoStorageKey,
} from './archivo'

const pub: RecursoAccess = {
  estado: 'publicado',
  audienciaNivelIds: [],
  audienciaUserIds: [],
}

const consulta = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 'u1',
  role: 'consulta',
  banned: false,
  nivelIds: [],
  ...over,
})

describe('archivoGate', () => {
  it('returns 401 for anonymous even when the recurso is public', () => {
    expect(archivoGate(null, pub, true)).toBe(401)
  })

  it('returns 200 for logged-in consulta when audience is empty', () => {
    expect(archivoGate(consulta(), pub, true)).toBe(200)
  })

  it('returns 403 when consulta cannot open', () => {
    expect(
      archivoGate(consulta(), { ...pub, estado: 'borrador' }, true),
    ).toBe(403)
  })

  it('returns 404 when the recurso is missing or has no blob', () => {
    expect(archivoGate(consulta(), null, true)).toBe(404)
    expect(archivoGate(consulta(), pub, false)).toBe(404)
  })
})

describe('archivoStorageKey', () => {
  it('joins recursoId and fileId with a slash', () => {
    expect(archivoStorageKey('rec-1', 'file-uuid')).toBe('rec-1/file-uuid')
  })
})

describe('archivoResponseHeaders', () => {
  const pdf = {
    mime: 'application/pdf',
    nombreOriginal: 'informe.pdf',
  }

  it('sets nosniff, private cache, frame-ancestors, and mime', () => {
    const h = archivoResponseHeaders({ ...pdf, download: false })
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Cache-Control']).toBe('private, no-store')
    expect(h['Content-Security-Policy']).toBe("frame-ancestors 'self'")
    expect(h['Content-Type']).toBe('application/pdf')
  })

  it('uses inline disposition for viewer mimes without download=1', () => {
    const h = archivoResponseHeaders({ ...pdf, download: false })
    expect(h['Content-Disposition']).toBe(
      'inline; filename="informe.pdf"',
    )
  })

  it('uses attachment when download=1', () => {
    const h = archivoResponseHeaders({ ...pdf, download: true })
    expect(h['Content-Disposition']).toBe(
      'attachment; filename="informe.pdf"',
    )
  })

  it('uses attachment for DOWNLOAD_MIMES even without download=1', () => {
    const h = archivoResponseHeaders({
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      nombreOriginal: 'datos.xlsx',
      download: false,
    })
    expect(h['Content-Disposition']).toBe(
      'attachment; filename="datos.xlsx"',
    )
  })
})
