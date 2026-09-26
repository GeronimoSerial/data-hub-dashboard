import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { listarEpisodios, type EpisodioRow } from '@/lib/infraestructura/episodios'
import { PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { EpisodioCrearForm } from '@/components/infraestructura/episodio-crear-form'

// UI de operador (staff) para episodios del batch E1: lista abiertos y
// cerrados y permite crear uno nuevo. Mismo gate y estética inline que
// app/(hub)/admin/operacion/page.tsx.
const contenedor: React.CSSProperties = { padding: '2rem', color: 'var(--ink)' }
const bloque: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '1rem',
  marginBottom: '1.5rem',
  background: 'var(--fill)',
}
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
const celda: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem',
  borderBottom: '1px solid var(--line)',
}
const enlace: React.CSSProperties = { color: 'var(--accent)' }

function TablaEpisodios({ episodios }: { episodios: EpisodioRow[] }) {
  if (episodios.length === 0) {
    return <p style={{ color: 'var(--ink-soft)' }}>Sin episodios.</p>
  }
  return (
    <table style={tabla}>
      <thead>
        <tr>
          <th style={celda}>nombre</th>
          <th style={celda}>estado</th>
          <th style={celda}>abiertoEn</th>
          <th style={celda}>cerradoEn</th>
        </tr>
      </thead>
      <tbody>
        {episodios.map((episodio) => (
          <tr key={episodio.id}>
            <td style={celda}>
              <Link href={`/admin/episodios/${episodio.id}`} style={enlace}>
                {episodio.nombre}
              </Link>
            </td>
            <td style={celda}>{episodio.estado}</td>
            <td style={celda}>{episodio.abiertoEn}</td>
            <td style={celda}>{episodio.cerradoEn ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default async function EpisodiosAdmin() {
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin/episodios')
  if (gate === 'forbidden') redirect('/forbidden')

  const [abiertos, cerrados] = await Promise.all([
    listarEpisodios({ estado: 'abierto' }),
    listarEpisodios({ estado: 'cerrado' }),
  ])

  return (
    <div style={contenedor}>
      <h1>Episodios</h1>

      <section style={bloque}>
        <h2>Nuevo episodio</h2>
        <EpisodioCrearForm periodoId={PERIODO_ENOS_2026_2027_ID} />
      </section>

      <section style={bloque}>
        <h2>Abiertos</h2>
        <TablaEpisodios episodios={abiertos} />
      </section>

      <section style={bloque}>
        <h2>Cerrados</h2>
        <TablaEpisodios episodios={cerrados} />
      </section>
    </div>
  )
}
