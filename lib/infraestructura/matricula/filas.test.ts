import { describe, expect, it } from 'vitest'
import {
  EXCLUSION_REASONS,
  cellText,
  normalizeCueAnexo,
  normalizeDni,
  normalizeSearchName,
  sectorFromSheetName,
  validateRow,
} from './filas'

const buena = () => [
  'Capital',
  'Cordoba',
  '180176400',
  'Instituto Superior X',
  'Tecnicatura en Sistemas',
  '1234/20',
  'Tecnicatura',
  'ABIERTA',
  'PEREZ',
  'ANA MARIA',
  '30.123.456',
]

function conCelda(indice: number, valor: unknown) {
  const celdas = buena()
  celdas[indice] = valor as string
  return celdas
}

describe('validateRow', () => {
  it('acepta una fila válida y mapea CUE, DNI y búsqueda', () => {
    const r = validateRow(buena(), 'estatal')
    expect(r).toEqual({
      ok: true,
      row: {
        cueAnexo: '1801764-00',
        institute: 'Instituto Superior X',
        career: 'Tecnicatura en Sistemas',
        rm: '1234/20',
        type: 'Tecnicatura',
        status: 'ABIERTA',
        sector: 'estatal',
        surnames: 'PEREZ',
        names: 'ANA MARIA',
        searchName: 'perez ana maria',
        dni: '30123456',
      },
    })
  })

  it('excluye CUE inválido', () => {
    expect(validateRow(conCelda(2, '12345'), 'estatal')).toEqual({ ok: false, reason: EXCLUSION_REASONS.invalidCue })
  })

  it('excluye carrera vacía', () => {
    expect(validateRow(conCelda(4, ''), 'estatal')).toEqual({ ok: false, reason: EXCLUSION_REASONS.emptyCareer })
  })

  it('excluye tipo vacío y tipo que es un estado (columnas corridas)', () => {
    expect(validateRow(conCelda(6, ''), 'estatal')).toEqual({ ok: false, reason: EXCLUSION_REASONS.emptyType })
    expect(validateRow(conCelda(6, 'ABIERTA'), 'estatal')).toEqual({ ok: false, reason: EXCLUSION_REASONS.typeIsStatus })
  })

  it('excluye estado fuera de ABIERTA/CERRADA (apellido en Carrera Estado)', () => {
    const celdas = buena()
    celdas.splice(6, 2, 'Tecnicatura', 'PEREZ', 'ANA', '30123456')
    expect(validateRow(celdas, 'estatal')).toEqual({ ok: false, reason: EXCLUSION_REASONS.invalidStatus })
  })

  it('excluye DNI que no son 6 a 9 dígitos', () => {
    expect(validateRow(conCelda(10, '12A45678'), 'estatal')).toEqual({ ok: false, reason: EXCLUSION_REASONS.invalidDni })
    expect(validateRow(conCelda(10, '12345'), 'estatal')).toEqual({ ok: false, reason: EXCLUSION_REASONS.invalidDni })
  })

  it('excluye apellidos o nombres vacíos', () => {
    expect(validateRow(conCelda(8, ''), 'estatal')).toEqual({ ok: false, reason: EXCLUSION_REASONS.emptySurnames })
    expect(validateRow(conCelda(9, '   '), 'estatal')).toEqual({ ok: false, reason: EXCLUSION_REASONS.emptyNames })
  })

  it('acepta estado en minúsculas y lo guarda en mayúsculas', () => {
    const r = validateRow(conCelda(7, 'cerrada'), 'privado')
    expect(r.ok && r.row.status).toBe('CERRADA')
    expect(r.ok && r.row.sector).toBe('privado')
  })
})

describe('normalizeCueAnexo', () => {
  it('convierte 9 dígitos a NNNNNNN-NN', () => {
    expect(normalizeCueAnexo('180176400')).toBe('1801764-00')
    expect(normalizeCueAnexo(180176412)).toBe('1801764-12')
  })

  it('acepta la forma ya separada y rechaza longitudes erróneas', () => {
    expect(normalizeCueAnexo('1801764-00')).toBe('1801764-00')
    expect(normalizeCueAnexo('18017640')).toBeNull()
    expect(normalizeCueAnexo('')).toBeNull()
  })
})

describe('normalizeDni', () => {
  it('quita puntos y espacios', () => {
    expect(normalizeDni('30.123.456')).toBe('30123456')
    expect(normalizeDni(' 30 123 456 ')).toBe('30123456')
  })

  it('acepta números de la hoja y rechaza no numéricos', () => {
    expect(normalizeDni(30123456)).toBe('30123456')
    expect(normalizeDni('ANA')).toBeNull()
    expect(normalizeDni('1234567890')).toBeNull()
  })
})

describe('helpers de texto', () => {
  it('cellText lee texto plano, rich text, fórmulas y hipervínculos', () => {
    expect(cellText('  hola ')).toBe('hola')
    expect(cellText({ richText: [{ text: 'PE' }, { text: 'REZ' }] })).toBe('PEREZ')
    expect(cellText({ formula: 'A1', result: 'X' })).toBe('X')
    expect(cellText({ text: 'link', hyperlink: 'http://x' })).toBe('link')
    expect(cellText(null)).toBe('')
  })

  it('normalizeSearchName quita acentos, pasa a minúsculas y colapsa espacios', () => {
    expect(normalizeSearchName('  GÓMEZ   Ñandú ')).toBe('gomez nandu')
  })

  it('sectorFromSheetName reconoce las dos hojas', () => {
    expect(sectorFromSheetName('Matriculados_2026_Estatales')).toBe('estatal')
    expect(sectorFromSheetName('Matriculados_2026_Privados')).toBe('privado')
    expect(sectorFromSheetName('Otra')).toBeNull()
  })
})
