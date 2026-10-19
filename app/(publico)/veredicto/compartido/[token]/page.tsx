import type { Metadata } from 'next'
import { lecturaAuditada } from '@/lib/infraestructura/auditoria/servidor'
import { VeredictoPublico } from '@/components/veredicto/veredicto-publico'
import { getDb } from '@/lib/db'
import { aDtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import { resolverEnlace } from '@/lib/infraestructura/veredicto/enlaces'
import { cargarEventosTerreno } from '@/lib/infraestructura/veredicto/eventos-terreno'
import { fechaArt } from '@/lib/infraestructura/veredicto/dia'
import { listarVigentes } from '@/lib/infraestructura/veredicto/repositorio'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

function ddMm(venceEn: string): string {
  const [, mes, dia] = fechaArt(new Date(venceEn)).split('-')
  return `${dia}/${mes}`
}

export default async function PaginaVeredictoCompartido({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const enlace = await lecturaAuditada('enlace.consultar', '/veredicto/compartido/[token]',
    () => resolverEnlace(getDb(), token),
    enlace => ({ status: enlace.estado === 'valido' ? 200 : enlace.estado === 'inexistente' ? 404 : 410 }))

  if (enlace.estado === 'inexistente') {
    return (
      <section className="veredicto-publico">
        <div className="veredicto-publico__contenido">
          <h1>Enlace no disponible</h1>
          <p>Este enlace no existe.</p>
        </div>
      </section>
    )
  }
  if (enlace.estado === 'vencido') {
    return (
      <section className="veredicto-publico">
        <div className="veredicto-publico__contenido">
          <h1>Enlace no disponible</h1>
          <p>
            Este enlace venció el {ddMm(enlace.venceEn)} a las 23:59 o fue revocado. Solicite un enlace nuevo al equipo
            operativo.
          </p>
        </div>
      </section>
    )
  }
  if (enlace.estado === 'revocado') {
    return (
      <section className="veredicto-publico">
        <div className="veredicto-publico__contenido">
          <h1>Enlace no disponible</h1>
          <p>Este enlace fue revocado. Solicite un enlace nuevo al equipo operativo.</p>
        </div>
      </section>
    )
  }

  const filas = await listarVigentes(getDb(), {
    desde: enlace.desde,
    hasta: enlace.hasta,
  })
  const veredictos = filas.map((fila) => aDtoVeredicto(fila, null))
  const eventos = await cargarEventosTerreno({ desde: enlace.desde, hasta: enlace.hasta })

  return (
    <>
      <VeredictoPublico veredictos={veredictos} eventos={eventos} />
      <p>
        <a href={`/api/veredicto/compartido/${token}/pdf`} className="ui-button ui-button--secondary">
          Descargar PDF
        </a>
      </p>
    </>
  )
}
