import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { materialesPublicados } from '@/lib/materiales'

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(), sign: vi.fn(), destroy: vi.fn(), config: vi.fn(),
}))
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }))
vi.mock('@/lib/data-dir', () => ({ getDataDir: () => '/tmp/materiales-test' }))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { destroy = mocks.destroy },
  GetObjectCommand: class { input: unknown; constructor(input: unknown) { this.input = input } },
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.sign }))
vi.mock('@/lib/infraestructura/adjuntos/obs', () => ({
  readObsConfig: mocks.config, opcionesClienteObs: () => ({}),
}))
import { GET } from './route'

function descargar(id: string) {
  return GET(new Request(`http://localhost/api/materiales/${id}/descargar`), { params: Promise.resolve({ id }) })
}

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('MATERIALES_STORAGE', 'local') })
afterEach(() => vi.unstubAllEnvs())

describe('descargas públicas de materiales', () => {
  it('no permite seleccionar objetos arbitrarios del bucket ni rutas locales', async () => {
    expect((await descargar('../privado')).status).toBe(404)
    expect((await descargar('manual-2')).status).toBe(404)
    expect(mocks.readFile).not.toHaveBeenCalled()
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it('entrega el PDF local como adjunto', async () => {
    mocks.readFile.mockResolvedValue(Buffer.from('%PDF-fixture'))
    const response = await descargar('manual-1')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toContain('attachment')
    expect(await response.text()).toBe('%PDF-fixture')
  })
  it('firma solo el objeto del catálogo, con vencimiento y sin cachear la redirección', async () => {
    vi.stubEnv('MATERIALES_STORAGE', 's3')
    mocks.config.mockReturnValue({ bucket: 'bucket-test' })
    mocks.sign.mockResolvedValue('https://storage.example/signed')
    const response = await descargar('manual-1')
    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('https://storage.example/signed')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.sign.mock.calls[0][1].input).toMatchObject({
      Bucket: 'bucket-test', Key: materialesPublicados.find(m => m.id === 'manual-1')!.storageKey,
      ResponseContentDisposition: 'attachment; filename="manual-1.pdf"',
    })
    expect(mocks.sign.mock.calls[0][2]).toEqual({ expiresIn: 300 })
    expect(mocks.destroy).toHaveBeenCalled()
  })
  it('devuelve un error recuperable si el archivo falta', async () => {
    mocks.readFile.mockRejectedValue(new Error('not found'))
    const response = await descargar('manual-1')
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('60')
  })
})
