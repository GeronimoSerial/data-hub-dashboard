import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq, sql } from 'drizzle-orm'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'
import { getDb } from '@/lib/db'
import { infraEpisodioDerivado } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { episodiosDerivadosEnabled } from '@/lib/infraestructura/episodios-derivados/flags'
import { EPISODIOS_REGLA_VERSION } from '@/lib/infraestructura/episodios-derivados/regla'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Esta UI (lista + detalle de solo lectura) la gobierna EPISODIOS_DERIVADOS_ENABLED
// a través de episodiosDerivadosEnabled(). No confundir con RISK_ENGINE_ENABLED
// (riskEngineEnabled, batch E0) ni con HAZARD_CONTEXT_ENABLED
// (hazardContextEnabled, batch E2), que pertenecen a otras vistas.
const PAGE_SIZE = 50

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
const enlaceActivo: React.CSSProperties = {
  ...enlace,
  fontWeight: 700,
  textDecoration: 'underline',
}
const tenue: React.CSSProperties = { color: 'var(--ink-soft)', fontSize: 'var(--t-micro)' }

// La regla v0.1 sólo emite 'abierto' | 'cerrado'. Cualquier otro valor se
// muestra tal cual: es un panel interno, no un endpoint público.
function etiquetaEstado(estado: string): string {
  if (estado === 'abierto') return 'Abierto'
  if (estado === 'cerrado') return 'Cerrado'
  return estado
}

// El estado sólo admite 'abierto' | 'cerrado'; cualquier otra cosa se ignora
// en silencio (sin filtro), mismo criterio que el panel de riesgo.
function parseEstado(raw: string | undefined): string | undefined {
  if (raw === 'abierto' || raw === 'cerrado') return raw
  return undefined
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString()
}

function hrefPagina(
  page: number,
  estado: string | undefined,
  departamento: string | undefined,
): string {
  const params = new URLSearchParams()
  if (estado) params.set('estado', estado)
  if (departamento) params.set('departamento', departamento)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/admin/episodios-derivados?${qs}` : '/admin/episodios-derivados'
}

function hrefEstado(
  estado: string | undefined,
  departamento: string | undefined,
): string {
  return hrefPagina(1, estado, departamento)
}

export default async function EpisodiosDerivadosPage({
  searchParams,
}: {
  searchParams: Promise<{
    estado?: string
    departamento?: string
    page?: string
  }>
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
      <div style={contenedor}>
        <h1>Episodios derivados</h1>
        <p>Episodios derivados deshabilitado (EPISODIOS_DERIVADOS_ENABLED=false)</p>
      </div>
    )
  }

  await ensureSeeded()

  const params = await searchParams
  const estado = parseEstado(params.estado)
  const departamento = params.departamento?.trim() || undefined
  const page = parsePage(params.page)

  const condiciones = [
    eq(infraEpisodioDerivado.reglaVersion, EPISODIOS_REGLA_VERSION),
  ]
  if (estado !== undefined) condiciones.push(eq(infraEpisodioDerivado.estado, estado))
  if (departamento !== undefined) {
    condiciones.push(eq(infraEpisodioDerivado.unidadId, departamento))
  }
  const where = condiciones.length > 0 ? and(...condiciones) : undefined

  const db = getDb()

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(infraEpisodioDerivado)
    .where(where)
  const total = Number(countRow?.count ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const items = await db
    .select()
    .from(infraEpisodioDerivado)
    .where(where)
    .orderBy(desc(infraEpisodioDerivado.inicioEn))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  const encabezado = (
    <header style={{ marginBottom: '1.5rem' }}>
      <h1>Episodios derivados</h1>
      <p style={{ color: 'var(--ink)' }}>
        Episodios calculados automáticamente a partir de afectaciones
        confirmadas registradas en el parte. No requieren ni admiten apertura o
        cierre manual.
      </p>
      <nav style={{ display: 'flex', gap: '0.75rem' }} aria-label="Estado">
        <Link
          href={hrefEstado('abierto', departamento)}
          style={estado === 'abierto' ? enlaceActivo : enlace}
        >
          Abiertos
        </Link>
        <Link
          href={hrefEstado('cerrado', departamento)}
          style={estado === 'cerrado' ? enlaceActivo : enlace}
        >
          Cerrados
        </Link>
        <Link
          href={hrefEstado(undefined, departamento)}
          style={estado === undefined ? enlaceActivo : enlace}
        >
          Todos
        </Link>
      </nav>
    </header>
  )

  return (
    <div style={contenedor}>
      {encabezado}

      <section style={bloque}>
        {items.length === 0 ? (
          <p>
            Sin episodios derivados
            {estado ? ' para este estado' : ''}
            {departamento ? ' y departamento' : ''}
          </p>
        ) : (
          <table style={tabla}>
            <thead>
              <tr>
                <th style={celda}>Departamento</th>
                <th style={celda}>Estado</th>
                <th style={celda}>Inicio</th>
                <th style={celda}>Fin</th>
                <th style={celda}>Escuelas afectadas</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={celda}>
                    <Link
                      href={`/admin/episodios-derivados/${item.id}`}
                      style={enlace}
                    >
                      {item.unidadId}
                    </Link>
                  </td>
                  <td style={celda}>{etiquetaEstado(item.estado)}</td>
                  <td style={celda}>{formatearFecha(item.inicioEn)}</td>
                  <td style={celda}>
                    {item.finEn === null ? '—' : formatearFecha(item.finEn)}
                  </td>
                  <td style={celda}>{item.escuelasAfectadas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {totalPages > 1 && (
        <nav style={{ display: 'flex', gap: '0.75rem' }} aria-label="Paginacion">
          {page > 1 && (
            <Link
              href={hrefPagina(page - 1, estado, departamento)}
              style={enlace}
            >
              Anterior
            </Link>
          )}
          <span style={tenue}>
            Página {page} de {totalPages} ({total} episodios)
          </span>
          {page < totalPages && (
            <Link
              href={hrefPagina(page + 1, estado, departamento)}
              style={enlace}
            >
              Siguiente
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
