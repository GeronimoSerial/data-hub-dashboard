import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, isAllowedServedMime, isAllowedUpload } from './upload'

describe('isAllowedUpload', () => {
  it('accepts pdf under 50MB', () => {
    const r = isAllowedUpload({
      type: 'application/pdf',
      size: 1024,
      name: 'a.pdf',
    })
    expect(r).toEqual({ ok: true, mime: 'application/pdf' })
  })

  it('maps .html name to text/html when type is empty', () => {
    const r = isAllowedUpload({ type: '', size: 10, name: 't.html' })
    expect(r).toEqual({ ok: true, mime: 'text/html' })
  })

  it('rejects svg', () => {
    const r = isAllowedUpload({ type: 'image/svg+xml', size: 10, name: 'x.svg' })
    expect(r.ok).toBe(false)
  })

  it('rejects over 50MB', () => {
    const r = isAllowedUpload({
      type: 'application/pdf',
      size: MAX_UPLOAD_BYTES + 1,
      name: 'a.pdf',
    })
    expect(r.ok).toBe(false)
  })

  it('accepts xlsx as download mime', () => {
    const r = isAllowedUpload({
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 100,
      name: 'a.xlsx',
    })
    expect(r.ok).toBe(true)
  })
})

describe('isAllowedServedMime', () => {
  it('allowlists viewer and download types only', () => {
    expect(isAllowedServedMime('text/html')).toBe(true)
    expect(isAllowedServedMime('application/pdf')).toBe(true)
    expect(isAllowedServedMime('image/png')).toBe(true)
    expect(isAllowedServedMime('image/jpeg')).toBe(true)
    expect(isAllowedServedMime('image/webp')).toBe(true)
    expect(isAllowedServedMime('image/gif')).toBe(true)
    expect(
      isAllowedServedMime(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true)
  })

  it('rejects svg and types a PUT could use to retag a blob', () => {
    expect(isAllowedServedMime('image/svg+xml')).toBe(false)
    expect(isAllowedServedMime('text/html; charset=utf-8')).toBe(false)
    expect(isAllowedServedMime('application/javascript')).toBe(false)
    expect(isAllowedServedMime('text/javascript')).toBe(false)
    expect(isAllowedServedMime('application/octet-stream')).toBe(false)
  })
})
