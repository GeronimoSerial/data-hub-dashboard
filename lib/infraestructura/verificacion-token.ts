import { createHash, randomBytes } from 'node:crypto'

// Credencial de un solo uso del batch E1 del protocolo ENOS. Vive aislada en
// un módulo sin dependencias más allá de node:crypto: la consumen tanto rutas
// de Next como scripts de emisión, y no debe arrastrar el ORM ni el resto del
// grafo de imports.
//
// El principio es simple: SOLO el hash se persiste, nunca el token en claro.
// Quien emite ve el token una única vez (para mandarlo por el canal que
// corresponda) y la base guarda únicamente `tokenHash`. Si la base se filtra,
// el atacante obtiene hashes, no credenciales usables.

const BYTES_TOKEN = 16 // 128 bits de entropía: suficiente para una credencial de un solo uso.
const DIAS_VALIDEZ_POR_DEFECTO = 30
const MS_POR_DIA = 24 * 60 * 60 * 1000

// El token se codifica en base64url (alfabeto A-Z a-z 0-9 - _): sin '+', '/' ni
// relleno '=', así que viaja entero dentro de una URL sin escapar y sin romper
// los buscadores de query string.
export function generarToken(): { token: string; tokenHash: string } {
  const token = randomBytes(BYTES_TOKEN).toString('base64url')
  return { token, tokenHash: hashearToken(token) }
}

// Misma función de hash que usa generarToken internamente, expuesta para
// verificar un token recibido contra el `tokenHash` guardado en la base. La
// verificación real es un lookup por igualdad de hash en la DB: no se usa
// timingSafeEqual acá a propósito. Comparar un hash SHA-256 de un valor de
// alta entropía contra otro valor guardado no filtra información útil por
// timing — no hay un secreto de baja entropía que un atacante pueda ir
// adivinando byte a byte, y el hash ya está pensado para ser público en
// tránsito de verificación.
export function hashearToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// true si `ahora` ya alcanzó o pasó la expiración. El borde es inclusivo:
// justo en el instante de vencimiento la credencial ya no sirve.
export function tokenExpirado(tokenExpiraEn: string, ahora: Date = new Date()): boolean {
  return ahora.getTime() >= new Date(tokenExpiraEn).getTime()
}

// Vencimiento de la CREDENCIAL, independiente del vencimiento de SLA de la
// verificación (que vive en su propio módulo). Son relojes distintos: este
// dice hasta cuándo sirve el enlace para canjearse; el de SLA dice cuánto
// puede tardar la verificación una vez iniciada. No unificar acá.
export function calcularVencimientoToken(
  ahora: Date = new Date(),
  diasValidez: number = DIAS_VALIDEZ_POR_DEFECTO,
): string {
  return new Date(ahora.getTime() + diasValidez * MS_POR_DIA).toISOString()
}
