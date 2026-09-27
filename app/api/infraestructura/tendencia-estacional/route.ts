import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { hazardSeasonalTrend } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Capa opcional (SEASONAL_ENABLED, ver plan-implementacion §9.3): tendencia
// ENOS a 30-90 días por DEPARTAMENTO, nunca por escuela. Sólo staff
// (admin/editor) — mismo criterio que /api/infraestructura/operacion/salud,
// no el ACL genérico de lectura del mapa: esto es un dato operativo interno,
// no la ficha territorial pública del mapa.
const filtrosSchema = z.object({
  departamento: z.string().min(1).max(100).optional(),
})

export interface TendenciaEstacionalItem {
  departamento: string
  variable: string
  emisionEn: string
  validoDesde: string
  validoHasta: string
  horizonteDesdeDias: number
  horizonteHastaDias: number
  model: string
  miembrosTotal: number
  miembrosValidos: number
  mediaMm: number | null
  medianaMm: number | null
  dispersionMm: number | null
  probabilidadSobreNormal: number | null
}

function respuestaError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function GET(request: Request) {
  await ensureSeeded()

  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaError(guard.status, guard.error)

  const { searchParams } = new URL(request.url)
  const parsed = filtrosSchema.safeParse({
    departamento: searchParams.get('departamento') ?? undefined,
  })
  if (!parsed.success) {
    return respuestaError(400, 'departamento inválido')
  }
  const departamentoFiltro = parsed.data.departamento
    ? normalizarNombreDepartamento(parsed.data.departamento)
    : undefined

  const db = getDb()
  const base = db.select().from(hazardSeasonalTrend)
  const filas =
    departamentoFiltro === undefined
      ? await base.orderBy(desc(hazardSeasonalTrend.emisionEn))
      : await base
          .where(eq(hazardSeasonalTrend.departamento, departamentoFiltro))
          .orderBy(desc(hazardSeasonalTrend.emisionEn))

  // Una fila por departamento: la emisión más reciente (ya viene ordenada
  // desc por emisionEn), nunca un historial completo — esta API es para "el
  // último pronóstico disponible", no un archivo.
  const vistos = new Set<string>()
  const items: TendenciaEstacionalItem[] = []
  for (const fila of filas) {
    if (vistos.has(fila.departamento)) continue
    vistos.add(fila.departamento)
    items.push({
      departamento: fila.departamento,
      variable: fila.variable,
      emisionEn: fila.emisionEn,
      validoDesde: fila.validoDesde,
      validoHasta: fila.validoHasta,
      horizonteDesdeDias: fila.horizonteDesdeDias,
      horizonteHastaDias: fila.horizonteHastaDias,
      model: fila.model,
      miembrosTotal: fila.miembrosTotal,
      miembrosValidos: fila.miembrosValidos,
      mediaMm: fila.mediaMm,
      medianaMm: fila.medianaMm,
      dispersionMm: fila.dispersionMm,
      probabilidadSobreNormal: fila.probabilidadSobreNormal,
    })
  }

  return Response.json(
    { items },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
