import { describe, expect, it } from 'vitest'
import { getSchoolEligibility } from './eligibility'

const projection = async (_cueAnexo: string, severity: string | null): Promise<string | null> => severity

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
