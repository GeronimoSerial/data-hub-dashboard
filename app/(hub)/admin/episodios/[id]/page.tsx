import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { obtenerEpisodio } from '@/lib/infraestructura/episodios'
import { listarVerificaciones } from '@/lib/infraestructura/verificaciones'
import { VerificacionesCola } from '@/components/infraestructura/verificaciones-cola'

// Ficha de un episodio del batch E1 para el operador: datos del episodio y la
// cola de verificaciones (que incluye el cierre del episodio y la creación de
// solicitudes, ambos client-side contra los endpoints). Mismo gate y estética
// inline que app/(hub)/admin/operacion/page.tsx.
const contenedor: React.CSSProperties = { padding: '2rem', color: 'var(--ink)' }
const bloque: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '1rem',
  marginBottom: '1.5rem',
  background: 'var(--fill)',
}

export default async function EpisodioDetalle({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect(`/login?callbackUrl=/admin/episodios/${id}`)
  if (gate === 'forbidden') redirect('/forbidden')

  const episodio = await obtenerEpisodio(id)
  if (!episodio) notFound()

  const verificaciones = await listarVerificaciones({ episodioId: id })

  return (
    <div style={contenedor}>
      <h1>{episodio.nombre}</h1>

      <section style={bloque}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li>Estado: {episodio.estado}</li>
          <li>Período: {episodio.periodoId}</li>
          <li>Abierto en: {episodio.abiertoEn}</li>
          <li>Cerrado en: {episodio.cerradoEn ?? '—'}</li>
          {episodio.descripcion && <li>Descripción: {episodio.descripcion}</li>}
        </ul>
      </section>

      <VerificacionesCola
        episodioId={id}
        verificacionesIniciales={verificaciones}
        episodioAbierto={episodio.estado === 'abierto'}
      />
    </div>
  )
}
