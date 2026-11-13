import { ensureSeeded } from '@/lib/db/seed'
import { getDb } from '@/lib/db'
import { aDtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import { fechasVentana } from '@/lib/infraestructura/veredicto/entradas'
import { cargarEventosTerreno } from '@/lib/infraestructura/veredicto/eventos-terreno'
import { generarPdfVeredictos } from '@/lib/infraestructura/veredicto/pdf'
import { listarVigentes } from '@/lib/infraestructura/veredicto/repositorio'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { getSessionUser, staffGuard } from '@/lib/session'
import { crearLimitador } from '@/lib/http/limitador'
import { ruta } from '@/lib/http/ruta'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_DIAS = 31
const UN_DIA_MS = 86_400_000

const CABECERAS_ERROR = { 'Cache-Control': 'private, no-store' }

function esFechaValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const ms = Date.parse(`${valor}T00:00:00Z`)
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === valor
}

const limitador = crearLimitador({ ventanaMs: 60_000, max: 50 })

async function handleGET(request: Request) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  await ensureSeeded()

  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  const params = new URL(request.url).searchParams
  const ventana = fechasVentana(new Date())
  const desde = params.get('desde') ?? ventana[0]!.fecha
  const hasta = params.get('hasta') ?? ventana[ventana.length - 1]!.fecha

  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    return jsonError('desde y hasta deben tener formato YYYY-MM-DD válido', 400, CABECERAS_ERROR)
  }
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / UN_DIA_MS + 1
  if (dias < 1) {
    return jsonError('desde no puede ser posterior a hasta', 400, CABECERAS_ERROR)
  }
  if (dias > MAX_DIAS) {
    return jsonError(`El rango no puede superar ${MAX_DIAS} días`, 400, CABECERAS_ERROR)
  }

  const filas = await listarVigentes(getDb(), { desde, hasta })
  const eventos = await cargarEventosTerreno({ desde, hasta })
  const bytes = await generarPdfVeredictos({
    veredictos: filas.map((fila) => aDtoVeredicto(fila, null)),
    generadoEn: new Date(),
    eventos,
  })
  describirAuditoria({ metadatos: { formato: 'pdf', cantidad: filas.length } })
  return new Response(bytes.slice(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="veredicto-${desde}-a-${hasta}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

export const GET = conAuditoria(
  'veredicto.pdf',
  '/api/infraestructura/veredictos/pdf',
  ruta('infraestructura.veredictos.pdf.get', handleGET, { limite: { limitador } }),
)
