import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { gatedStaticPath, legacyRecursoRedirect } from '@/lib/nav'

export function middleware(request: NextRequest) {
  const legacy = legacyRecursoRedirect(request.nextUrl.pathname)
  if (legacy) {
    // Relative Location: the internal request URL may not be the public origin
    // behind the reverse proxy.
    return new NextResponse(null, { status: 307, headers: { Location: legacy } })
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
