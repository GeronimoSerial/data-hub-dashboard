import { getDb } from '@/lib/db'
import { aDtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import { resolverEnlace } from '@/lib/infraestructura/veredicto/enlaces'
import { generarPdfVeredictos } from '@/lib/infraestructura/veredicto/pdf'
import { listarVigentes } from '@/lib/infraestructura/veredicto/repositorio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Ruta pública: no hay sesión. Sin datos para enlaces inexistentes, vencidos o revocados.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const enlace = await resolverEnlace(getDb(), token)

  if (enlace.estado === 'inexistente') {
    return Response.json({ error: 'Enlace no encontrado' }, { status: 404 })
  }
  if (enlace.estado !== 'valido') {
    return Response.json({ error: 'Enlace vencido o revocado' }, { status: 410 })
  }

  const filas = await listarVigentes(getDb(), { desde: enlace.desde, hasta: enlace.hasta })
  const bytes = await generarPdfVeredictos({
    veredictos: filas.map((fila) => aDtoVeredicto(fila, null)),
    generadoEn: new Date(),
  })
  return new Response(bytes.slice(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="veredicto-${enlace.desde}-a-${enlace.hasta}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
