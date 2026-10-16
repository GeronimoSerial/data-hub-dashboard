import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signMock, commandMock, headCommandMock, clientMock } = vi.hoisted(() => ({
  signMock: vi.fn(),
  commandMock: vi.fn(),
  headCommandMock: vi.fn(),
  clientMock: vi.fn(),
}))

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: clientMock,
  PutObjectCommand: commandMock,
  HeadObjectCommand: headCommandMock,
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: signMock }))

import {
  AUTHORIZATION_TTL_SECONDS,
  authorizeAttachments,
  clearAuthorizationCacheForTests,
  MAX_OPTIMIZED_BYTES,
  MAX_THUMBNAIL_BYTES,
  readObsConfig,
  validateAttachmentDeclarations,
} from './obs'

const movementId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const cueAnexo = '1801605-04'
const attachmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const declaration = { attachmentId, bytesOptimizado: 2048, bytesMiniatura: 512 }

function configureObs() {
  process.env.OBS_BUCKET = 'reportes-infraestructura'
  process.env.OBS_REGION = 'la-south-2'
  process.env.OBS_ENDPOINT = 'https://obs.la-south-2.myhuaweicloud.com'
  process.env.OBS_ACCESS_KEY_ID = 'test-access-key'
  process.env.OBS_SECRET_ACCESS_KEY = 'test-secret-key'
}

describe('OBS batch authorization', () => {
  beforeEach(() => {
    clearAuthorizationCacheForTests()
    configureObs()
    clientMock.mockImplementation(function MockClient(this: object) {
      Object.assign(this, { destroy: vi.fn(), send: vi.fn(async () => ({ ETag: '"abc123"', ContentLength: 1024, ContentType: 'image/jpeg' })) })
    })
    commandMock.mockImplementation(function MockPutObjectCommand(this: object, input: object) {
      Object.assign(this, input)
    })
    headCommandMock.mockImplementation(function MockHeadObjectCommand(this: object, input: object) {
      Object.assign(this, input)
    })
    signMock.mockReset().mockImplementation(async (_client: unknown, command: { Key: string }) => `https://obs.test/${command.Key}?signed`)
  })

  it('accepts only one to three unique UUID attachments within both byte limits', () => {
    expect(validateAttachmentDeclarations([declaration])).toBe(true)
    expect(validateAttachmentDeclarations(Array.from({ length: 3 }, (_, index) => ({
      ...declaration,
      attachmentId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`,
    })))).toBe(true)
    expect(validateAttachmentDeclarations([])).toBe(false)
    expect(validateAttachmentDeclarations([declaration, declaration])).toBe(false)
    expect(validateAttachmentDeclarations([{ ...declaration, bytesOptimizado: MAX_OPTIMIZED_BYTES + 1 }])).toBe(false)
    expect(validateAttachmentDeclarations([{ ...declaration, bytesMiniatura: MAX_THUMBNAIL_BYTES + 1 }])).toBe(false)
    expect(validateAttachmentDeclarations([{ ...declaration, attachmentId: '../other-key' }])).toBe(false)
  })

  it('addresses the bucket by virtual host, which Huawei OBS requires (path style is rejected)', async () => {
    await authorizeAttachments(movementId, cueAnexo, [declaration], 1_000)

    expect(clientMock).toHaveBeenCalledWith(expect.objectContaining({ forcePathStyle: false }))
  })

  it('requires all OBS settings and an HTTPS endpoint', () => {
    expect(readObsConfig()).toMatchObject({ bucket: 'reportes-infraestructura', region: 'la-south-2' })
    expect(() => readObsConfig({ ...process.env, OBS_ENDPOINT: 'http://obs.example.test' })).toThrow('HTTPS')
    expect(() => readObsConfig({ ...process.env, OBS_SECRET_ACCESS_KEY: '' })).toThrow('OBS_SECRET_ACCESS_KEY')
  })

  it('signs exact keys, JPEG content type, exact lengths, and a short expiry', async () => {
    const result = await authorizeAttachments(movementId, cueAnexo, [declaration], 1_000)

    expect(result[0]).toMatchObject({
      attachmentId,
      optimizada: {
        key: `reportes/${cueAnexo}/${movementId}/${attachmentId}/optimizada.jpg`,
        contentType: 'image/jpeg',
        contentLength: declaration.bytesOptimizado,
        expiresAt: new Date(1_000 + AUTHORIZATION_TTL_SECONDS * 1000).toISOString(),
      },
      miniatura: {
        key: `reportes/${cueAnexo}/${movementId}/${attachmentId}/miniatura.jpg`,
        contentType: 'image/jpeg',
        contentLength: declaration.bytesMiniatura,
      },
    })
    expect(signMock).toHaveBeenCalledTimes(2)
    expect(commandMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      Bucket: 'reportes-infraestructura',
      Key: `reportes/${cueAnexo}/${movementId}/${attachmentId}/optimizada.jpg`,
      ContentType: 'image/jpeg',
      ContentLength: declaration.bytesOptimizado,
    }))
    expect(signMock.mock.calls[0][2]).toEqual({ expiresIn: AUTHORIZATION_TTL_SECONDS })
  })

  it('reuses a still-valid pair and renews it after expiry', async () => {
    const first = await authorizeAttachments(movementId, cueAnexo, [declaration], 10_000)
    const reused = await authorizeAttachments(movementId, cueAnexo, [declaration], 20_000)
    expect(reused).toEqual(first)
    expect(signMock).toHaveBeenCalledTimes(2)

    await authorizeAttachments(movementId, cueAnexo, [declaration], 10_000 + AUTHORIZATION_TTL_SECONDS * 1000)
    expect(signMock).toHaveBeenCalledTimes(4)
  })

  it('does not cache an authorization for a different declared length', async () => {
    await authorizeAttachments(movementId, cueAnexo, [declaration])
    await authorizeAttachments(movementId, cueAnexo, [{ ...declaration, bytesOptimizado: declaration.bytesOptimizado + 1 }])
    expect(signMock).toHaveBeenCalledTimes(4)
  })

  it('reads ETag, size, and content type using metadata-only HEAD requests', async () => {
    const { headAttachmentObjects } = await import('./obs')
    const result = await headAttachmentObjects('reportes-infraestructura', {
      optimizada: 'reportes/movement/attachment/optimizada.jpg',
      miniatura: 'reportes/movement/attachment/miniatura.jpg',
    })
    expect(result).toEqual({
      optimizada: { etag: 'abc123', size: 1024, contentType: 'image/jpeg' },
      miniatura: { etag: 'abc123', size: 1024, contentType: 'image/jpeg' },
    })
    expect(headCommandMock).toHaveBeenCalledTimes(2)
  })
})
