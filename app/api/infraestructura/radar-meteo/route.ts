import { z } from 'zod'
import { ESPACIADO_GRILLA, GRID_VERSION } from '@/lib/infraestructura/radar-meteo/grilla'
import { VARIABLES_RADAR, type VariableRadar } from '@/lib/infraestructura/radar-meteo/provider'
import { obtenerUltimoRunRadarMeteo } from '@/lib/infraestructura/radar-meteo/job-sync'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { riskRadarEnabled } from '@/lib/infraestructura/riesgo/flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const variablesSchema = z.string().transform((valor, ctx) => {
  const lista = valor
    .split(',')
    .map((variable) => variable.trim())
    .filter(Boolean)
  const contieneInvalida = lista.some(
    (variable) => !VARIABLES_RADAR.includes(variable as VariableRadar),
  )
  if (!lista.length || contieneInvalida || new Set(lista).size !== lista.length) {
    ctx.addIssue({ code: 'custom', message: 'variables inválidas' })
    return z.NEVER
  }
  return lista as VariableRadar[]
})
const fechaSchema = z.string().datetime({ offset: true })
const querySchema = z.object({
  variables: variablesSchema.optional(),
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
  paso: z.enum(['1', '3']).default('1'),
})

const UNIDADES: Record<VariableRadar, string> = {
  precipitation_probability: '%',
  precipitation: 'mm',
  wind_speed_10m: 'km/h',
  wind_gusts_10m: 'km/h',
  wind_direction_10m: '°',
  cape: 'J/kg',
  lifted_index: '°C',
  weather_code: 'WMO',
  freezing_level_height: 'm',
}

function redondear(variable: VariableRadar, valor: number | null): number | null {
  if (valor === null) return null
  const decimales = variable === 'precipitation' || variable === 'lifted_index' ? 1 : 0
  const factor = 10 ** decimales
  return Math.round(valor * factor) / factor
}

function respuesta(datos: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(datos, { status, headers })
}

export async function GET(request: Request) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  if (!riskRadarEnabled()) {
    return respuesta(
      { error: 'Radar no habilitado' },
      404,
      { 'Cache-Control': 'private, no-store' },
    )
  }

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    variables: url.searchParams.get('variables') ?? undefined,
    desde: url.searchParams.get('desde') ?? undefined,
    hasta: url.searchParams.get('hasta') ?? undefined,
    paso: url.searchParams.get('paso') ?? '1',
  })
  if (!parsed.success) {
    return jsonError(
      `Parámetro inválido: ${parsed.error.issues[0]?.path.join('.')}`,
      400,
    )
  }
  const filtros = parsed.data
  if (
    filtros.desde &&
    filtros.hasta &&
    Date.parse(filtros.desde) > Date.parse(filtros.hasta)
  ) {
    return jsonError('Parámetro inválido: rango', 400)
  }

  const run = await obtenerUltimoRunRadarMeteo()
  const parametros = JSON.stringify({
    variables: filtros.variables ?? VARIABLES_RADAR,
    desde: filtros.desde ?? null,
    hasta: filtros.hasta ?? null,
    paso: filtros.paso,
  })
  const etag = `W/"${Buffer.from(`${run?.id ?? 'sin-run'}:${parametros}`).toString('base64url')}"`
  const headers = { 'Cache-Control': 'private, max-age=300', ETag: etag }
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers })
  }

  if (!run) {
    return respuesta(
      {
        runId: null,
        runAt: null,
        fetchedAt: null,
        model: null,
        gridVersion: GRID_VERSION,
        grid: null,
        tiempos: [],
        unidades: {},
        valores: {},
        frescura: null,
        sinDatos: true,
        razon: 'Todavía no se cargó ningún pronóstico.',
      },
      200,
      headers,
    )
  }

  const payload = run.payload as {
    times: string[]
    cells: Array<{ id: string; row: number; col: number; lat: number; lon: number }>
    values: Record<string, Array<Array<number | null>>>
  }
  const indices = payload.times
    .map((t, i) => ({ t, i }))
    .filter(
      ({ t }) =>
        (!filtros.desde || Date.parse(t) >= Date.parse(filtros.desde)) &&
        (!filtros.hasta || Date.parse(t) <= Date.parse(filtros.hasta)),
    )
  const seleccionados =
    filtros.paso === '3'
      ? Array.from({ length: Math.ceil(indices.length / 3) }, (_, grupo) =>
          indices.slice(grupo * 3, grupo * 3 + 3),
        )
          .filter((grupo) => grupo.length > 0)
          .map((grupo) => ({
            t: grupo.at(-1)!.t,
            indices: grupo.map((hora) => hora.i),
          }))
      : indices.map(({ t, i }) => ({ t, indices: [i] }))
  const variables = filtros.variables ?? [...VARIABLES_RADAR]
  const valores = Object.fromEntries(
    variables.map((variable) => [
      variable,
      seleccionados.map(({ indices: horas }) =>
        payload.cells.map((_, celda) => {
          const serie = payload.values[variable]?.[celda] ?? []
          if (variable === 'precipitation' && filtros.paso === '3') {
            const suma = horas
              .map((hora) => serie[hora])
              .filter((valor): valor is number => valor !== null && valor !== undefined)
              .reduce((acumulado, valor) => acumulado + valor, 0)
            return redondear(variable, suma)
          }
          return redondear(variable, serie[horas.at(-1)!] ?? null)
        }),
      ),
    ]),
  )
  const minRow = Math.min(...payload.cells.map((celda) => celda.row))
  const minCol = Math.min(...payload.cells.map((celda) => celda.col))
  const maxRow = Math.max(...payload.cells.map((celda) => celda.row))
  const maxCol = Math.max(...payload.cells.map((celda) => celda.col))
  const edadMinutos = Math.max(0, Math.floor((Date.now() - new Date(run.runAt).getTime()) / 60000))
  return respuesta(
    {
      runId: run.id,
      runAt: run.runAt,
      fetchedAt: run.fetchedAt,
      model: run.model,
      gridVersion: run.gridVersion,
      grid: {
        espaciado: ESPACIADO_GRILLA,
        lat0: minRow * ESPACIADO_GRILLA,
        lon0: minCol * ESPACIADO_GRILLA,
        filas: maxRow - minRow + 1,
        columnas: maxCol - minCol + 1,
        celdas: payload.cells.map((celda) => ({
          id: celda.id,
          fila: celda.row - minRow,
          columna: celda.col - minCol,
          lat: celda.lat,
          lon: celda.lon,
        })),
      },
      tiempos: seleccionados.map((seleccion) => seleccion.t),
      unidades: Object.fromEntries(
        variables.map((variable) => [variable, run.units[variable] ?? UNIDADES[variable]]),
      ),
      valores,
      frescura: { edadMinutos, desactualizado: edadMinutos > 420 },
      sinDatos: false,
    },
    200,
    headers,
  )
}
