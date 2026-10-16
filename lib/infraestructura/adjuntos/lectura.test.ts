import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signedUrl } = vi.hoisted(() => ({ signedUrl: vi.fn() }))

vi.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: class GetObjectCommand {
    readonly input: unknown
    constructor(input: unknown) { this.input = input }
  },
  S3Client: class S3Client {
    readonly config: unknown
    constructor(config: unknown) { this.config = config }
    destroy() {}
  },
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: signedUrl }))
vi.mock('./obs', async (importOriginal) => ({
  opcionesClienteObs: (await importOriginal<typeof import('./obs')>()).opcionesClienteObs,
  readObsConfig: () => ({
    bucket: 'private-evidence',
    region: 'la-south-2',
    endpoint: 'https://obs.example',
    accessKeyId: 'access',
    secretAccessKey: 'secret',
  }),
}))

import { firmarLecturaAdjunto, READ_URL_TTL_SECONDS } from './lectura'

describe('firmarLecturaAdjunto', () => {
  beforeEach(() => signedUrl.mockReset().mockResolvedValue('https://obs.example/signed'))

  it('signs a short-lived GET for an exact controlled object key', async () => {
    const url = await firmarLecturaAdjunto('reportes/cue/movement/photo/miniatura.jpg')

    expect(url).toBe('https://obs.example/signed')
    expect(signedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ input: { Bucket: 'private-evidence', Key: 'reportes/cue/movement/photo/miniatura.jpg' } }),
      { expiresIn: READ_URL_TTL_SECONDS },
    )
    expect(READ_URL_TTL_SECONDS).toBe(300)
  })

  it('rejects keys outside the report prefix', async () => {
    await expect(firmarLecturaAdjunto('../private.jpg')).rejects.toThrow('Invalid attachment object key')
    expect(signedUrl).not.toHaveBeenCalled()
  })
})
