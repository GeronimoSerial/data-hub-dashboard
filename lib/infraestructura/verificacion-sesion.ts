import { createHmac, timingSafeEqual } from 'node:crypto'

// Sesión acotada por CUE, canjeada de la credencial de verificación (batch E1
// del protocolo ENOS). Un director que entra por el enlace de "Hay afectación"
// puede usar el formulario de parte SIN la contraseña compartida, pero SÓLO
// para el CUE exacto de la verificación de la que canjeó, y sólo mientras esta
// sesión no venció.
//
// Por qué una cookie distinta y no reusar la de acceso público: la de acceso
// público prueba "alguien conoce la contraseña compartida" y sirve para todo
// el recorrido; ésta prueba "el servidor emitió esta sesión para ESTE CUE tras
// canjear un token válido". Propósito, payload y cookie distintos. Comparten la
// env var como secreto HMAC porque es un secreto de servidor ya configurado,
// no una credencial de usuario; firmar dos payloads distintos con la misma
// clave no mezcla las sesiones (una firma no es válida para el otro formato).
//
// Alcance: nunca lista ni abre partes de otro CUE, nunca otorga rol admin, ni
// se amplía a ningún otro alcance. La comparación de CUE es parte de la
// validación, no un filtro posterior.

export const NOMBRE_COOKIE_SESION_VERIFICACION = 'verificacion_sesion'
const DURACION_SESION_MS = 1000 * 60 * 30 // 30 minutos

// Duplicada a propósito desde acceso-publico.ts, que la mantiene privada: ese
// archivo se declara la única costura con el mundo público y no exporta sus
// helpers. Importarla acá acoplaría este módulo a su implementación interna;
// mismo criterio que ya usa acceso-parte.ts para no acoplarse.
function obtenerSecreto(): string {
  const secreto = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  if (!secreto) {
    throw new Error('PROBLEMATICAS_ACCESO_PASSWORD no está configurada')
  }
  return secreto
}

function firmar(payload: string, secreto: string): string {
  return createHmac('sha256', secreto).update(payload).digest('base64url')
}

// Comparación en tiempo constante. Nunca uses === contra la firma: filtraría
// por timing dónde difieren.
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

// Token de sesión acotada: "verificacionId|cueAnexo|expiración.firma". Se usa
// `|` como separador porque ni verificacionId (uuid) ni cueAnexo (dígitos) lo
// contienen. La firma prueba que el servidor emitió esta sesión; el CUE dentro
// del payload es lo que acota el acceso.
export function crearSesionVerificacion(
  verificacionId: string,
  cueAnexo: string,
  ahora: Date = new Date(),
): { valorCookie: string; expiraEn: Date } {
  const expiraEn = new Date(ahora.getTime() + DURACION_SESION_MS)
  const payload = `${verificacionId}|${cueAnexo}|${expiraEn.getTime()}`
  const firma = firmar(payload, obtenerSecreto())
  return { valorCookie: `${payload}.${firma}`, expiraEn }
}

type SesionVerificada = { verificacionId: string; cueAnexo: string; expiraEnMs: number }

// Parseo + verificación de firma + expiración de la COOKIE (no de la
// verificación en la base: eso lo re-chequea el llamador contra la fila real,
// ver acceso-parte.ts). Devuelve null ante cualquier fallo de forma, firma o
// vencimiento — nunca lanza.
function verificarSesion(
  valorCookie: string | undefined | null,
  ahora: Date,
): SesionVerificada | null {
  if (!valorCookie) return null
  const separador = valorCookie.indexOf('.')
  if (separador < 0) return null
  const payload = valorCookie.slice(0, separador)
  const firma = valorCookie.slice(separador + 1)
  if (!payload || !firma) return null

  let secreto: string
  try {
    secreto = obtenerSecreto()
  } catch {
    return null
  }
  const firmaEsperada = firmar(payload, secreto)
  if (!iguales(firma, firmaEsperada)) return null

  const [verificacionId, cueAnexoDelToken, expiraEnMsStr] = payload.split('|')
  if (!verificacionId || !cueAnexoDelToken || !expiraEnMsStr) return null

  const expiraEnMs = Number(expiraEnMsStr)
  if (!Number.isFinite(expiraEnMs) || expiraEnMs <= ahora.getTime()) return null

  return { verificacionId, cueAnexo: cueAnexoDelToken, expiraEnMs }
}

export function sesionVerificacionValidaParaCue(
  valorCookie: string | undefined | null,
  cueAnexo: string,
  ahora: Date = new Date(),
): boolean {
  const sesion = verificarSesion(valorCookie, ahora)
  // El CUE pedido tiene que ser el de esta sesión: el acceso nunca se amplía.
  return sesion !== null && sesion.cueAnexo === cueAnexo
}

// Igual que sesionVerificacionValidaParaCue, pero devuelve el verificacionId
// de la sesión en vez de un booleano cuando la cookie es válida PARA ESE CUE
// (firma correcta, CUE coincide, cookie no vencida). Quien llame TODAVÍA debe
// re-chequear la fila de la verificación en la base (estado, revocación,
// vencimiento del token) antes de conceder acceso — esta función sólo prueba
// que la cookie en sí es auténtica y no vencida, no que la verificación siga
// habilitando escritura.
export function verificacionIdDeSesionValida(
  valorCookie: string | undefined | null,
  cueAnexo: string,
  ahora: Date = new Date(),
): string | null {
  const sesion = verificarSesion(valorCookie, ahora)
  if (!sesion || sesion.cueAnexo !== cueAnexo) return null
  return sesion.verificacionId
}

// Opciones para setear la cookie al canjear el token. secure sólo en
// producción para no romper el desarrollo local sobre HTTP.
export function opcionesCookieSesionVerificacion(expiraEn: Date) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    expires: expiraEn,
    path: '/',
  }
}

export function extraerCookieVerificacionSesion(
  cookieHeader: string | null | undefined,
): string | undefined {
  if (!cookieHeader) return undefined
  for (const parte of cookieHeader.split(';')) {
    const igual = parte.indexOf('=')
    if (igual < 0) continue
    const clave = parte.slice(0, igual).trim()
    if (clave === NOMBRE_COOKIE_SESION_VERIFICACION) {
      return decodeURIComponent(parte.slice(igual + 1).trim())
    }
  }
  return undefined
}
