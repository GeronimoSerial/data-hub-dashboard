import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { gatedStaticPath, legacyRecursoRedirect } from '@/lib/nav'
import { publicOrigin } from '@/lib/public-origin'
import { esHostLinks } from '@/miniapps/links/lib/host'

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-hub-request-url', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  if (esHostLinks(request.headers.get('host') ?? request.nextUrl.host)) {
    const path = request.nextUrl.pathname
    if (path === '/') return NextResponse.redirect(new URL('/cadm', 'https://links.sistemas.mec.gob.ar'), 307)
    if (path.startsWith('/_next/') || path.startsWith('/marca/') || path === '/favicon.ico') {
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
    if (path === '/cadm' || path === '/cadm/' || path === '/cadm/admin' || path === '/cadm/admin/' || path.startsWith('/cadm/api/')) {
      const destination = request.nextUrl.clone()
      destination.pathname = `/links${path.slice('/cadm'.length)}`
      return NextResponse.rewrite(destination, { request: { headers: requestHeaders } })
    }
    return new NextResponse('Not Found', { status: 404 })
  }
  const legacy = legacyRecursoRedirect(request.nextUrl.pathname)
  if (legacy) {
    // Absolute Location on the public origin: Next rejects a relative one, and
    // request.url is the internal bind address behind the reverse proxy.
    const destination = new URL(legacy, publicOrigin(request))
    destination.search = request.nextUrl.search
    return NextResponse.redirect(destination, 307)
  }
  const gated = gatedStaticPath(request.nextUrl.pathname)
  if (!gated) return NextResponse.next({ request: { headers: requestHeaders } })
  const dest = request.nextUrl.clone()
  dest.pathname = `/api/gate/${gated.replace(/^\//, '')}`
  return NextResponse.rewrite(dest, { request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/:path*'],
}
