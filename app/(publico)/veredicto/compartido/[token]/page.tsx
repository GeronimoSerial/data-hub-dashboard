import type { Metadata } from 'next'
import { VeredictoPublico } from '@/components/veredicto/veredicto-publico'
import { getDb } from '@/lib/db'
import { aDtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import { resolverEnlace } from '@/lib/infraestructura/veredicto/enlaces'
import { fechaArt } from '@/lib/infraestructura/veredicto/dia'
import { listarVigentes } from '@/lib/infraestructura/veredicto/repositorio'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

function ddMm(venceEn: string): string {
  const [, mes, dia] = fechaArt(new Date(venceEn)).split('-')
  return `${dia}/${mes}`
}

export default async function PaginaVeredictoCompartido({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const enlace = await resolverEnlace(getDb(), token)

  if (enlace.estado === 'inexistente') {
    return (
      <section>
        <h1>Enlace no disponible</h1>
        <p>Este enlace no existe.</p>
      </section>
    )
  }
  if (enlace.estado === 'vencido') {
    return (
      <section>
        <h1>Enlace no disponible</h1>
        <p>
          Este enlace venció el {ddMm(enlace.venceEn)} a las 23:59 o fue revocado. Solicite un enlace
          nuevo al equipo operativo.
        </p>
      </section>
    )
  }
  if (enlace.estado === 'revocado') {
    return (
      <section>
        <h1>Enlace no disponible</h1>
        <p>Este enlace fue revocado. Solicite un enlace nuevo al equipo operativo.</p>
      </section>
    )
  }

  const filas = await listarVigentes(getDb(), { desde: enlace.desde, hasta: enlace.hasta })
  const veredictos = filas.map((fila) => aDtoVeredicto(fila, null))

  return (
    <>
      <VeredictoPublico veredictos={veredictos} />
      <p>
        <a href={`/api/veredicto/compartido/${token}/pdf`}>Descargar PDF</a>
      </p>
    </>
  )
}
