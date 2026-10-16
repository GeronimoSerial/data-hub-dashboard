import { createDraftSyncClient, type DraftSyncResult } from '../borradores/client'
import { crearAlmacenIndexedDb } from './almacen-indexeddb'
import { pedirSyncParte } from './registrar-sync'

export interface ContextoReconexion {
  draftId: string
  cue: string
  escuela?: { cue?: string; cueAnexo?: string; nombre?: string; departamento?: string }
  formulario?: { escuela?: { cueAnexo?: string; nombre?: string; departamento?: string } }
}

export interface ConflictoContexto {
  draftId: string
  cue: string
  reason: 'school_missing' | 'school_changed'
  localSchool: string
  serverSchool: string | null
}

export interface ResultadoReconexion {
  contextConflicts: ConflictoContexto[]
  draftSync: Array<{ draftId: string; result: DraftSyncResult }>
  submissionSyncRequested: boolean
}

type FetchContext = (input: string, init?: RequestInit) => Promise<Response>

function normalize(value: string | undefined): string {
  return (value ?? '').trim().normalize('NFKC').toLocaleLowerCase('es')
}

export async function validateSavedContext(
  context: ContextoReconexion,
  fetchImpl: FetchContext = fetch,
): Promise<ConflictoContexto | null> {
  const localSchool = context.formulario?.escuela ?? context.escuela
  const local = localSchool as { cue?: string; cueAnexo?: string; nombre?: string; departamento?: string } | undefined
  const localCue = local?.cueAnexo ?? local?.cue ?? context.cue
  const localName = local?.nombre ?? ''
  const localDepartment = local?.departamento ?? ''
  let response: Response
  try {
    response = await fetchImpl(`/api/problematicas/contexto?cue=${encodeURIComponent(context.cue)}`, {
      cache: 'no-store',
    })
  } catch {
    return null
  }

  if (response.status === 404 || response.status === 400) {
    return {
      draftId: context.draftId,
      cue: context.cue,
      reason: 'school_missing',
      localSchool: localName,
      serverSchool: null,
    }
  }
  if (!response.ok) return null

  const body: unknown = await response.json().catch(() => null)
  if (!body || typeof body !== 'object') return null
  const school = (body as { escuela?: unknown }).escuela
  if (!school || typeof school !== 'object') return null
  const current = school as { cueAnexo?: unknown; nombre?: unknown; departamento?: unknown }
  const serverCue = typeof current.cueAnexo === 'string' ? current.cueAnexo : ''
  const serverName = typeof current.nombre === 'string' ? current.nombre : ''
  const serverDepartment = typeof current.departamento === 'string' ? current.departamento : ''
  if (normalize(localCue) !== normalize(serverCue) || normalize(localName) !== normalize(serverName) ||
      (localDepartment !== '' && normalize(localDepartment) !== normalize(serverDepartment))) {
    return {
      draftId: context.draftId,
      cue: context.cue,
      reason: 'school_changed',
      localSchool: localName,
      serverSchool: serverName || null,
    }
  }
  return null
}

export interface ReconnectCoordinatorOptions {
  fetch?: FetchContext
  flushDrafts: (excludedDraftIds: string[]) => Promise<Array<{ draftId: string; result: DraftSyncResult }>>
  triggerSubmissions: () => Promise<boolean>
}

export function createReconnectCoordinator({
  fetch: fetchImpl = fetch,
  flushDrafts,
  triggerSubmissions,
}: ReconnectCoordinatorOptions) {
  return async function reconnect(contexts: ContextoReconexion[]): Promise<ResultadoReconexion> {
    const checked = await Promise.all(contexts.map(async (context) =>
      validateSavedContext(context, fetchImpl)))
    const contextConflicts = checked.filter((conflict): conflict is ConflictoContexto => conflict !== null)
    const [draftSync, submissionSyncRequested] = await Promise.all([
      flushDrafts(contextConflicts.map(({ draftId }) => draftId)),
      triggerSubmissions(),
    ])
    return {
      contextConflicts,
      draftSync,
      submissionSyncRequested,
    }
  }
}

const draftSyncClient = createDraftSyncClient({ store: crearAlmacenIndexedDb() })
const reconnect = createReconnectCoordinator({
  flushDrafts: (excludedDraftIds) => draftSyncClient.flushAllPending(excludedDraftIds),
  triggerSubmissions: pedirSyncParte,
})

export function reconectarParte(contexts: ContextoReconexion[]): Promise<ResultadoReconexion> {
  return reconnect(contexts)
}
