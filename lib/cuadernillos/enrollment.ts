import { and, eq } from 'drizzle-orm'
import { getDb, getRawClient } from '@/lib/db'
import { bookletCampaign, bookletProduct, bookletProductMapping } from '@/lib/db/schema'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'
import { crearEjecutorSql, getCorteVigente, type EjecutorSql } from '@/lib/infraestructura/ge-db'
import type { EnrollmentRecommendation } from './types'

export type EnrollmentRow = {
  levelCode: string
  gradeCode: string
  turn: string
  studentId: string | null
}

export type EnrollmentProduct = {
  id: string
  name: string
  levelCode: string
  gradeCode: string
  sourceLevelCode: string | null
  sourceGradeCode: string | null
}

export type EnrollmentRepository = {
  isCampaignActive(campaignId: string): Promise<boolean>
  listProducts(): Promise<EnrollmentProduct[]>
  getCurrentCut(): Promise<{ id: string | number } | null>
  listEnrollmentRows(cueAnexo: string, cutId: string | number): Promise<EnrollmentRow[]>
}

const listEnrollmentRows = async (
  client: EjecutorSql,
  cueAnexo: string,
  cutId: string | number,
): Promise<EnrollmentRow[]> => {
  const result = await client.execute({
    sql: `SELECT s.nivel AS "levelCode", s.curso AS "gradeCode", s.turno AS "turn",
                 CAST(a.ge_person_id AS TEXT) AS "studentId"
          FROM ge.ge_seccion s
          LEFT JOIN ge.ge_alumno_seccion a
            ON a.corte_id = s.corte_id AND a.ge_section_id = s.ge_section_id
          WHERE s.corte_id = ? AND s.cue_anexo = ?
          ORDER BY s.nivel, s.curso, s.turno, a.ge_person_id`,
    args: [cutId, cueAnexo],
  })
  return result.rows.map((row) => ({
    levelCode: String(row.levelCode),
    gradeCode: String(row.gradeCode),
    turn: String(row.turn),
    studentId: row.studentId == null ? null : String(row.studentId),
  }))
}

const databaseRepository: EnrollmentRepository = {
  async isCampaignActive(campaignId) {
    const [campaign] = await getDb().select({ id: bookletCampaign.id })
      .from(bookletCampaign)
      .where(and(eq(bookletCampaign.id, campaignId), eq(bookletCampaign.status, 'active')))
      .limit(1)
    return campaign !== undefined
  },
  async listProducts() {
    const [products, mappings] = await Promise.all([
      getDb().select({
        id: bookletProduct.id,
        name: bookletProduct.name,
        levelCode: bookletProduct.levelCode,
        gradeCode: bookletProduct.gradeCode,
      }).from(bookletProduct).orderBy(bookletProduct.levelCode, bookletProduct.gradeCode, bookletProduct.id),
      getDb().select({
        productId: bookletProductMapping.productId,
        sourceLevelCode: bookletProductMapping.sourceLevelCode,
        sourceGradeCode: bookletProductMapping.sourceGradeCode,
      }).from(bookletProductMapping),
    ])
    const mappingByProduct = new Map(mappings.map((mapping) => [mapping.productId, mapping]))
    return products.map((product) => ({
      ...product,
      sourceLevelCode: mappingByProduct.get(product.id)?.sourceLevelCode ?? null,
      sourceGradeCode: mappingByProduct.get(product.id)?.sourceGradeCode ?? null,
    }))
  },
  async getCurrentCut() {
    const client = crearEjecutorSql(getRawClient())
    await asegurarGeAdjuntada(client)
    const cut = await getCorteVigente(client)
    return cut ? { id: cut.id } : null
  },
  async listEnrollmentRows(cueAnexo, cutId) {
    const client = crearEjecutorSql(getRawClient())
    await asegurarGeAdjuntada(client)
    return listEnrollmentRows(client, cueAnexo, cutId)
  },
}

/** Returns grade-level counts only; student identifiers are never returned. */
export async function getEnrollmentRecommendations(
  cueAnexo: string,
  campaignId: string,
  repository: EnrollmentRepository = databaseRepository,
): Promise<EnrollmentRecommendation[]> {
  if (!/^\d{9}$/.test(cueAnexo) || campaignId.trim() === '') return []
  if (!await repository.isCampaignActive(campaignId)) return []

  const products = await repository.listProducts()
  if (products.length === 0) return []

  const cut = await repository.getCurrentCut()
  if (!cut) {
    return products.map((product) => ({
      productId: product.id,
      students: null,
      suggested: null,
      sourceCutId: null,
    }))
  }

  const rows = await repository.listEnrollmentRows(cueAnexo, cut.id)
  const studentsByProduct = new Map<string, Set<string>>()
  const observedProducts = new Set<string>()
  const ambiguousProducts = new Set<string>()
  const turnsByProduct = new Map<string, Set<string>>()
  const unknownTurnProducts = new Set<string>()
  for (const row of rows) {
    const matches = products.filter((candidate) =>
      candidate.sourceLevelCode === row.levelCode && candidate.sourceGradeCode === row.gradeCode)
    if (matches.length !== 1) {
      for (const product of matches) ambiguousProducts.add(product.id)
      continue
    }
    const product = matches[0]
    observedProducts.add(product.id)
    const turn = row.turn.trim()
    if (!turn) {
      unknownTurnProducts.add(product.id)
    } else {
      const turns = turnsByProduct.get(product.id) ?? new Set<string>()
      turns.add(turn)
      turnsByProduct.set(product.id, turns)
    }
    if (row.studentId === null) continue
    const students = studentsByProduct.get(product.id) ?? new Set<string>()
    students.add(row.studentId)
    studentsByProduct.set(product.id, students)
  }

  return products.map((product) => {
    if (ambiguousProducts.has(product.id) || unknownTurnProducts.has(product.id)
      || (turnsByProduct.get(product.id)?.size ?? 0) !== 1
      || product.sourceLevelCode === null || product.sourceGradeCode === null || !observedProducts.has(product.id)) {
      return { productId: product.id, students: null, suggested: null, sourceCutId: String(cut.id) }
    }
    const students = studentsByProduct.get(product.id)?.size ?? 0
    return { productId: product.id, students, suggested: students, sourceCutId: String(cut.id) }
  })
}
