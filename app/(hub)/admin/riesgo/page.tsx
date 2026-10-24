import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { getDb } from '@/lib/db'
import {
  infraGeoProfile,
  infraRiskRun,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { riskEngineEnabled } from '@/lib/infraestructura/riesgo/flags'
import { ETIQUETA_CONFIANZA, ETIQUETA_NIVEL, etiqueta } from '@/lib/infraestructura/riesgo/etiquetas'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Esta UI (ranking interno del motor de riesgo v0) la gobierna
// RISK_ENGINE_ENABLED a través de riskEngineEnabled(). No confundir con
// hazardContextEnabled() (HAZARD_CONTEXT_ENABLED), que pertenece a otro batch
// (E2) y no tiene nada que ver con esta vista.
const HORIZONTES = [24, 72, 240] as const
type Horizonte = (typeof HORIZONTES)[number]
const PAGE_SIZE = 50


// El horizonte sólo admite 24|72|240; cualquier otra cosa cae a 24 en
// silencio: es un panel interno, no un endpoint público al que haya que
// devolverle un 400 descriptivo.
function parseHorizonte(raw: string | undefined): Horizonte {
  const n = Number(raw)
  return (HORIZONTES as readonly number[]).includes(n) ? (n as Horizonte) : 24
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

function indice(valor: number | null): string {
  return valor === null ? '—' : valor.toFixed(2)
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString()
}

// Motivo breve legible sin jerga: nunca un porcentaje y nunca la palabra
// "daño confirmado"; los scores se muestran como índices de referencia.
function motivoBreve(
  evidenciaValida: boolean,
  scoreAmenaza: number | null,
  scoreVulnerabilidad: number | null,
): string {
  if (!evidenciaValida) return 'Sin evidencia de amenaza para este horizonte'
  return `Amenaza ${indice(scoreAmenaza)} × vulnerabilidad ${indice(scoreVulnerabilidad)} (índices)`
}

function hrefPagina(
  page: number,
  horizonte: Horizonte,
  departamento: string | undefined,
): string {
  const params = new URLSearchParams({ horizonte: String(horizonte) })
  if (departamento) params.set('departamento', departamento)
  if (page > 1) params.set('page', String(page))
  return `/admin/riesgo?${params.toString()}`
}

function hrefHorizonte(horizonte: Horizonte, departamento: string | undefined): string {
  return hrefPagina(1, horizonte, departamento)
}

export default async function RiesgoModoEvaluacionPage({
  searchParams,
}: {
  searchParams: Promise<{
    horizonte?: string
    departamento?: string
    page?: string
  }>
}) {
  await requireServerHubPageAccess('/admin/riesgo', 'infrastructure')
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin/riesgo')
  if (gate === 'forbidden') redirect('/forbidden')

  // Con el flag apagado no se toca infra_risk_*: ni ensureSeeded() ni consultas.
  if (!riskEngineEnabled()) {
    return (
      <div className="admin-page">
        <h1>Riesgo</h1>
        <p>Motor de riesgo deshabilitado (RISK_ENGINE_ENABLED=false)</p>
      </div>
    )
  }

  await ensureSeeded()

  const params = await searchParams
  const horizonte = parseHorizonte(params.horizonte)
  const departamento = params.departamento?.trim() || undefined
  const page = parsePage(params.page)

  const db = getDb()
  const [runVigente] = await db
    .select()
    .from(infraRiskRun)
    .where(eq(infraRiskRun.estado, 'vigente'))
    .limit(1)

  const encabezado = (
    <header className="admin-page__header">
      <h1>Riesgo</h1>
      <p className="page-intro">
        Modo de evaluacion (en sombra) — motor de riesgo v0. Este ranking es
        interno, no reemplaza el parte escolar ni implica una decision
        automatica.
      </p>
      <nav className="admin-filters" aria-label="Horizonte">
        {HORIZONTES.map((h) => (
          <Link
            key={h}
            href={hrefHorizonte(h, departamento)}
            className={h === horizonte ? 'admin-filter is-active' : 'admin-filter'}
          >
            {h} h
          </Link>
        ))}
      </nav>
    </header>
  )

  // Estado legítimo: el motor todavía no publicó ningún corte. No es un error.
  if (!runVigente) {
    return (
      <div className="admin-page">
        {encabezado}
        <p>Todavia no hay un corte publicado por el motor de riesgo</p>
      </div>
    )
  }

  const condiciones = [
    eq(infraRiskSnapshot.runId, runVigente.id),
    eq(infraRiskSnapshot.horizonteHoras, horizonte),
  ]
  if (departamento !== undefined) {
    condiciones.push(eq(infraGeoProfile.departamento, departamento))
  }
  const where = and(...condiciones)

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(infraRiskSnapshot)
    .innerJoin(
      infraGeoProfile,
      eq(infraRiskSnapshot.cueAnexo, infraGeoProfile.cueAnexo),
    )
    .where(where)
  const total = Number(countRow?.count ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const items = await db
    .select({
      snapshotId: infraRiskSnapshot.id,
      cueAnexo: infraRiskSnapshot.cueAnexo,
      departamento: infraGeoProfile.departamento,
      horizonteHoras: infraRiskSnapshot.horizonteHoras,
      evidenciaValida: infraRiskSnapshot.evidenciaValida,
      nivelRiesgo: infraRiskSnapshot.nivelRiesgo,
      scoreAmenaza: infraRiskSnapshot.scoreAmenaza,
      scoreVulnerabilidad: infraRiskSnapshot.scoreVulnerabilidad,
      confianza: infraRiskSnapshot.confianza,
      calculadoEn: infraRiskSnapshot.calculadoEn,
    })
    .from(infraRiskSnapshot)
    .innerJoin(
      infraGeoProfile,
      eq(infraRiskSnapshot.cueAnexo, infraGeoProfile.cueAnexo),
    )
    .where(where)
    // NULLS LAST explícito: mismo ranking que la API (peor score primero,
    // escuelas sin evidencia — scoreRiesgo null — al final), sin depender del
    // default de Postgres.
    .orderBy(sql`${infraRiskSnapshot.scoreRiesgo} desc nulls last`)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  return (
    <div className="admin-page">
      {encabezado}

      <section className="admin-panel">
        {items.length === 0 ? (
          <p>Sin escuelas para este horizonte{departamento ? ' y departamento' : ''}</p>
        ) : (
          <div className="ui-table-wrap"><table className="ui-table">
            <thead>
              <tr>
                <th>Escuela</th>
                <th>Departamento</th>
                <th>Nivel</th>
                <th>Motivo breve</th>
                <th>Confianza</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.snapshotId}>
                  <td>
                    <Link
                      href={`/admin/riesgo/${item.snapshotId}`}
                      className="admin-link"
                    >
                      {item.cueAnexo}
                    </Link>
                  </td>
                  <td>{item.departamento ?? '—'}</td>
                  <td>
                    {etiqueta(ETIQUETA_NIVEL, item.nivelRiesgo)}
                  </td>
                  <td>
                    {motivoBreve(
                      item.evidenciaValida,
                      item.scoreAmenaza,
                      item.scoreVulnerabilidad,
                    )}
                  </td>
                  <td>{etiqueta(ETIQUETA_CONFIANZA, item.confianza)}</td>
                  <td>{formatearFecha(item.calculadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {totalPages > 1 && (
        <nav className="admin-filters" aria-label="Paginacion">
          {page > 1 && (
            <Link
              href={hrefPagina(page - 1, horizonte, departamento)}
              className="admin-link"
            >
              Anterior
            </Link>
          )}
          <span className="ui-hint">
            Página {page} de {totalPages} ({total} escuelas)
          </span>
          {page < totalPages && (
            <Link
              href={hrefPagina(page + 1, horizonte, departamento)}
              className="admin-link"
            >
              Siguiente
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
