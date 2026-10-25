import { createHmac } from 'node:crypto'

const DNI_DIGITS_RE = /^\d{6,9}$/

/**
 * Fails fast when the DNI secret is not configured. Called by the importer
 * before reading any row so a missing secret never produces a partial cut.
 */
export function requireDniSecret(): string {
  const secret = process.env.MATRICULA_DNI_SECRET
  if (!secret) {
    throw new Error('MATRICULA_DNI_SECRET is not set: cannot compute DNI hashes')
  }
  return secret
}

/**
 * HMAC-SHA256 fingerprint of a DNI (digits only, 6 to 9 long), hex encoded.
 * The DNI space is small, so an unkeyed hash can be reversed by brute force;
 * the keyed hash keeps the plain number out of the database.
 *
 * MATRICULA_DNI_SECRET must never be rotated without re-importing every cut:
 * a new secret yields different hashes, so existing rows stop matching any DNI
 * typed in the search and the stored students become unsearchable.
 */
export function hashDni(dni: string): string {
  const secret = requireDniSecret()
  if (!DNI_DIGITS_RE.test(dni)) {
    throw new Error('hashDni expects digits only (6 to 9 characters)')
  }
  return createHmac('sha256', secret).update(dni, 'utf8').digest('hex')
}
