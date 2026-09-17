import { createHmac, timingSafeEqual } from 'node:crypto'

// PROVISORIO. El formulario público de problemáticas (y sus rutas API) no
// tenían ninguna guarda: era deliberado (ver el comentario que reemplazamos
// en app/api/problematicas/contexto/route.ts). El titular del dato pidió
// cerrarlo con una contraseña única mientras se diseña la autenticación
// definitiva por token (un enlace de un solo uso por escuela/CUE). Este
// módulo es la única costura entre ambos mundos: toda ruta y página pública
// consulta `tieneAccesoPublico` / `otorgarAccesoPublico` de acá y nada más.
// El día que llegue el token, se reescribe ESTE archivo (y sólo este) para
// que verifique el token en vez de la contraseña; los callers no cambian.
const NOMBRE_COOKIE = 'problematicas_acceso'
const DURACION_SESION_MS = 1000 * 60 * 60 * 12 // 12 horas

function obtenerPassword(): string {
  const password = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  if (!password) {
    throw new Error('PROBLEMATICAS_ACCESO_PASSWORD no está configurada')
  }
  return password
}

function firmar(payload: string, secreto: string): string {
  return createHmac('sha256', secreto).update(payload).digest('base64url')
}

// Comparación en tiempo constante. Nunca uses === contra la contraseña ni
// contra la firma de la cookie: filtraría por timing dónde difieren.
function iguales(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Igual comparamos algo del mismo largo que a, para no salir antes y no
    // filtrar por timing que las longitudes no coinciden.
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

// No distingue "no existe" de "incorrecta": ambas devuelven false. Si la
// variable de entorno no está configurada, el acceso queda cerrado (nunca
// se abre por accidente en un entorno mal configurado).
export function verificarPassword(passwordIngresada: string): boolean {
  let password: string
  try {
    password = obtenerPassword()
  } catch {
    return false
  }
  return iguales(passwordIngresada, password)
}

// Token de sesión: "expiración.firma(expiración)", firmado con HMAC-SHA256
// usando la misma contraseña como secreto. Nunca contiene la contraseña en
// texto plano ni permite reconstruirla.
export function crearTokenSesion(ahora: Date = new Date()): { token: string; expiraEn: Date } {
  const expiraEn = new Date(ahora.getTime() + DURACION_SESION_MS)
  const payload = String(expiraEn.getTime())
  const firma = firmar(payload, obtenerPassword())
  return { token: `${payload}.${firma}`, expiraEn }
}

export function tokenSesionValido(token: string | undefined | null, ahora: Date = new Date()): boolean {
  if (!token) return false
  const separador = token.indexOf('.')
  if (separador < 0) return false
  const payload = token.slice(0, separador)
  const firma = token.slice(separador + 1)
  if (!payload || !firma) return false

  let password: string
  try {
    password = obtenerPassword()
  } catch {
    return false
  }
  const firmaEsperada = firmar(payload, password)
  if (!iguales(firma, firmaEsperada)) return false

  const expiraEnMs = Number(payload)
  return Number.isFinite(expiraEnMs) && expiraEnMs > ahora.getTime()
}

function extraerCookie(cookieHeader: string | null | undefined, nombre: string): string | undefined {
  if (!cookieHeader) return undefined
  for (const parte of cookieHeader.split(';')) {
    const igual = parte.indexOf('=')
    if (igual < 0) continue
    const clave = parte.slice(0, igual).trim()
    if (clave === nombre) return decodeURIComponent(parte.slice(igual + 1).trim())
  }
  return undefined
}

// Único punto de verificación para las rutas API (Route Handlers), que
// reciben un Request estándar. Lee la cookie de sesión y valida su firma y
// vencimiento; nunca vuelve a tocar la contraseña del usuario.
export function tieneAccesoPublico(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie')
  return tokenSesionValido(extraerCookie(cookieHeader, NOMBRE_COOKIE))
}

// Para Server Components, que leen cookies a través de next/headers en vez
// de un Request. Recibe el valor ya extraído (cookies().get(NOMBRE_COOKIE)?.value).
export function tieneAccesoPublicoDesdeValorCookie(valor: string | undefined | null): boolean {
  return tokenSesionValido(valor)
}

// Opciones para setear la cookie de sesión al validar la contraseña. secure
// sólo en producción para no romper el desarrollo local sobre HTTP.
export function opcionesCookieSesion(expiraEn: Date) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    expires: expiraEn,
    path: '/',
  }
}

export { NOMBRE_COOKIE }
