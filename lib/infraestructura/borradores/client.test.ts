import { describe, expect, it, vi } from 'vitest'
import type { AlmacenClaveValor } from '../parte/envio-offline'
import { createDraftSyncClient, type LocalDraftSnapshot } from './client'

function createStore(): AlmacenClaveValor {
  const valores = new Map<string, string>()
  return {
    obtener: async (clave) => valores.get(clave) ?? null,
    guardar: async (clave, valor) => { valores.set(clave, valor) },
    eliminar: async (clave) => { valores.delete(clave) },
  }
}

function snapshot(overrides: Partial<LocalDraftSnapshot> = {}): LocalDraftSnapshot {
  return {
    draftId: 'draft-1',
    generation: 1,
    context: { draftId: 'draft-1', cue: '1234567-89', escuela: { cue: '1234567-89' }, flujo: 'inicial' },
    currentStep: 'servicios',
    completedSteps: ['inicio'],
    answers: { servicio: { agua: 'si' } },
    ...overrides,
  }
}

describe('createDraftSyncClient', () => {
  it('creates the server draft at a step boundary with the current local snapshot', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ version: 1, revision: 0 }, { status: 201 }))
    const client = createDraftSyncClient({ store: createStore(), fetch: fetcher, now: () => '2026-10-15T12:00:00.000Z' })

    const result = await client.completeStep(snapshot())

    expect(result).toEqual({ status: 'synced', revision: 0 })
    expect(fetcher).toHaveBeenCalledWith('/api/problematicas/parte/borradores', expect.objectContaining({ method: 'POST' }))
    const request = JSON.parse(fetcher.mock.calls[0][1]?.body as string)
    expect(request).toMatchObject({
      version: 1,
      draftId: 'draft-1',
      generacion: 1,
      paso: 'servicios',
      respuestas: { servicio: { agua: 'si' }, pasosCompletados: ['inicio'] },
    })
  })

  it('consolidates offline step edits into one latest snapshot on reconnect boundary', async () => {
    const store = createStore()
    const offline = vi.fn(async (_url: string, _init?: RequestInit) => { throw new TypeError('offline') })
    const clientOffline = createDraftSyncClient({ store, fetch: offline, now: () => '2026-10-15T12:00:00.000Z' })

    await clientOffline.completeStep(snapshot())
    await clientOffline.abandonStep(snapshot({
      currentStep: 'afectaciones',
      completedSteps: ['inicio', 'servicios'],
      answers: { servicio: { agua: 'no' }, afectaciones: ['alumnos'] },
    }))

    const online = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Response.json({ version: 1, revision: 0 }, { status: 201 })
      return Response.json({ revision: 1, sincronizadoEn: '2026-10-15T12:01:00.000Z' })
    })
    const clientOnline = createDraftSyncClient({ store, fetch: online, now: () => '2026-10-15T12:02:00.000Z' })
    await clientOnline.flushPending('draft-1')

    expect(online).toHaveBeenCalledTimes(1)
    expect(online).toHaveBeenCalledWith('/api/problematicas/parte/borradores', expect.objectContaining({ method: 'POST' }))
    const createBody = JSON.parse(online.mock.calls[0][1]?.body as string)
    expect(createBody.paso).toBe('afectaciones')
    expect(createBody.respuestas).toMatchObject({ servicio: { agua: 'no' }, afectaciones: ['alumnos'], pasosCompletados: ['inicio', 'servicios'] })
  })

  it('uses the last acknowledged revision and only sends the consolidated change set', async () => {
    const fetcher = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(Response.json({ version: 1, revision: 4 }, { status: 201 })))
      .mockResolvedValueOnce(Response.json({ version: 1, revision: 4 }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ revision: 5, sincronizadoEn: '2026-10-15T12:01:00.000Z' }))
      .mockResolvedValueOnce(Response.json({ revision: 6, sincronizadoEn: '2026-10-15T12:02:00.000Z' }))
    const client = createDraftSyncClient({ store: createStore(), fetch: fetcher, now: () => '2026-10-15T12:00:00.000Z' })

    await client.completeStep(snapshot())
    await client.completeStep(snapshot({ currentStep: 'afectaciones', answers: { cantidad: 2 } }))
    await client.abandonStep(snapshot({ currentStep: 'resumen', answers: { cantidad: 3 } }))

    const firstPut = JSON.parse(fetcher.mock.calls[1][1]?.body as string)
    const secondPut = JSON.parse(fetcher.mock.calls[2][1]?.body as string)
    expect(firstPut).toMatchObject({ version: 1, baseRevision: 4, paso: 'afectaciones', respuestas: { cantidad: 2 } })
    expect(secondPut).toMatchObject({ version: 1, baseRevision: 5, paso: 'resumen', respuestas: { cantidad: 3 } })
    expect(firstPut.respuestas).toEqual({ cantidad: 2 })
  })

  it('keeps local answers and persists an explicit conflict after 409 without retrying over remote state', async () => {
    const store = createStore()
    const fetcher = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(Response.json({ version: 1, revision: 2 }, { status: 201 })))
      .mockResolvedValueOnce(Response.json({ version: 1, revision: 2 }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ code: 'conflicto', revisionServidor: 7 }, { status: 409 }))
    const client = createDraftSyncClient({ store, fetch: fetcher, now: () => '2026-10-15T12:00:00.000Z' })

    await client.completeStep(snapshot())
    const local = snapshot({ currentStep: 'afectaciones', answers: { respuestaLocal: 'conservar' } })
    const result = await client.abandonStep(local)

    expect(result).toEqual({ status: 'conflict', serverRevision: 7, localAnswers: local.answers })
    expect(await client.getConflict('draft-1')).toMatchObject({ serverRevision: 7, localSnapshot: local })
    await client.completeStep(snapshot({ currentStep: 'resumen', answers: { respuestaLocal: 'actualizada' } }))
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(await client.getConflict('draft-1')).toMatchObject({ serverRevision: 7 })
  })

  it('flushes each persisted pending draft after reconnect and removes only accepted work from the index', async () => {
    const store = createStore()
    const offline = createDraftSyncClient({ store, fetch: async () => { throw new TypeError('offline') } })
    await offline.completeStep(snapshot())
    await offline.completeStep(snapshot({
      draftId: 'draft-2',
      context: { draftId: 'draft-2', cue: '9876543-21', escuela: { cue: '9876543-21' }, flujo: 'actualizacion' },
    }))

    const online = createDraftSyncClient({
      store,
      fetch: async () => Response.json({ revision: 0 }, { status: 201 }),
    })
    const result = await online.flushAllPending()

    expect(result).toEqual([
      { draftId: 'draft-1', result: { status: 'synced', revision: 0 } },
      { draftId: 'draft-2', result: { status: 'synced', revision: 0 } },
    ])
    expect(await online.flushAllPending()).toEqual([])
  })
})
