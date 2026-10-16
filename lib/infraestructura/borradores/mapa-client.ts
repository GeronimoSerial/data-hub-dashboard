export interface DraftCursor {
  actividadEn: string
  draftId: string
}

export interface DraftMapItem {
  draftId: string
  cue: string
  flujo: string
  progreso: { pasoActual: string; pasosCompletados: string[] }
  actividadEn: string
  respuestas: Record<string, unknown>
}

export interface DraftPage {
  items: DraftMapItem[]
  nextCursor: DraftCursor | null
}

export interface DraftCount {
  cue: string
  count: number
}

export async function fetchDraftCounts(fetcher: typeof fetch = fetch): Promise<DraftCount[]> {
  const response = await fetcher('/api/infraestructura/borradores/conteos')
  if (!response.ok) throw new Error('Unable to load draft counts')
  const body = await response.json() as { items?: DraftCount[] }
  return Array.isArray(body.items) ? body.items : []
}

export async function fetchDraftPage(
  cue: string,
  cursor?: DraftCursor | null,
  fetcher: typeof fetch = fetch,
): Promise<DraftPage> {
  const params = new URLSearchParams({ limit: '20' })
  if (cursor) params.set('cursor', toBase64Url(JSON.stringify(cursor)))
  const response = await fetcher(`/api/infraestructura/borradores/${encodeURIComponent(cue)}?${params}`)
  if (!response.ok) throw new Error('Unable to load pending drafts')
  const body = await response.json() as Partial<DraftPage>
  return {
    items: Array.isArray(body.items) ? body.items : [],
    nextCursor: body.nextCursor ?? null,
  }
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
