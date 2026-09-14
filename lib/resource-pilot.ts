export const TABLERO_SEED_ID = 'r2'
export const TABLERO_SEED_STORAGE_KEY = 'r2/seed'

export function isTableroSeed(
  recursoId: string,
  storageKey: string | null | undefined,
  mime: string | null | undefined,
) {
  return recursoId === TABLERO_SEED_ID && storageKey === TABLERO_SEED_STORAGE_KEY && mime === 'text/html'
}
