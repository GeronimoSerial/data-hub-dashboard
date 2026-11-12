/** True for an absolute http(s) URL: an external link, never an app route. */
export function esRutaExterna(ruta: string): boolean {
  if (!/^https?:\/\//i.test(ruta)) return false
  try {
    const url = new URL(ruta)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
