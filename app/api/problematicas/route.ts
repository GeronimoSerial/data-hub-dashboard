import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { infraProblematica, infraProblematicaAlumno, infraProblematicaSeccion } from '@/lib/db/schema'
import { tieneAccesoPublico } from '@/lib/infraestructura/acceso-publico'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada, calcularImpactoSecciones, obtenerMembresiaSecciones } from '@/lib/infraestructura/impacto'
import {
  CUE_MAX_ALERTAS_ACTIVAS,
  contarAlertasActivasPorCue,
  getClientIp,
  ipExcedeLimite,
} from '@/lib/infraestructura/limites'
import { listarMotivos } from '@/lib/infraestructura/motivos'
import {
  parseProblematicaInput,
  resolverCategoria,
  validarAlumnosPermitidos,
} from '@/lib/infraestructura/validacion'

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
  alumnosExistentes: number[],
  input: { cue: string; motivo: string; severidad: string; descripcion?: string; secciones: number[]; alumnos?: number[] },
): boolean {
  const cueInput = normalizeCue(input.cue)
  if (!cueInput) return false
  if (existente.cueAnexo !== cueInput.value) return false
  if (existente.motivo !== input.motivo) return false
  if (existente.severidad !== input.severidad) return false
  if ((existente.descripcion ?? '') !== (input.descripcion ?? '')) return false

  const mismosIds = (a: number[], b: number[]) => {
    const x = [...a].sort((p, q) => p - q)
    const y = [...b].sort((p, q) => p - q)
    if (x.length !== y.length) return false
    return x.every((v, i) => v === y[i])
  }

  if (!mismosIds(seccionesExistentes, input.secciones)) return false
  return mismosIds(alumnosExistentes, input.alumnos ?? [])
}

export async function POST(request: Request) {
  if (!tieneAccesoPublico(request)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  await ensureSeeded()

  const ip = getClientIp(request)
  if (ipExcedeLimite(ip)) {
    return Response.json({ error: 'Demasiadas solicitudes. Intente nuevamente más tarde.' }, { status: 429 })
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

  // La categoría la resuelve el servidor a partir del motivo: cualquier
  // `categoria` que haya llegado en el body ya fue descartada por el schema
  // (no es un campo que reconozca), y acá se ignora también cualquier intento
  // de mandarla por fuera de ese schema.
  const motivos = await listarMotivos()
  const categoriaResuelta = resolverCategoria(input.motivo, motivos)
  if (!categoriaResuelta.ok) {
    return Response.json({ error: categoriaResuelta.error }, { status: 400 })
  }
  const categoria = categoriaResuelta.categoria

  const alumnosPermitidos = validarAlumnosPermitidos(categoria, input.alumnos)
  if (!alumnosPermitidos.ok) {
    return Response.json({ error: alumnosPermitidos.error }, { status: 400 })
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

  // Mismo criterio que la validación de secciones: cada alumno seleccionado
  // tiene que pertenecer a alguna de las secciones elegidas, en el corte
  // vigente. Si no, 400 — nunca se persiste un alumno que no está donde el
  // formulario dice que está.
  const alumnosInput = input.alumnos ?? []
  if (alumnosInput.length > 0) {
    const membresia = await obtenerMembresiaSecciones(client, { corteId: corte.id, geSectionIds: input.secciones })
    const todosLosAlumnosDeLasSecciones = new Set<number>()
    for (const personIds of membresia.values()) {
      for (const id of personIds) todosLosAlumnosDeLasSecciones.add(id)
    }
    const alumnosInvalidos = alumnosInput.filter((id) => !todosLosAlumnosDeLasSecciones.has(id))
    if (alumnosInvalidos.length > 0) {
      return Response.json(
        { error: 'Alguno de los alumnos seleccionados no pertenece a las secciones indicadas' },
        { status: 400 },
      )
    }
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
    const alumnosExistentes = await db
      .select({ gePersonId: infraProblematicaAlumno.gePersonId })
      .from(infraProblematicaAlumno)
      .where(eq(infraProblematicaAlumno.problematicaId, row.id))

    if (
      !mismoContenido(
        row,
        seccionesExistentes.map((s) => s.geSectionId),
        alumnosExistentes.map((a) => a.gePersonId),
        input,
      )
    ) {
      return Response.json(
        { error: 'idempotencyKey ya utilizada con un contenido distinto' },
        { status: 409 },
      )
    }

    const impacto = await calcularImpactoSecciones(client, {
      corteId: row.corteId,
      geSectionIds: seccionesExistentes.map((s) => s.geSectionId),
      alumnoIds: alumnosExistentes.map((a) => a.gePersonId),
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
        categoria,
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
      if (alumnosInput.length > 0) {
        await tx.insert(infraProblematicaAlumno).values(
          alumnosInput.map((gePersonId) => ({ problematicaId: id, gePersonId })),
        )
      }
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
        const alumnosExistentes = await db
          .select({ gePersonId: infraProblematicaAlumno.gePersonId })
          .from(infraProblematicaAlumno)
          .where(eq(infraProblematicaAlumno.problematicaId, row.id))
        if (
          mismoContenido(
            row,
            seccionesExistentes.map((s) => s.geSectionId),
            alumnosExistentes.map((a) => a.gePersonId),
            input,
          )
        ) {
          const impacto = await calcularImpactoSecciones(client, {
            corteId: row.corteId,
            geSectionIds: seccionesExistentes.map((s) => s.geSectionId),
            alumnoIds: alumnosExistentes.map((a) => a.gePersonId),
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
    alumnoIds: alumnosInput,
  })

  return Response.json({ ok: true, id, impacto }, { status: 201 })
}
