import { getDb } from '@/lib/db'
import { aDtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import { idEnlace, resolverEnlace } from '@/lib/infraestructura/veredicto/enlaces'
import { cargarEventosTerreno } from '@/lib/infraestructura/veredicto/eventos-terreno'
import { generarPdfVeredictos } from '@/lib/infraestructura/veredicto/pdf'
import { listarVigentes } from '@/lib/infraestructura/veredicto/repositorio'
import { crearLimitador } from '@/lib/http/limitador'
import { ruta } from '@/lib/http/ruta'
import { actorAuditoria, describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'

export const runtime = 'nodejs'

const limitador = crearLimitador({ ventanaMs: 60_000, max: 50 })
export const dynamic = 'force-dynamic'

// Ruta pública: no hay sesión. Sin datos para enlaces inexistentes, vencidos o revocados.
async function handleGET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const enlace = await resolverEnlace(getDb(), token)
  // El actor es el enlace por su id; nunca el token ni la URL.
  if (enlace.estado !== 'inexistente') {
    actorAuditoria({ actorTipo: 'enlace', actorId: await idEnlace(getDb(), token), actorRol: null, viaAcceso: 'enlace' })
  }
  describirAuditoria({ objetoTipo: 'enlace_veredicto' })

  if (enlace.estado === 'inexistente') {
    return Response.json({ error: 'Enlace no encontrado' }, { status: 404 })
  }
  if (enlace.estado !== 'valido') {
    return Response.json({ error: 'Enlace vencido o revocado' }, { status: 410 })
  }

  const filas = await listarVigentes(getDb(), { desde: enlace.desde, hasta: enlace.hasta })
  const eventos = await cargarEventosTerreno({ desde: enlace.desde, hasta: enlace.hasta })
  const bytes = await generarPdfVeredictos({
    veredictos: filas.map((fila) => aDtoVeredicto(fila, null)),
    generadoEn: new Date(),
    eventos,
  })
  describirAuditoria({ metadatos: { formato: 'pdf', cantidad: filas.length } })
  return new Response(bytes.slice(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="veredicto-${enlace.desde}-a-${enlace.hasta}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}

export const GET = conAuditoria(
  'enlace.pdf',
  '/api/veredicto/compartido/[token]/pdf',
  ruta('veredicto.compartido.token.pdf.get', handleGET, { limite: { limitador } }),
)
