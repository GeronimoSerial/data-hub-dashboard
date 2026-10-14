// Edge-safe (no Node built-ins): middleware imports it.

function firstForwarded(value: string | null) {
  return value?.split(',')[0]?.trim() || ''
}

/** Public origin for redirects behind Coolify (request.url is often 0.0.0.0:3000). */
export function publicOrigin(request: Request) {
  const fromEnv = process.env.BETTER_AUTH_URL?.trim()
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin
    } catch {
      /* fall through */
    }
  }
  const forwardedHost = firstForwarded(request.headers.get('x-forwarded-host'))
  const forwardedProto = firstForwarded(request.headers.get('x-forwarded-proto'))
  if (forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`
  }
  const url = new URL(request.url)
  const host = firstForwarded(request.headers.get('host'))
  if (host && host !== '0.0.0.0' && !host.startsWith('0.0.0.0:')) {
    const proto = forwardedProto || (url.protocol === 'https:' ? 'https' : 'http')
    return `${proto}://${host}`
  }
  return url.origin
}
