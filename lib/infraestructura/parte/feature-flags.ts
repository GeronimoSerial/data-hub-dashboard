export interface ReportesOfflineFeatures {
  borradoresSync: boolean
  fotos: boolean
  mapaBorradores: boolean
}

const ES_TRUE = 'true'

export function getReportesOfflineFeatures(
  env: Record<string, string | undefined> = process.env,
): ReportesOfflineFeatures {
  return {
    borradoresSync: env.REPORTES_OFFLINE_BORRADORES_SYNC === ES_TRUE,
    fotos: env.REPORTES_OFFLINE_FOTOS === ES_TRUE,
    mapaBorradores: env.REPORTES_OFFLINE_MAPA_BORRADORES === ES_TRUE,
  }
}

export function reportesOfflineFlagDisabledResponse(): Response {
  return Response.json(
    { code: 'feature_disabled', error: 'This offline reports feature is currently disabled.' },
    { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
