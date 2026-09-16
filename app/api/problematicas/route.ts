import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { infraProblematica, infraProblematicaSeccion } from '@/lib/db/schema'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada, calcularImpactoSecciones } from '@/lib/infraestructura/impacto'
import {
  CUE_MAX_ALERTAS_ACTIVAS,
  contarAlertasActivasPorCue,
  getClientIp,
  ipExcedeLimite,
} from '@/lib/infraestructura/limites'
import { parseProblematicaInput } from '@/lib/infraestructura/validacion'

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

function mismoContenido(
  existente: { cueAnexo: string; motivo: string; severidad: string; descripcion: string | null },
  seccionesExistentes: number[],
  input: { cue: string; motivo: string; severidad: string; descripcion?: string; secciones: number[] },
): boolean {
  const cueInput = normalizeCue(input.cue)
  if (!cueInput) return false
  if (existente.cueAnexo !== cueInput.value) return false
  if (existente.motivo !== input.motivo) return false
  if (existente.severidad !== input.severidad) return false
  if ((existente.descripcion ?? '') !== (input.descripcion ?? '')) return false

  const a = [...seccionesExistentes].sort((x, y) => x - y)
  const b = [...input.secciones].sort((x, y) => x - y)
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

export async function POST(request: Request) {
  await ensureSeeded()

  const ip = getClientIp(request)
  if (ipExcedeLimite(ip)) {
    return Response.json({ error: 'Demasiadas solicitudes, intentá de nuevo más tarde' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const parsed = parseProblematicaInput(body)
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
  const seccionesInvalidas = input.secciones.filter((s) => !seccionesCue.has(s))
  if (seccionesInvalidas.length > 0) {
    return Response.json(
      { error: 'Alguna de las secciones no pertenece al establecimiento indicado' },
      { status: 400 },
    )
  }

  const existente = await db
    .select()
    .from(infraProblematica)
    .where(eq(infraProblematica.idempotencyKey, input.idempotencyKey))
    .limit(1)

  if (existente.length > 0) {
    const row = existente[0]
    const seccionesExistentes = await db
      .select({ geSectionId: infraProblematicaSeccion.geSectionId })
      .from(infraProblematicaSeccion)
      .where(eq(infraProblematicaSeccion.problematicaId, row.id))

    if (!mismoContenido(row, seccionesExistentes.map((s) => s.geSectionId), input)) {
      return Response.json(
        { error: 'idempotencyKey ya utilizada con un contenido distinto' },
        { status: 409 },
      )
    }

    const impacto = await calcularImpactoSecciones(client, {
      corteId: row.corteId,
      geSectionIds: seccionesExistentes.map((s) => s.geSectionId),
    })
    return Response.json({ ok: true, id: row.id, impacto }, { status: 200 })
  }

  const activas = await contarAlertasActivasPorCue(cue.value)
  if (activas >= CUE_MAX_ALERTAS_ACTIVAS) {
    return Response.json(
      { error: 'Se alcanzó el límite de alertas activas para este establecimiento' },
      { status: 429 },
    )
  }

  const id = crypto.randomUUID()
  const creadaEn = new Date().toISOString()

  try {
    await db.transaction(async (tx) => {
      await tx.insert(infraProblematica).values({
        id,
        cueAnexo: cue.value,
        motivo: input.motivo,
        severidad: input.severidad,
        descripcion: input.descripcion ?? null,
        corteId: corte.id,
        creadaEn,
        idempotencyKey: input.idempotencyKey,
        origen: 'enlace-cue',
      })
      await tx.insert(infraProblematicaSeccion).values(
        input.secciones.map((geSectionId) => ({ problematicaId: id, geSectionId })),
      )
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/UNIQUE constraint failed.*idempotency_key/i.test(msg)) {
      const race = await db
        .select()
        .from(infraProblematica)
        .where(eq(infraProblematica.idempotencyKey, input.idempotencyKey))
        .limit(1)
      if (race.length > 0) {
        const row = race[0]
        const seccionesExistentes = await db
          .select({ geSectionId: infraProblematicaSeccion.geSectionId })
          .from(infraProblematicaSeccion)
          .where(eq(infraProblematicaSeccion.problematicaId, row.id))
        if (mismoContenido(row, seccionesExistentes.map((s) => s.geSectionId), input)) {
          const impacto = await calcularImpactoSecciones(client, {
            corteId: row.corteId,
            geSectionIds: seccionesExistentes.map((s) => s.geSectionId),
          })
          return Response.json({ ok: true, id: row.id, impacto }, { status: 200 })
        }
        return Response.json(
          { error: 'idempotencyKey ya utilizada con un contenido distinto' },
          { status: 409 },
        )
      }
    }
    return Response.json({ error: 'No se pudo guardar la problemática' }, { status: 500 })
  }

  const impacto = await calcularImpactoSecciones(client, {
    corteId: corte.id,
    geSectionIds: input.secciones,
  })

  return Response.json({ ok: true, id, impacto }, { status: 201 })
}
