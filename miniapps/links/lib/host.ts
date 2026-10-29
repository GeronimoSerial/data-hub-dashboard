export const LINKS_HOST = 'links.sistemas.mec.gob.ar'
export const LINKS_URL = `https://${LINKS_HOST}/cadm`
export type BasePath = '/cadm' | '/links'

export function esHostLinks(host: string | null) {
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host.trim())) return false
  return host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '') === LINKS_HOST
}

export function basePathPublico(host: string | null): BasePath {
  return esHostLinks(host) ? '/cadm' : '/links'
}
