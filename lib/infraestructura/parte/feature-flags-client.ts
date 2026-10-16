import type { ReportesOfflineFeatures } from './feature-flags'

const CONFIG_URL = '/api/problematicas/parte/borradores/config'

export async function fetchReportesOfflineFeatures(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<ReportesOfflineFeatures> {
  try {
    const response = await fetchImpl(CONFIG_URL, { cache: 'no-store' })
    if (!response.ok) throw new Error('Offline report flags are unavailable.')
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object') throw new Error('Invalid offline report flags.')
    const value = body as Partial<ReportesOfflineFeatures>
    return {
      borradoresSync: value.borradoresSync === true,
      fotos: value.fotos === true,
      mapaBorradores: value.mapaBorradores === true,
    }
  } catch {
    return { borradoresSync: false, fotos: false, mapaBorradores: false }
  }
}
