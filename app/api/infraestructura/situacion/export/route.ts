import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { obtenerUltimoCorte } from '@/lib/infraestructura/riesgo/situacion/corte'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const filtrosSchema = z.object({
  formato: z.enum(['csv', 'json']).default('json'),
})

// Una fila = un nivel de riesgo con su conteo, más las columnas de contexto
// del corte repetidas: es el shape más simple que un operador puede abrir en
// una planilla sin perder ningún conteo.
function filasCsv(corte: NonNullable<Awaited<ReturnType<typeof obtenerUltimoCorte>>>): string[][] {
  const encabezado = [
    'corteId',
    'generadoEn',
    'nivelRiesgo',
    'conteo',
    'escuelasAfectacionConfirmadaVigente',
    'escuelasRiesgoAlto24h',
    'fuentesVencidas',
    'episodiosAbiertos',
    'episodiosCerradosDesdeAnterior',
  ]
  const niveles = Object.keys(corte.conteosPorNivelRiesgo).sort()
  const filas = niveles.map((nivel) => [
    corte.id,
    corte.generadoEn,
    nivel,
    String(corte.conteosPorNivelRiesgo[nivel]),
    String(corte.kpis.escuelasAfectacionConfirmadaVigente),
    String(corte.kpis.escuelasRiesgoAlto24h),
    String(corte.kpis.fuentesVencidas),
    String(corte.episodiosAbiertos),
    String(corte.episodiosCerradosDesdeAnterior),
  ])
  return [encabezado, ...filas]
}

function aCsv(filas: string[][]): string {
  return filas
    .map((fila) => fila.map((valor) => `"${valor.replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
}

export async function GET(request: Request) {
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) {
    return Response.json(
      { error: guard.error },
      { status: guard.status, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  await ensureSeeded()

  const { searchParams } = new URL(request.url)
  const parsed = filtrosSchema.safeParse({ formato: searchParams.get('formato') ?? undefined })
  if (!parsed.success) {
    return Response.json({ error: 'formato inválido (csv|json)' }, { status: 400 })
  }

  const corte = await obtenerUltimoCorte()
  if (!corte) {
    return Response.json(
      { error: 'Todavía no hay ningún corte generado' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  if (parsed.data.formato === 'csv') {
    const cuerpo = aCsv(filasCsv(corte))
    return new Response(cuerpo, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="situacion-corte-${corte.id}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  return Response.json(corte, {
    status: 200,
    headers: {
      'Content-Disposition': `attachment; filename="situacion-corte-${corte.id}.json"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
