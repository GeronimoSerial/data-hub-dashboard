import { getDb } from '@/lib/db'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada, calcularImpactoSecciones } from '@/lib/infraestructura/impacto'
import { parseImpactoPreliminarInput } from '@/lib/infraestructura/validacion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function seccionesDelCue(
  client: Awaited<ReturnType<typeof getDb>>['$client'],
  corteId: number,
  cueAnexo: string,
): Promise<number[]> {
  const res = await client.execute({
    sql: 'SELECT ge_section_id FROM ge.ge_seccion WHERE corte_id = ? AND cue_anexo = ?',
    args: [corteId, cueAnexo],
  })
  return res.rows.map((r) => Number(r.ge_section_id))
}

// Mismo camino de cálculo que el POST de alta: ambos llaman
// calcularImpactoSecciones con (corteId, geSectionIds). El navegador nunca
// recibe ni calcula membresías, solo el resultado de esta única función.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const parsed = parseImpactoPreliminarInput(body)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  const input = parsed.data

  const cue = normalizeCue(input.cue)
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  const db = getDb()
  const client = db.$client
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) {
    return Response.json({ error: 'No hay un corte vigente de Gestión Educativa' }, { status: 503 })
  }

  const seccionesCue = new Set(await seccionesDelCue(client, corte.id, cue.value))
  const seccionesValidas = input.secciones.filter((s) => seccionesCue.has(s))
  if (seccionesValidas.length !== input.secciones.length) {
    return Response.json(
      { error: 'Alguna de las secciones no pertenece al establecimiento indicado' },
      { status: 400 },
    )
  }

  const impacto = await calcularImpactoSecciones(client, {
    corteId: corte.id,
    geSectionIds: input.secciones,
  })

  return Response.json({ ok: true, impacto }, { status: 200 })
}
