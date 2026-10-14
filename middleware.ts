import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { gatedStaticPath, legacyRecursoRedirect } from '@/lib/nav'
import { publicOrigin } from '@/lib/public-origin'

export function middleware(request: NextRequest) {
  const legacy = legacyRecursoRedirect(request.nextUrl.pathname)
  if (legacy) {
    // Absolute Location on the public origin: Next rejects a relative one, and
    // request.url is the internal bind address behind the reverse proxy.
    return NextResponse.redirect(new URL(legacy, publicOrigin(request)), 307)
  }
  const gated = gatedStaticPath(request.nextUrl.pathname)
  if (!gated) return NextResponse.next()
  const dest = request.nextUrl.clone()
  dest.pathname = `/api/gate/${gated.replace(/^\//, '')}`
  return NextResponse.rewrite(dest)
}

export const config = {
  matcher: [
    '/tablero',
    '/tablero/:path*',
    '/mapa_interactivo',
    '/mapa_interactivo/:path*',
    '/mapa_sobreedad',
    '/mapa_sobreedad/:path*',
    '/mapa_notas',
    '/mapa_notas/:path*',
    '/recursos/:file.pdf',
  ],
}
