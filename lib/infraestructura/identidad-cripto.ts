import { createCipheriv, randomBytes } from 'node:crypto'

// Primitivas de cifrado del alcance nominal, aisladas a propósito en un módulo
// sin dependencias más allá de node:crypto. Los scripts de mantenimiento
// (scripts/import-padron.mjs) cargan sólo esto: si el cifrado viviera junto a
// las consultas de identidad.ts, la cadena de imports arrastraría drizzle-orm y
// el resto del ORM, que no existen como paquetes resolubles dentro del bundle
// standalone de producción.
//
// El descifrado NO vive acá y no debe mudarse: es privado de identidad.ts por
// diseño (ver el comentario de descifrarIdentidad).

export const ALGORITMO = 'aes-256-gcm'
export const IV_BYTES = 12
export const AUTH_TAG_BYTES = 16

// La clave vive únicamente en la variable de entorno NOMINAL_ENCRYPTION_KEY,
// nunca en la base ni en el repositorio. Formato: 32 bytes en base64. Ver
// docs/rotacion-clave-nominal.md para el procedimiento de rotación.
export function obtenerClave(): Buffer {
  const raw = process.env.NOMINAL_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('NOMINAL_ENCRYPTION_KEY no está configurada')
  }
  const clave = Buffer.from(raw, 'base64')
  if (clave.length !== 32) {
    throw new Error(
      'NOMINAL_ENCRYPTION_KEY debe decodificar en base64 a exactamente 32 bytes (AES-256)',
    )
  }
  return clave
}

// Cifra nombre y apellido en un único payload autocontenido: iv || authTag ||
// ciphertext, todo en base64. Se puede llamar con una clave explícita (para
// el procedimiento de rotación, que recifra con la clave nueva sin tocar el
// resto del módulo) o usar la de entorno por defecto.
export function cifrarIdentidad(
  nombre: string,
  apellido: string,
  clave: Buffer = obtenerClave(),
): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITMO, clave, iv)
  const plano = JSON.stringify({ nombre, apellido })
  const cifrado = Buffer.concat([cipher.update(plano, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, cifrado]).toString('base64')
}
