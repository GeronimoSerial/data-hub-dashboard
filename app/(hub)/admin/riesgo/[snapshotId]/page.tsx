import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq, getTableColumns } from 'drizzle-orm'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'
import { getDb } from '@/lib/db'
import { infraRiskFactor, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { riskEngineEnabled } from '@/lib/infraestructura/riesgo/flags'
import {
  ETIQUETA_CONFIANZA,
  ETIQUETA_NIVEL,
  ETIQUETA_TIPO_FACTOR,
  etiqueta,
} from '@/lib/infraestructura/riesgo/etiquetas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Igual que /admin/riesgo: esta vista la gobierna RISK_ENGINE_ENABLED
// (riskEngineEnabled()), no hazardContextEnabled() de E2.

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString()
}

function formatearNumero(valor: number | null): string {
  return valor === null ? '—' : String(valor)
}

export default async function RiesgoSnapshotPage({
  params,
}: {
  params: Promise<{ snapshotId: string }>
}) {
  await requireServerHubPageAccess('/admin/riesgo', 'infrastructure')
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin/riesgo')
  if (gate === 'forbidden') redirect('/forbidden')

  // Con el flag apagado no se toca infra_risk_*.
  if (!riskEngineEnabled()) {
    return (
      <div className="admin-page">
        <h1>Riesgo</h1>
        <p>Motor de riesgo deshabilitado (RISK_ENGINE_ENABLED=false)</p>
      </div>
    )
  }

  await ensureSeeded()

  const { snapshotId } = await params
  const db = getDb()

  // Mismo criterio que el endpoint de detalle: sólo se muestra un snapshot si
  // pertenece al run vigente. Un id de otro run (o inexistente) cae al mismo
  // mensaje, sin revelar el estado interno de otros runs.
  const [snapshot] = await db
    .select(getTableColumns(infraRiskSnapshot))
    .from(infraRiskSnapshot)
    .innerJoin(infraRiskRun, eq(infraRiskSnapshot.runId, infraRiskRun.id))
    .where(
      and(
        eq(infraRiskSnapshot.id, snapshotId),
        eq(infraRiskRun.estado, 'vigente'),
      ),
    )
    .limit(1)

  // Sin 404 duro: es un panel interno y un mensaje de texto alcanza.
  if (!snapshot) {
    return (
      <div className="admin-page">
        <h1>Riesgo</h1>
        <p>Snapshot no encontrado</p>
        <Link href="/admin/riesgo" className="admin-link">
          Volver al ranking
        </Link>
      </div>
    )
  }

  const factores = await db
    .select()
    .from(infraRiskFactor)
    .where(eq(infraRiskFactor.snapshotId, snapshot.id))

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>Riesgo · {snapshot.cueAnexo}</h1>
        <p className="page-intro">
          Modo de evaluacion (en sombra) — motor de riesgo v0. Este detalle es
          interno, no reemplaza el parte escolar ni implica una decision
          automatica.
        </p>
      </header>

      <section className="admin-panel">
        <h2>Encabezado</h2>
        <dl className="admin-dl">
          <dt>CUE anexo</dt>
          <dd>{snapshot.cueAnexo}</dd>
          <dt>Horizonte</dt>
          <dd>{snapshot.horizonteHoras} h</dd>
          <dt>Nivel</dt>
          <dd>{etiqueta(ETIQUETA_NIVEL, snapshot.nivelRiesgo)}</dd>
          <dt>Confianza</dt>
          <dd>{etiqueta(ETIQUETA_CONFIANZA, snapshot.confianza)}</dd>
          <dt>Evidencia válida</dt>
          <dd>{snapshot.evidenciaValida ? 'sí' : 'no'}</dd>
          <dt>Calculado en</dt>
          <dd>{formatearFecha(snapshot.calculadoEn)}</dd>
          <dt>Válido hasta</dt>
          <dd>{formatearFecha(snapshot.validoHasta)}</dd>
        </dl>
      </section>

      <section className="admin-panel">
        <h2>Factores</h2>
        {factores.length === 0 ? (
          <p>Sin factores registrados para este snapshot</p>
        ) : (
          <div className="ui-table-wrap"><table className="ui-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Fuente</th>
                <th>Variable</th>
                <th>Valor</th>
                <th>Unidad</th>
                <th>Contribucion</th>
                <th>Peso</th>
                <th>Explicacion</th>
                <th>Observado en</th>
              </tr>
            </thead>
            <tbody>
              {factores.map((factor) => (
                <tr key={factor.id}>
                  <td>{etiqueta(ETIQUETA_TIPO_FACTOR, factor.tipo)}</td>
                  <td>{factor.fuente}</td>
                  <td>{factor.variable}</td>
                  <td>{formatearNumero(factor.valor)}</td>
                  <td>{factor.unidad ?? '—'}</td>
                  <td>{formatearNumero(factor.contribucion)}</td>
                  <td>{formatearNumero(factor.peso)}</td>
                  <td>{factor.explicacion}</td>
                  <td>
                    {factor.observadoEn === null
                      ? '—'
                      : formatearFecha(factor.observadoEn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <Link href="/admin/riesgo" className="admin-link">
        Volver al ranking
      </Link>
    </div>
  )
}
