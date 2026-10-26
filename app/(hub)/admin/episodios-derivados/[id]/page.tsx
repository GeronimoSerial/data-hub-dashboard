import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'
import { getDb } from '@/lib/db'
import { infraEpisodioDerivado, infraEpisodioMiembro } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { episodiosDerivadosEnabled } from '@/lib/infraestructura/episodios-derivados/flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Igual que /admin/episodios-derivados: esta vista la gobierna
// EPISODIOS_DERIVADOS_ENABLED (episodiosDerivadosEnabled()), no
// RISK_ENGINE_ENABLED de E0 ni HAZARD_CONTEXT_ENABLED de E2.

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
  await requireServerHubPageAccess('/admin/episodios-derivados', 'infrastructure')
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') {
    redirect('/login?callbackUrl=/admin/episodios-derivados')
  }
  if (gate === 'forbidden') redirect('/forbidden')

  // Con el flag apagado no se toca infra_episodio_*: ni ensureSeeded() ni consultas.
  if (!episodiosDerivadosEnabled()) {
    return (
      <div className="admin-page">
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
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>Episodios derivados · {episodio.unidadId}</h1>
        <p className="page-intro">
          Episodio calculado automáticamente a partir de afectaciones
          confirmadas registradas en el parte. Es de solo lectura: no admite
          apertura ni cierre manual.
        </p>
      </header>

      <section className="admin-panel">
        <h2>Encabezado</h2>
        <dl className="admin-dl">
          <dt>Departamento</dt>
          <dd>{episodio.unidadId}</dd>
          <dt>Tipo de unidad</dt>
          <dd>{episodio.unidadTipo}</dd>
          <dt>Versión de regla</dt>
          <dd>{episodio.reglaVersion}</dd>
          <dt>Estado</dt>
          <dd>{etiquetaEstado(episodio.estado)}</dd>
          <dt>Inicio</dt>
          <dd>{formatearFecha(episodio.inicioEn)}</dd>
          <dt>Fin</dt>
          <dd>
            {episodio.finEn === null ? '—' : formatearFecha(episodio.finEn)}
          </dd>
          <dt>Escuelas afectadas</dt>
          <dd>{episodio.escuelasAfectadas}</dd>
          <dt>Calculado en</dt>
          <dd>{formatearFecha(episodio.calculadoEn)}</dd>
        </dl>
      </section>

      <section className="admin-panel">
        <h2>Parámetros</h2>
        <pre className="admin-params">{JSON.stringify(episodio.parametros, null, 2)}</pre>
      </section>

      <section className="admin-panel">
        <h2>Escuelas afectadas</h2>
        {miembros.length === 0 ? (
          <p>Sin escuelas registradas para este episodio</p>
        ) : (
          <div className="ui-table-wrap"><table className="ui-table">
            <thead>
              <tr>
                <th>CUE-anexo</th>
                <th>Primera afectación</th>
                <th>Recuperado</th>
                <th>Movimiento vinculado</th>
              </tr>
            </thead>
            <tbody>
              {miembros.map((miembro) => (
                <tr key={miembro.id}>
                  <td>{miembro.cueAnexo}</td>
                  <td>
                    {formatearFecha(miembro.primeraAfectacionEn)}
                  </td>
                  <td>
                    {miembro.recuperadoEn === null
                      ? '—'
                      : formatearFecha(miembro.recuperadoEn)}
                  </td>
                  <td>{miembro.movimientoId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <Link href="/admin/episodios-derivados" className="admin-link">
        Volver a la lista
      </Link>
    </div>
  )
}
