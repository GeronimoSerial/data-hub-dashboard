import type { AlmacenClaveValor } from '../parte/envio-offline'
import { fetchReportesOfflineFeatures } from '../parte/feature-flags-client'

declare module '../parte/almacen-indexeddb' {
  interface AlmacenParte {
    /** Form context records may also carry the durable submission idempotency key. */
    guardarContexto(contexto: { draftId: string } & Record<string, unknown>): Promise<void>
    obtenerContexto<T = unknown>(draftId: string): Promise<(T & { idempotencyKey?: unknown }) | null>
  }
}

const VERSION = 1 as const
const PREFIX = 'parte:borrador-sync:v1:'
const INDEX_KEY = `${PREFIX}pending-drafts`
const ENDPOINT = '/api/problematicas/parte/borradores'

export interface LocalDraftSnapshot {
  draftId: string
  generation: number
  context: Record<string, unknown>
  currentStep: string
  completedSteps: string[]
  answers: Record<string, unknown>
}

export interface DraftConflict {
  serverRevision: number
  localSnapshot: LocalDraftSnapshot
  detectedAt: string
}

interface PersistedState {
  version: typeof VERSION
  draftId: string
  generation: number
  revision: number | null
  confirmedSnapshot: Omit<LocalDraftSnapshot, 'context' | 'generation'> | null
  pendingSnapshot: LocalDraftSnapshot | null
  conflict: DraftConflict | null
}

export type DraftSyncResult =
  | { status: 'synced'; revision: number }
  | { status: 'pending' }
  | { status: 'conflict'; serverRevision: number; localAnswers: Record<string, unknown> }
  | { status: 'closed'; serverState: string | null }
  | { status: 'validation'; fields: string[] }
  | { status: 'unauthorized' }
  | { status: 'error'; httpStatus: number | null }

export interface DraftSyncClientOptions {
  store: AlmacenClaveValor
  fetch?: (input: string, init?: RequestInit) => Promise<Response>
  isSyncEnabled?: () => Promise<boolean>
  now?: () => string
}

function keyForDraft(draftId: string): string {
  return `${PREFIX}${encodeURIComponent(draftId)}`
}

