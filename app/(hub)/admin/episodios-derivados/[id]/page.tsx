import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { infraEpisodioDerivado, infraEpisodioMiembro } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { episodiosDerivadosEnabled } from '@/lib/infraestructura/episodios-derivados/flags'
import { replayEnabled } from '@/lib/infraestructura/riesgo/flags'
import { hrefReplayEpisodio } from '@/components/mapas/replay-link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Igual que /admin/episodios-derivados: esta vista la gobierna
// EPISODIOS_DERIVADOS_ENABLED (episodiosDerivadosEnabled()), no
// RISK_ENGINE_ENABLED de E0 ni HAZARD_CONTEXT_ENABLED de E2.
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
const enlace: React.CSSProperties = { color: 'var(--ink)' }
const definicion: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: '0.25rem 1rem',
  margin: 0,
}
const parametros: React.CSSProperties = {
  margin: 0,
  padding: '0.75rem',
  background: 'var(--fill)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  overflowX: 'auto',
  fontSize: '0.85rem',
}

function etiquetaEstado(estado: string): string {
  if (estado === 'abierto') return 'Abierto'
  if (estado === 'cerrado') return 'Cerrado'
  return estado
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default async function EpisodioDerivadoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') {
    redirect('/login?callbackUrl=/admin/episodios-derivados')
  }
  if (gate === 'forbidden') redirect('/forbidden')

  // Con el flag apagado no se toca infra_episodio_*: ni ensureSeeded() ni consultas.
  if (!episodiosDerivadosEnabled()) {
    return (
      <div style={contenedor}>
        <h1>Episodios derivados</h1>
        <p>Episodios derivados deshabilitado (EPISODIOS_DERIVADOS_ENABLED=false)</p>
      </div>
    )
  }

  await ensureSeeded()

  const { id } = await params
  const db = getDb()

  const [episodio] = await db
    .select()
    .from(infraEpisodioDerivado)
    .where(eq(infraEpisodioDerivado.id, id))
    .limit(1)

  if (!episodio) notFound()

  const miembros = await db
    .select()
    .from(infraEpisodioMiembro)
    .where(eq(infraEpisodioMiembro.episodioDerivadoId, episodio.id))
    .orderBy(asc(infraEpisodioMiembro.primeraAfectacionEn))

  return (
    <div style={contenedor}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1>Episodios derivados · {episodio.unidadId}</h1>
        <p style={{ color: 'var(--ink)' }}>
          Episodio calculado automáticamente a partir de afectaciones
          confirmadas registradas en el parte. Es de solo lectura: no admite
          apertura ni cierre manual.
        </p>
      </header>

      {replayEnabled() && (
        <p>
          <Link href={hrefReplayEpisodio(episodio.id)} style={enlace}>
            Ver replay del episodio
          </Link>
        </p>
      )}

      <section style={bloque}>
        <h2>Encabezado</h2>
        <dl style={definicion}>
          <dt>Departamento</dt>
          <dd style={{ margin: 0 }}>{episodio.unidadId}</dd>
          <dt>Tipo de unidad</dt>
          <dd style={{ margin: 0 }}>{episodio.unidadTipo}</dd>
          <dt>Versión de regla</dt>
          <dd style={{ margin: 0 }}>{episodio.reglaVersion}</dd>
          <dt>Estado</dt>
          <dd style={{ margin: 0 }}>{etiquetaEstado(episodio.estado)}</dd>
          <dt>Inicio</dt>
          <dd style={{ margin: 0 }}>{formatearFecha(episodio.inicioEn)}</dd>
          <dt>Fin</dt>
          <dd style={{ margin: 0 }}>
            {episodio.finEn === null ? '—' : formatearFecha(episodio.finEn)}
          </dd>
          <dt>Escuelas afectadas</dt>
          <dd style={{ margin: 0 }}>{episodio.escuelasAfectadas}</dd>
          <dt>Calculado en</dt>
          <dd style={{ margin: 0 }}>{formatearFecha(episodio.calculadoEn)}</dd>
        </dl>
      </section>

      <section style={bloque}>
        <h2>Parámetros</h2>
        <pre style={parametros}>{JSON.stringify(episodio.parametros, null, 2)}</pre>
      </section>

      <section style={bloque}>
        <h2>Escuelas afectadas</h2>
        {miembros.length === 0 ? (
          <p>Sin escuelas registradas para este episodio</p>
        ) : (
          <table style={tabla}>
            <thead>
              <tr>
                <th style={celda}>CUE-anexo</th>
                <th style={celda}>Primera afectación</th>
                <th style={celda}>Recuperado</th>
                <th style={celda}>Movimiento vinculado</th>
              </tr>
            </thead>
            <tbody>
              {miembros.map((miembro) => (
                <tr key={miembro.id}>
                  <td style={celda}>{miembro.cueAnexo}</td>
                  <td style={celda}>
                    {formatearFecha(miembro.primeraAfectacionEn)}
                  </td>
                  <td style={celda}>
                    {miembro.recuperadoEn === null
                      ? '—'
                      : formatearFecha(miembro.recuperadoEn)}
                  </td>
                  <td style={celda}>{miembro.movimientoId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Link href="/admin/episodios-derivados" style={enlace}>
        Volver a la lista
      </Link>
    </div>
  )
}
