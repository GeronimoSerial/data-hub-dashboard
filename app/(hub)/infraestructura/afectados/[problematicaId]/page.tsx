import { notFound, redirect } from 'next/navigation'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import { puedeVerNominal } from '@/lib/infraestructura/permiso-nominal'
import { consultarYRegistrarAfectados } from '@/lib/infraestructura/identidad'

export const runtime = 'nodejs'

// Esta ruta NO cuelga de /mapas/: isAllowedRuta() la rechaza (ver
// lib/recurso-write.test.ts), así que no puede registrarse como recurso del
// catálogo aunque alguien lo intente. Se llega únicamente por el enlace
// condicional en ficha-alerta.tsx, y su protección es propia: verifica
// puedeVerNominal() acá, sin heredar nada del mapa.
export default async function AfectadosPage({
  params,
}: {
  params: Promise<{ problematicaId: string }>
}) {
  await ensureSeeded()
  const { problematicaId } = await params

  const user = await getSessionUser()
  if (!user) {
    redirect(`/login?callbackUrl=/infraestructura/afectados/${problematicaId}`)
  }

  const ahora = new Date()
  const autorizado = await puedeVerNominal(user, ahora)
  if (!autorizado) redirect('/forbidden')

  const client = getDb().$client
  const resultado = await consultarYRegistrarAfectados(client, user.id, problematicaId, ahora)
  if (!resultado) notFound()

  return (
    <main style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <h1>Alcance nominal</h1>
      <p>
        {resultado.cantidad === 1
          ? '1 alumno alcanzado por esta alerta.'
          : `${resultado.cantidad} alumnos alcanzados por esta alerta.`}
      </p>
      {resultado.secciones.map((seccion) => (
        <section key={seccion.geSectionId} style={{ marginTop: '1.5rem' }}>
          <h2>
            {seccion.curso} {seccion.division} · {seccion.turno}
          </h2>
          {seccion.alumnos.length === 0 ? (
            <p>Sin identidad importada para esta sección.</p>
          ) : (
            <ul>
              {seccion.alumnos.map((alumno, index) => (
                <li key={index}>
                  {alumno.apellido}, {alumno.nombre}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  )
}