async function pendingDraftIds(store: AlmacenClaveValor): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse((await store.obtener(INDEX_KEY)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

async function rememberPendingDraft(store: AlmacenClaveValor, draftId: string): Promise<void> {
  const ids = await pendingDraftIds(store)
  if (!ids.includes(draftId)) await store.guardar(INDEX_KEY, JSON.stringify([...ids, draftId]))
}

async function forgetPendingDraft(store: AlmacenClaveValor, draftId: string): Promise<void> {
  const ids = await pendingDraftIds(store)
  await store.guardar(INDEX_KEY, JSON.stringify(ids.filter((id) => id !== draftId)))
}

function createState(draftId: string, generation: number): PersistedState {
  return {
    version: VERSION,
    draftId,
    generation,
    revision: null,
    confirmedSnapshot: null,
    pendingSnapshot: null,
    conflict: null,
  }
}

function readState(value: string | null, draftId: string, generation?: number): PersistedState {
  if (!value) return createState(draftId, generation ?? 0)
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object') throw new Error('Stored draft sync state is invalid')
  const state = parsed as Partial<PersistedState>
  if (state.version !== VERSION || state.draftId !== draftId || !Number.isInteger(state.generation) ||
      (state.revision !== null && (!Number.isInteger(state.revision) || (state.revision as number) < 0)) ||
      !('pendingSnapshot' in state) || !('conflict' in state)) {
    throw new Error('Stored draft sync state has an unsupported shape')
  }
  if (generation !== undefined && state.generation !== generation) return createState(draftId, generation)
  return state as PersistedState
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sameJson(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (isJsonObject(value)) {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    }
    return value
  }
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

function diff(base: Record<string, unknown>, actual: Record<string, unknown>): Record<string, unknown> {
  const changes: Record<string, unknown> = {}
  for (const key of Object.keys(base)) {
    if (!(key in actual)) changes[key] = null
  }
  for (const [key, value] of Object.entries(actual)) {
    if (!(key in base)) {
      changes[key] = value
    } else if (isJsonObject(value) && isJsonObject(base[key])) {
      const nested = diff(base[key] as Record<string, unknown>, value)
      if (Object.keys(nested).length) changes[key] = nested
    } else if (!sameJson(base[key], value)) {
      changes[key] = value
    }
  }
  return changes
}

function validateSnapshot(value: LocalDraftSnapshot): void {
  if (!value.draftId || !Number.isInteger(value.generation) || value.generation < 1 ||
      !value.currentStep || !Array.isArray(value.completedSteps) ||
      !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers) ||
      !value.context || typeof value.context !== 'object' || Array.isArray(value.context)) {
    throw new TypeError('Draft sync requires a complete local snapshot')
  }
}

export function createDraftSyncClient({
  store,
  fetch: fetchImpl = fetch,
  isSyncEnabled = async () => (await fetchReportesOfflineFeatures(fetchImpl)).borradoresSync,
  now = () => new Date().toISOString(),
}: DraftSyncClientOptions) {
  const queues = new Map<string, Promise<DraftSyncResult>>()

  async function saveAtStepBoundary(snapshot: LocalDraftSnapshot): Promise<DraftSyncResult> {
    validateSnapshot(snapshot)
    const stored = await store.obtener(keyForDraft(snapshot.draftId))
    const state = readState(stored, snapshot.draftId, snapshot.generation)
    state.pendingSnapshot = snapshot
    await rememberPendingDraft(store, snapshot.draftId)

    if (state.conflict) {
      state.conflict = { ...state.conflict, localSnapshot: snapshot }
      await store.guardar(keyForDraft(snapshot.draftId), JSON.stringify(state))
      await forgetPendingDraft(store, snapshot.draftId)
      return {
        status: 'conflict',
        serverRevision: state.conflict.serverRevision,
        localAnswers: snapshot.answers,
      }
    }

    await store.guardar(keyForDraft(snapshot.draftId), JSON.stringify(state))

    if (!await isSyncEnabled()) return { status: 'pending' }

    let response: Response
    try {
      response = await fetchImpl(state.revision === null ? ENDPOINT : `${ENDPOINT}/${encodeURIComponent(snapshot.draftId)}`, {
        method: state.revision === null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.revision === null
          ? {
              version: VERSION,
              draftId: snapshot.draftId,
              generacion: snapshot.generation,
              contexto: snapshot.context,
              paso: snapshot.currentStep,
              respuestas: { ...snapshot.answers, pasosCompletados: snapshot.completedSteps },
              actividadEn: now(),
            }
          : {
              version: VERSION,
              baseRevision: state.revision,
              paso: snapshot.currentStep,
              pasosCompletados: snapshot.completedSteps,
              respuestas: diff(state.confirmedSnapshot?.answers ?? {}, snapshot.answers),
              actividadEn: now(),
            }),
      })
    } catch {
      return { status: 'pending' }
    }

    let body: Record<string, unknown> = {}
    try {
      body = asRecord(await response.json())
    } catch {
      body = {}
    }

    if (response.status === 409 && body.code === 'conflicto' && Number.isInteger(body.revisionServidor)) {
      const serverRevision = body.revisionServidor as number
      state.conflict = { serverRevision, localSnapshot: snapshot, detectedAt: now() }
      await store.guardar(keyForDraft(snapshot.draftId), JSON.stringify(state))
      await forgetPendingDraft(store, snapshot.draftId)
      return { status: 'conflict', serverRevision, localAnswers: snapshot.answers }
    }

    if (response.status === 410) {
      state.pendingSnapshot = null
      await store.guardar(keyForDraft(snapshot.draftId), JSON.stringify(state))
      await forgetPendingDraft(store, snapshot.draftId)
      return { status: 'closed', serverState: typeof body.estado === 'string' ? body.estado : null }
    }

    if (response.status === 422) {
      await forgetPendingDraft(store, snapshot.draftId)
      return { status: 'validation', fields: Array.isArray(body.campos) ? body.campos.filter((field): field is string => typeof field === 'string') : [] }
    }

    if (response.status === 401 || response.status === 403) return { status: 'unauthorized' }
    if (!response.ok) return { status: 'error', httpStatus: response.status }

    const revision = body.revision
    if (!Number.isInteger(revision) || (revision as number) < 0) return { status: 'error', httpStatus: response.status }

    state.revision = revision as number
    state.confirmedSnapshot = {
      draftId: snapshot.draftId,
      currentStep: snapshot.currentStep,
      completedSteps: [...snapshot.completedSteps],
      answers: snapshot.answers,
    }
    state.pendingSnapshot = null
    await store.guardar(keyForDraft(snapshot.draftId), JSON.stringify(state))
    await forgetPendingDraft(store, snapshot.draftId)
    return { status: 'synced', revision: state.revision }
  }

  function synchronize(snapshot: LocalDraftSnapshot): Promise<DraftSyncResult> {
    const prior = queues.get(snapshot.draftId) ?? Promise.resolve({ status: 'pending' } as DraftSyncResult)
    const current = prior.catch(() => ({ status: 'pending' } as DraftSyncResult))
      .then(() => saveAtStepBoundary(snapshot))
    queues.set(snapshot.draftId, current)
    void current.finally(() => {
      if (queues.get(snapshot.draftId) === current) queues.delete(snapshot.draftId)
    }).catch(() => undefined)
    return current
  }

  async function flushPending(draftId: string): Promise<DraftSyncResult> {
    const raw = await store.obtener(keyForDraft(draftId))
    if (!raw) return { status: 'pending' }
    const state = readState(raw, draftId)
    if (state.conflict) {
      return {
        status: 'conflict',
        serverRevision: state.conflict.serverRevision,
        localAnswers: state.conflict.localSnapshot.answers,
      }
    }
    if (!state.pendingSnapshot) {
      return state.revision === null ? { status: 'pending' } : { status: 'synced', revision: state.revision }
    }
    return synchronize(state.pendingSnapshot)
  }

  async function flushAllPending(excludedDraftIds: string[] = []): Promise<Array<{ draftId: string; result: DraftSyncResult }>> {
    const ids = await pendingDraftIds(store)
    const excluded = new Set(excludedDraftIds)
    const results: Array<{ draftId: string; result: DraftSyncResult }> = []
    // Each successful flush updates the shared pending ID index. Keep these
    // read-modify-write operations ordered so concurrent removals cannot
    // restore an already accepted draft in the index.
    for (const draftId of ids) {
      if (excluded.has(draftId)) continue
      results.push({ draftId, result: await flushPending(draftId) })
    }
    return results
  }

  async function getConflict(draftId: string): Promise<DraftConflict | null> {
    const raw = await store.obtener(keyForDraft(draftId))
    if (!raw) return null
    return readState(raw, draftId).conflict
  }

  async function prepareConflictResolution(
    draftId: string,
    generation: number,
    serverRevision: number,
    resolvedSnapshot: LocalDraftSnapshot,
  ): Promise<void> {
    validateSnapshot(resolvedSnapshot)
    if (resolvedSnapshot.draftId !== draftId || resolvedSnapshot.generation !== generation ||
        !Number.isInteger(serverRevision) || serverRevision < 0) {
      throw new TypeError('Conflict resolution must match the draft and server revision')
    }
    const raw = await store.obtener(keyForDraft(draftId))
    const state = readState(raw, draftId, generation)
    if (!state.conflict || state.conflict.serverRevision !== serverRevision) {
      throw new Error('The draft does not have the specified unresolved conflict')
    }
    state.revision = serverRevision
    state.conflict = null
    state.pendingSnapshot = resolvedSnapshot
    await store.guardar(keyForDraft(draftId), JSON.stringify(state))
    await rememberPendingDraft(store, draftId)
  }

  return {
    completeStep: synchronize,
    abandonStep: synchronize,
    flushPending,
    flushAllPending,
    getConflict,
    prepareConflictResolution,
  }
}
