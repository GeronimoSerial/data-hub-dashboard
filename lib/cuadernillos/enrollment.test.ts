import { describe, expect, it } from 'vitest'
import { getEnrollmentRecommendations } from './enrollment'

const products = [
  { id: 'primary-1', name: 'Primary booklet, grade 1', levelCode: 'primary', gradeCode: 'grade-1', sourceLevelCode: 'Primaria', sourceGradeCode: '1' },
  { id: 'primary-2', name: 'Primary booklet, grade 2', levelCode: 'primary', gradeCode: 'grade-2', sourceLevelCode: 'Primaria', sourceGradeCode: '2' },
  { id: 'secondary-1', name: 'Secondary booklet, grade 1', levelCode: 'secondary', gradeCode: 'grade-1', sourceLevelCode: 'Secundaria', sourceGradeCode: '1' },
  { id: 'unmapped', name: 'Unmapped booklet', levelCode: 'primary', gradeCode: 'grade-3', sourceLevelCode: null, sourceGradeCode: null },
]

const repository = (overrides: Record<string, unknown> = {}) => ({
  isCampaignActive: async (campaignId: string) => campaignId === 'campaign-1',
  listProducts: async () => products,
  getCurrentCut: async () => ({ id: 42 }),
  listEnrollmentRows: async () => [],
  ...overrides,
})

describe('getEnrollmentRecommendations', () => {
  it('recommends one booklet per unique student within one level, grade, and turn', async () => {
    const students = Array.from({ length: 27 }, (_, index) => `student-${index}`)
    const rows = [
      ...students.map((studentId) => ({ levelCode: 'Primaria', gradeCode: '1', turn: 'morning', studentId })),
      { levelCode: 'Primaria', gradeCode: '1', turn: 'morning', studentId: students[0] },
      ...Array.from({ length: 5 }, (_, index) => ({
        levelCode: 'Primaria', gradeCode: '2', turn: 'morning', studentId: `grade-2-${index}`,
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        levelCode: 'Secundaria', gradeCode: '1', turn: 'morning', studentId: `secondary-${index}`,
      })),
    ]

    const result = await getEnrollmentRecommendations('180123456', 'campaign-1', repository({
      listEnrollmentRows: async () => rows,
    }))

    expect(result).toEqual([
      { productId: 'primary-1', students: 27, suggested: 27, sourceCutId: '42' },
      { productId: 'primary-2', students: 5, suggested: 5, sourceCutId: '42' },
      { productId: 'secondary-1', students: 3, suggested: 3, sourceCutId: '42' },
      { productId: 'unmapped', students: null, suggested: null, sourceCutId: '42' },
    ])
    expect(JSON.stringify(result)).not.toMatch(/student-|nombre|apellido|dni/i)
  })

  it('fails closed when a product mapping collapses multiple turns into one product count', async () => {
    const result = await getEnrollmentRecommendations('180123456', 'campaign-1', repository({
      listEnrollmentRows: async () => [
        { levelCode: 'Primaria', gradeCode: '1', turn: 'morning', studentId: 'student-1' },
        { levelCode: 'Primaria', gradeCode: '1', turn: 'afternoon', studentId: 'student-2' },
      ],
    }))

    expect(result[0]).toEqual({ productId: 'primary-1', students: null, suggested: null, sourceCutId: '42' })
  })

  it('returns null counts rather than zero when the current roster cut is absent', async () => {
    const result = await getEnrollmentRecommendations('180123456', 'campaign-1', repository({
      getCurrentCut: async () => null,
    }))

    expect(result).toEqual(products.map((product) => ({
      productId: product.id,
      students: null,
      suggested: null,
      sourceCutId: null,
    })))
  })

  it('does not infer a GE mapping from coincident catalog labels', async () => {
    const result = await getEnrollmentRecommendations('180123456', 'campaign-1', repository({
      listProducts: async () => [
        { id: 'same-label', name: 'Unconfirmed mapping', levelCode: 'Primaria', gradeCode: '1', sourceLevelCode: null, sourceGradeCode: null },
      ],
      listEnrollmentRows: async () => [
        { levelCode: 'Primaria', gradeCode: '1', turn: 'morning', studentId: 'private-student-id' },
      ],
    }))

    expect(result).toEqual([{ productId: 'same-label', students: null, suggested: null, sourceCutId: '42' }])
  })

  it('returns no recommendations for a campaign that is not active', async () => {
    await expect(getEnrollmentRecommendations('180123456', 'unknown-campaign', repository()))
      .resolves.toEqual([])
  })
})
