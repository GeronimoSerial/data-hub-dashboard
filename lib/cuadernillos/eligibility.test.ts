import { describe, expect, it } from 'vitest'
import { getSchoolEligibility, getSchoolEligibilityWithName, searchCriticalConsejoSchools, type ConsejoSchoolSeverityRow } from './eligibility'

const projection = async (_cueAnexo: string, severity: string | null): Promise<string | null> => severity

describe('getSchoolEligibilityWithName', () => {
  it('reads severity and school name from one map row, using the dashed CUE', async () => {
    const seen: string[] = []
    const result = await getSchoolEligibilityWithName('180123456', async (cue) => {
      seen.push(cue)
      return { peorSeveridad: 'Crítica', nombre: 'ESCUELA DOCE' }
    })

    expect(seen).toEqual(['180123456'])
    expect(result).toMatchObject({ eligible: true, severity: 'Crítica', nombre: 'ESCUELA DOCE' })
  })

  it('fails closed without a name when the row is unavailable or the read throws', async () => {
    await expect(getSchoolEligibilityWithName('180123456', async () => null)).resolves.toMatchObject({ eligible: false, severity: null, nombre: null })
    await expect(getSchoolEligibilityWithName('180123456', async () => { throw new Error('down') })).resolves.toMatchObject({ eligible: false, severity: null, nombre: null })
  })
})

describe('getSchoolEligibility', () => {
  it('allows only the effective critical severity', async () => {
    await expect(getSchoolEligibility('180123456', async (cue) => projection(cue, 'Crítica'))).resolves.toMatchObject({
      eligible: true,
      severity: 'Crítica',
    })
    await expect(getSchoolEligibility('180123456', async (cue) => projection(cue, 'Media'))).resolves.toMatchObject({
      eligible: false,
      severity: 'Media',
    })
    await expect(getSchoolEligibility('180123456', async (cue) => projection(cue, 'Alta'))).resolves.toMatchObject({
      eligible: false,
      severity: 'Alta',
    })
  })

  it('fails closed when no current situation is available', async () => {
    await expect(getSchoolEligibility('180123456', async () => null)).resolves.toMatchObject({
      eligible: false,
      severity: null,
    })
  })
})

describe('searchCriticalConsejoSchools', () => {
  const rows: ConsejoSchoolSeverityRow[] = [
    { cueAnexo: '1800001-00', nombre: 'ESCUELA UNO', departamento: 'BELLA VISTA', peorSeveridad: 'Crítica' },
    { cueAnexo: '1800002-00', nombre: 'ESCUELA DOS', departamento: 'BELLA VISTA', peorSeveridad: 'Media' },
    { cueAnexo: '1800012-00', nombre: 'ESCUELA DOCE', departamento: 'CAPITAL', peorSeveridad: 'Crítica' },
    { cueAnexo: '1800013-00', nombre: 'ESCUELA TRECE', departamento: 'CAPITAL', peorSeveridad: 'Crítica' },
    { cueAnexo: '1800013-00', nombre: 'ESCUELA TRECE', departamento: 'CAPITAL', peorSeveridad: 'Crítica' },
  ]
  const reader = async () => rows

  it('returns only critical schools whose CUE starts with the typed digits, in 9-digit form', async () => {
    await expect(searchCriticalConsejoSchools('1800001', reader)).resolves.toEqual([
      { cueAnexo: '180000100', nombre: 'ESCUELA UNO', departamento: 'BELLA VISTA', severity: 'Crítica' },
    ])
  })

  it('never returns a non-critical school even when its CUE matches', async () => {
    await expect(searchCriticalConsejoSchools('180000200', reader)).resolves.toEqual([])
  })

  it('drops a CUE that the map reports more than once instead of guessing its severity', async () => {
    await expect(searchCriticalConsejoSchools('18000', reader)).resolves.toEqual([
      { cueAnexo: '180000100', nombre: 'ESCUELA UNO', departamento: 'BELLA VISTA', severity: 'Crítica' },
      { cueAnexo: '180001200', nombre: 'ESCUELA DOCE', departamento: 'CAPITAL', severity: 'Crítica' },
    ])
  })
})

describe('toDashedCue', () => {
  it('converts booklet 9-digit CUEs to the dashed form used by map partes', async () => {
    const { toDashedCue } = await import('./eligibility')
    expect(toDashedCue('180119000')).toBe('1801190-00')
    expect(toDashedCue('1801190-00')).toBe('1801190-00')
  })
})
