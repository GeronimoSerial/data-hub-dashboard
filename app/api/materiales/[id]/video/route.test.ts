import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { materialesPublicados } from '@/lib/materiales'

const dir = vi.hoisted(() => ({ value: '' }))
vi.mock('@/lib/data-dir', () => ({ getDataDir: () => dir.value }))
import { GET } from './route'

const video = materialesPublicados.find(m => m.tipo === 'video')!
const pedir = (id: string, range?: string) => GET(
  new Request(`http://localhost/api/materiales/${id}/video`, { headers: range ? { Range: range } : {} }),
  { params: Promise.resolve({ id }) },
)

beforeAll(() => {
  dir.value = mkdtempSync(path.join(os.tmpdir(), 'materiales-video-'))
  mkdirSync(path.join(dir.value, 'materiales'))
  writeFileSync(path.join(dir.value, 'materiales', video.archivo), '0123456789')
})
afterAll(() => rmSync(dir.value, { recursive: true, force: true }))

describe('reproducción del video de materiales', () => {
  it('solo sirve ids de video del catálogo', async () => {
    expect((await pedir('manual-1')).status).toBe(404)
    expect((await pedir('../x')).status).toBe(404)
  })
  it('entrega el archivo completo y anuncia soporte de rangos', async () => {
    const r = await pedir(video.id)
    expect(r.status).toBe(200)
    expect(r.headers.get('Accept-Ranges')).toBe('bytes')
    expect(r.headers.get('Content-Type')).toBe('video/mp4')
    expect(await r.text()).toBe('0123456789')
  })
  it('responde rangos parciales y rechaza los inválidos', async () => {
    const r = await pedir(video.id, 'bytes=2-5')
    expect(r.status).toBe(206)
    expect(r.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(await r.text()).toBe('2345')
    expect((await pedir(video.id, 'bytes=-3')).headers.get('Content-Range')).toBe('bytes 7-9/10')
    expect((await pedir(video.id, 'bytes=50-')).status).toBe(416)
  })
})
