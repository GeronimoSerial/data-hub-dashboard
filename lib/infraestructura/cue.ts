export type CueIdentifier =
  | { kind: 'anexo'; base: string; anexo: string; value: string }
  | { kind: 'base'; base: string; value: string }

const CUE_ANEXO_RE = /^\d{7}-\d{2}$/
const CUE_BASE_RE = /^\d{7}$/

export function normalizeCue(raw: string): CueIdentifier | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (value === '') return null
  if (CUE_ANEXO_RE.test(value)) {
    const [base, anexo] = value.split('-')
    return { kind: 'anexo', base, anexo, value }
  }
  if (CUE_BASE_RE.test(value)) {
    return { kind: 'base', base: value, value }
  }
  return null
}

export function esMismoCueBase(a: CueIdentifier, b: CueIdentifier): boolean {
  return a.base === b.base
}
