// GET /api/infraestructura/replay/export (batch E7b, decisión de N1 #3 del
// brief). Mismo filtro y motor que GET /api/infraestructura/replay
// (generarReplay): esta ruta NO recalcula nada, sólo proyecta el mismo
// ResultadoReplay a conteos simples en CSV o JSON. Así "export = replay en
// conteos" es una garantía de código (misma llamada), no una coincidencia que
// haya que mantener sincronizada a mano.
//
// Decisión de producto ya registrada en el plan (2026-09-26): sin manifiesto
// ni hashes. Zona horaria de los datos: UTC (mismo criterio que todo el
// dominio); se documenta además la zona argentina para lectura humana.
import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { EPISODIOS_REGLA_VERSION } from '@/lib/infraestructura/episodios-derivados/regla'
import { MOTOR_VERSION } from '@/lib/infraestructura/riesgo/motor/config'
import { VERSION_REGLA_PELIGRO } from '@/lib/infraestructura/riesgo/peligro/nivel'
import { generarReplay, type ResultadoReplay } from '@/lib/infraestructura/replay/consulta'
import { PASO_REPLAY_HORAS_DEFAULT, vistaReplaySchema } from '@/lib/infraestructura/replay/tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ZONA_HORARIA_DATOS = 'UTC'
// Sólo documentación para lectura humana; ningún dato se convierte a esta
// zona, todo el resto de la respuesta queda en UTC.
const ZONA_HORARIA_ARGENTINA_DOCUMENTADA = 'America/Argentina/Buenos_Aires'

const formatoExportSchema = z.enum(['json', 'csv']).default('json')

const queryExportSchema = z.object({
  territorioTipo: z.literal('departamento').default('departamento'),
  territorioId: z.string().min(1).optional(),
  desde: z.iso.datetime({ offset: false }).optional(),
  hasta: z.iso.datetime({ offset: false }).optional(),
  paso: z.coerce.number().int().positive().default(PASO_REPLAY_HORAS_DEFAULT),
  vista: vistaReplaySchema,
  episodioDerivadoId: z.string().min(1).optional(),
  formato: formatoExportSchema,
})

// Conteos simples por cuadro. `snapshotRiesgoPresente` es 0|1 (hay o no hay
// run vigente a ese instante), el resto son tamaños de arreglo — ningún
// conteo interpola ni asume presencia donde el cuadro dice "sin dato".
interface ConteoCuadro {
  instante: string
  afectacionesConfirmadas: number
  snapshotRiesgoPresente: 0 | 1
  nivelesPeligro: number
  lluviaObservada: number
  saludFuentes: number
}

function contarCuadros(resultado: ResultadoReplay): ConteoCuadro[] {
  return resultado.cuadros.map((cuadro) => ({
    instante: cuadro.instante,
    afectacionesConfirmadas: cuadro.afectacionesConfirmadas.length,
    snapshotRiesgoPresente: cuadro.snapshotRiesgo === null ? 0 : 1,
    nivelesPeligro: cuadro.nivelesPeligro.length,
    lluviaObservada: cuadro.lluviaObservada.length,
    saludFuentes: cuadro.saludFuentes.length,
  }))
}

// Cobertura por fuente: fracción de cuadros donde esa fuente NO reportó "sin
// dato" (usa el mismo `vacios` que ya calculó el motor, no un recálculo
// propio). Con 0 cuadros la cobertura es 0 para las tres, no NaN.
function calcularCobertura(resultado: ResultadoReplay) {
  const total = resultado.vacios.length
  if (total === 0) return { snapshotRiesgo: 0, peligro: 0, lluvia: 0 }
  const conDato = (campo: 'snapshotRiesgo' | 'peligro' | 'lluvia') =>
    resultado.vacios.filter((v) => !v[campo]).length / total
  return {
    snapshotRiesgo: conDato('snapshotRiesgo'),
    peligro: conDato('peligro'),
    lluvia: conDato('lluvia'),
  }
}

const CSV_HEADER =
  'instante,afectacionesConfirmadas,snapshotRiesgoPresente,nivelesPeligro,lluviaObservada,saludFuentes'

function aCsv(conteos: ConteoCuadro[]): string {
  const filas = conteos.map((c) =>
    [
      c.instante,
      c.afectacionesConfirmadas,
      c.snapshotRiesgoPresente,
      c.nivelesPeligro,
      c.lluviaObservada,
      c.saludFuentes,
    ].join(','),
  )
  return [CSV_HEADER, ...filas].join('\n') + '\n'
}

export async function GET(request: Request) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await ensureSeeded()

  const { searchParams } = new URL(request.url)
  const parsed = queryExportSchema.safeParse({
    territorioTipo: searchParams.get('territorioTipo') ?? undefined,
    territorioId: searchParams.get('territorioId') ?? undefined,
    desde: searchParams.get('desde') ?? undefined,
    hasta: searchParams.get('hasta') ?? undefined,
    paso: searchParams.get('paso') ?? undefined,
    vista: searchParams.get('vista') ?? undefined,
    episodioDerivadoId: searchParams.get('episodioDerivadoId') ?? undefined,
    formato: searchParams.get('formato') ?? undefined,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return Response.json({ error: `Parámetro inválido: ${issue.path.join('.') || issue.message}` }, { status: 400 })
  }
  const { formato, ...paramsReplay } = parsed.data

  let resultado: ResultadoReplay
  try {
    resultado = await generarReplay(paramsReplay)
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al generar el export de replay'
    const status = mensaje.includes('no encontrado') ? 404 : 400
    return Response.json({ error: mensaje }, { status })
  }

  const conteos = contarCuadros(resultado)
  const cobertura = calcularCobertura(resultado)
  const versionReglas = {
    motor: MOTOR_VERSION,
    peligro: VERSION_REGLA_PELIGRO,
    episodios: EPISODIOS_REGLA_VERSION,
  }

  if (formato === 'csv') {
    return new Response(aCsv(conteos), {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'text/csv; charset=utf-8',
      },
    })
  }

  return Response.json(
    {
      zonaHorariaDatos: ZONA_HORARIA_DATOS,
      zonaHorariaArgentinaDocumentada: ZONA_HORARIA_ARGENTINA_DOCUMENTADA,
      versionReglas,
      cobertura,
      cuadros: conteos,
      siguienteDesde: resultado.siguienteDesde,
    },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
