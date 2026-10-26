// Column order of the Matriculados_2026_Estatales / _Privados sheets.
export const MATRICULA_COLUMNS = [
  'Departamento',
  'Localidad',
  'CUE',
  'Instituto',
  'Carrrera',
  'RM',
  'Carrera Tipo',
  'Carrera Estado',
  'APELLIDOS',
  'NOMBRES',
  'DNI',
] as const

export const COLUMN_INDEX = {
  department: 0,
  locality: 1,
  cue: 2,
  institute: 3,
  career: 4,
  rm: 5,
  type: 6,
  status: 7,
  surnames: 8,
  names: 9,
  dni: 10,
} as const

export const CAREER_STATUSES = ['ABIERTA', 'CERRADA'] as const

export const EXCLUSION_REASONS = {
  invalidCue: 'cue_invalido',
  emptyCareer: 'carrera_vacia',
  emptyType: 'tipo_vacio',
  typeIsStatus: 'tipo_es_estado',
  invalidStatus: 'estado_invalido',
  invalidDni: 'dni_invalido',
  emptySurnames: 'apellidos_vacios',
  emptyNames: 'nombres_vacios',
  duplicateStudent: 'alumno_duplicado_en_carrera',
} as const

export type Sector = 'estatal' | 'privado'

export type MatriculaRow = {
  cueAnexo: string
  institute: string
  career: string
  rm: string
  type: string
  status: string
  sector: Sector
  surnames: string
  names: string
  searchName: string
  dni: string
}

export type RowResult = { ok: true; row: MatriculaRow } | { ok: false; reason: string }

// Text of an exceljs cell: plain values, rich text, formula results, links.
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    if (Array.isArray(v.richText)) {
      return v.richText.map((t: { text?: string }) => t.text ?? '').join('').trim()
    }
    if ('result' in v) return cellText(v.result)
    if (typeof v.text === 'string') return v.text.trim()
  }
  return String(value).trim()
}

// DNI may come with dots or spaces ("12.345.678"). Numeric cells lose leading
// zeros, which cannot be recovered; the result is validated like any other.
export function normalizeDni(value: unknown): string | null {
  const digits = cellText(value).replace(/[.\s]/g, '')
  return /^\d{6,9}$/.test(digits) ? digits : null
}

// 9-digit CUE (7-digit base + 2-digit annex) to the app's 'NNNNNNN-NN' form
// (same shape that lib/infraestructura/cue.ts accepts as an anexo).
export function normalizeCueAnexo(value: unknown): string | null {
  const digits = cellText(value).replace(/[-\s]/g, '')
  if (!/^\d{9}$/.test(digits)) return null
  return `${digits.slice(0, 7)}-${digits.slice(7)}`
}

// Lowercase, accent-free, single-spaced: the base of the name search.
export function normalizeSearchName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function sectorFromSheetName(sheetName: string): Sector | null {
  if (/estatal/i.test(sheetName)) return 'estatal'
  if (/privad/i.test(sheetName)) return 'privado'
  return null
}

/**
 * Validates one raw row (cells in MATRICULA_COLUMNS order). Shifted rows fail
 * a rule: for example a surname in "Carrera Estado" is neither ABIERTA nor
 * CERRADA.
 */
export function validateRow(cells: readonly unknown[], sector: Sector): RowResult {
  const cueAnexo = normalizeCueAnexo(cells[COLUMN_INDEX.cue])
  if (cueAnexo === null) return { ok: false, reason: EXCLUSION_REASONS.invalidCue }

  const career = cellText(cells[COLUMN_INDEX.career])
  if (career === '') return { ok: false, reason: EXCLUSION_REASONS.emptyCareer }

  const type = cellText(cells[COLUMN_INDEX.type])
  if (type === '') return { ok: false, reason: EXCLUSION_REASONS.emptyType }
  if ((CAREER_STATUSES as readonly string[]).includes(type.toUpperCase())) {
    return { ok: false, reason: EXCLUSION_REASONS.typeIsStatus }
  }

  const status = cellText(cells[COLUMN_INDEX.status]).toUpperCase()
  if (!(CAREER_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, reason: EXCLUSION_REASONS.invalidStatus }
  }

  const dni = normalizeDni(cells[COLUMN_INDEX.dni])
  if (dni === null) return { ok: false, reason: EXCLUSION_REASONS.invalidDni }

  const surnames = cellText(cells[COLUMN_INDEX.surnames])
  if (surnames === '') return { ok: false, reason: EXCLUSION_REASONS.emptySurnames }
  const names = cellText(cells[COLUMN_INDEX.names])
  if (names === '') return { ok: false, reason: EXCLUSION_REASONS.emptyNames }

  return {
    ok: true,
    row: {
      cueAnexo,
      institute: cellText(cells[COLUMN_INDEX.institute]),
      career,
      rm: cellText(cells[COLUMN_INDEX.rm]),
      type,
      status,
      sector,
      surnames,
      names,
      searchName: normalizeSearchName(`${surnames} ${names}`),
      dni,
    },
  }
}
