import { describe, expect, it } from 'vitest'
import type { RecursoAccess, SessionUser } from './acl'
import {
  archivoCanServe,
  archivoGate,
  archivoResponseHeaders,
  archivoStorageKey,
  storedKeyToUnlink,
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

describe('storedKeyToUnlink', () => {
  it('unlinks the existing blob when the PUT clears storageKey', () => {
    expect(storedKeyToUnlink(undefined, 'rec-1/file-a')).toBe('rec-1/file-a')
    expect(storedKeyToUnlink('', 'rec-1/file-a')).toBe('rec-1/file-a')
    expect(storedKeyToUnlink('  ', 'rec-1/file-a')).toBe('rec-1/file-a')
  })

  it('unlinks even when ruta is empty (borrador switching off Archivo)', () => {
    expect(storedKeyToUnlink(undefined, 'rec-1/file-a')).toBe('rec-1/file-a')
  })

  it('does not unlink when the incoming storageKey is kept', () => {
    expect(storedKeyToUnlink('rec-1/file-a', 'rec-1/file-a')).toBeNull()
    expect(storedKeyToUnlink('rec-1/file-b', 'rec-1/file-a')).toBeNull()
  })

  it('is a no-op when there was no blob', () => {
    expect(storedKeyToUnlink(undefined, null)).toBeNull()
    expect(storedKeyToUnlink(undefined, undefined)).toBeNull()
  })
})

describe('archivoCanServe', () => {
  it('allows viewer and download mimes', () => {
    expect(archivoCanServe('text/html')).toBe(true)
    expect(archivoCanServe('application/pdf')).toBe(true)
    expect(archivoCanServe('image/png')).toBe(true)
    expect(
      archivoCanServe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe(true)
  })

  it('refuses svg, empty, and attacker-retag mimes', () => {
    expect(archivoCanServe('image/svg+xml')).toBe(false)
    expect(archivoCanServe('text/html; charset=utf-8')).toBe(false)
    expect(archivoCanServe('application/octet-stream')).toBe(false)
    expect(archivoCanServe('application/javascript')).toBe(false)
    expect(archivoCanServe(null)).toBe(false)
    expect(archivoCanServe(undefined)).toBe(false)
    expect(archivoCanServe('')).toBe(false)
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

  it('keeps the previous CSP for HTML that is not the tablero seed', () => {
    const h = archivoResponseHeaders({
      mime: 'text/html',
      nombreOriginal: 'nota.html',
      download: false,
    })
    expect(h['Content-Type']).toBe('text/html')
    expect(h['Content-Disposition']).toMatch(/^inline;/)
    const csp = h['Content-Security-Policy']
    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).toBe("frame-ancestors 'self'; sandbox allow-scripts allow-forms")
    expect(csp).not.toContain('allow-same-origin')
  })

  it('opts the tablero seed into downloads explicitly', () => {
    const h = archivoResponseHeaders({
      mime: 'text/html',
      nombreOriginal: 'tablero.html',
      download: false,
      allowDownloads: true,
    })
    expect(h['Content-Security-Policy']).toBe(
      "frame-ancestors 'self'; sandbox allow-scripts allow-forms allow-downloads",
    )
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
