import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { NextResponse } from 'next/server'
import { puedeAbrir } from '@/lib/acl'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { ensureSeeded } from '@/lib/db/seed'
import {
  gateContentType,
  gateLoginCallbackUrl,
  gateLookupRuta,
  publicAbsPath,
  publicOrigin,
} from '@/lib/gate-static'
import { getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ path: string[] }> }

function absoluteRedirect(request: Request, pathname: string) {
  return NextResponse.redirect(new URL(pathname, publicOrigin(request)))
}

async function resolveReadableFile(abs: string): Promise<string | null> {
  const st = await stat(abs).catch(() => null)
  if (st?.isFile()) return abs
  if (st?.isDirectory()) {
    const index = path.join(abs, 'index.html')
    const idx = await stat(index).catch(() => null)
    if (idx?.isFile()) return index
  }
  return null
}

export async function GET(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const { path: segments } = await ctx.params
  const requestPath = `/${segments.join('/')}`
  const ruta = gateLookupRuta(requestPath)
  const user = await getSessionUser()
  if (!user) {
    const login = new URL('/login', publicOrigin(request))
    login.searchParams.set(
      'callbackUrl',
      gateLoginCallbackUrl(ruta, new URL(request.url).search),
    )
    return NextResponse.redirect(login)
  }
  const found = await loadRecursoAccessByRuta(ruta)
  if (!found) {
    return new NextResponse(null, { status: 404 })
  }
  if (!puedeAbrir(user, found.access)) {
    return absoluteRedirect(request, `/forbidden?next=${encodeURIComponent(requestPath)}`)
  }

  const abs = publicAbsPath(requestPath)
  const file = abs ? await resolveReadableFile(abs) : null
  if (!file) {
    return new NextResponse(null, { status: 404 })
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>
  return new NextResponse(stream, {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Type': gateContentType(file),
    },
  })
}
