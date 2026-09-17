import { NextResponse } from 'next/server'
import {
  NOMBRE_COOKIE,
  crearTokenSesion,
  opcionesCookieSesion,
  verificarPassword,
} from '@/lib/infraestructura/acceso-publico'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Ruta pública a propósito: es la que otorga la sesión de acceso al resto del
// formulario. El mensaje de error nunca distingue "no existe" de
// "incorrecta" porque acá sólo hay una contraseña, no cuentas.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const password = (body as { password?: unknown } | null)?.password
  if (typeof password !== 'string' || password.length === 0) {
    return Response.json({ error: 'Ingresá la contraseña' }, { status: 400 })
  }

  if (!verificarPassword(password)) {
    return Response.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }

  const { token, expiraEn } = crearTokenSesion()
  const respuesta = NextResponse.json({ ok: true }, { status: 200 })
  respuesta.cookies.set(NOMBRE_COOKIE, token, opcionesCookieSesion(expiraEn))
  return respuesta
}
