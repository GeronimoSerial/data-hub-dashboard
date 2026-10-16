import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signMock, commandMock, clientMock } = vi.hoisted(() => ({
  signMock: vi.fn(),
  commandMock: vi.fn(),
  clientMock: vi.fn(),
}))

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: clientMock,
  PutObjectCommand: commandMock,
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
    clientMock.mockImplementation(function MockClient(this: object) { Object.assign(this, { destroy: vi.fn() }) })
    commandMock.mockImplementation((input: unknown) => input)
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

  it('requires all OBS settings and an HTTPS endpoint', () => {
    expect(readObsConfig()).toMatchObject({ bucket: 'reportes-infraestructura', region: 'la-south-2' })
    expect(() => readObsConfig({ ...process.env, OBS_ENDPOINT: 'http://obs.example.test' })).toThrow('HTTPS')
    expect(() => readObsConfig({ ...process.env, OBS_SECRET_ACCESS_KEY: '' })).toThrow('OBS_SECRET_ACCESS_KEY')
  })

  it('signs exact keys, JPEG content type, exact lengths, and a short expiry', async () => {
    const result = await authorizeAttachments(movementId, [declaration], 1_000)

    expect(result[0]).toMatchObject({
      attachmentId,
      optimizada: {
        key: `reportes/${movementId}/${attachmentId}/optimizada.jpg`,
        contentType: 'image/jpeg',
        contentLength: declaration.bytesOptimizado,
        expiresAt: new Date(1_000 + AUTHORIZATION_TTL_SECONDS * 1000).toISOString(),
      },
      miniatura: {
        key: `reportes/${movementId}/${attachmentId}/miniatura.jpg`,
        contentType: 'image/jpeg',
        contentLength: declaration.bytesMiniatura,
      },
    })
    expect(signMock).toHaveBeenCalledTimes(2)
    expect(commandMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      Bucket: 'reportes-infraestructura',
      Key: `reportes/${movementId}/${attachmentId}/optimizada.jpg`,
      ContentType: 'image/jpeg',
      ContentLength: declaration.bytesOptimizado,
    }))
    expect(signMock.mock.calls[0][2]).toEqual({ expiresIn: AUTHORIZATION_TTL_SECONDS })
  })

  it('reuses a still-valid pair and renews it after expiry', async () => {
    const first = await authorizeAttachments(movementId, [declaration], 10_000)
    const reused = await authorizeAttachments(movementId, [declaration], 20_000)
    expect(reused).toEqual(first)
    expect(signMock).toHaveBeenCalledTimes(2)

    await authorizeAttachments(movementId, [declaration], 10_000 + AUTHORIZATION_TTL_SECONDS * 1000)
    expect(signMock).toHaveBeenCalledTimes(4)
  })

  it('does not cache an authorization for a different declared length', async () => {
    await authorizeAttachments(movementId, [declaration])
    await authorizeAttachments(movementId, [{ ...declaration, bytesOptimizado: declaration.bytesOptimizado + 1 }])
    expect(signMock).toHaveBeenCalledTimes(4)
  })
})
