import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq, getTableColumns } from 'drizzle-orm'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { infraRiskFactor, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { riskEngineEnabled } from '@/lib/infraestructura/riesgo/flags'
import { ETIQUETA_CONFIANZA, ETIQUETA_NIVEL, ETIQUETA_TIPO_FACTOR, etiqueta } from '../etiquetas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Igual que /admin/riesgo: esta vista la gobierna RISK_ENGINE_ENABLED
// (riskEngineEnabled()), no hazardContextEnabled() de E2.
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
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin/riesgo')
  if (gate === 'forbidden') redirect('/forbidden')

  // Con el flag apagado no se toca infra_risk_*.
  if (!riskEngineEnabled()) {
    return (
      <div style={contenedor}>
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
      <div style={contenedor}>
        <h1>Riesgo</h1>
        <p>Snapshot no encontrado</p>
        <Link href="/admin/riesgo" style={enlace}>
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
    <div style={contenedor}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1>Riesgo · {snapshot.cueAnexo}</h1>
        <p style={{ color: 'var(--ink)' }}>
          Modo de evaluacion (en sombra) — motor de riesgo v0. Este detalle es
          interno, no reemplaza el parte escolar ni implica una decision
          automatica.
        </p>
      </header>

      <section style={bloque}>
        <h2>Encabezado</h2>
        <dl style={definicion}>
          <dt>CUE anexo</dt>
          <dd style={{ margin: 0 }}>{snapshot.cueAnexo}</dd>
          <dt>Horizonte</dt>
          <dd style={{ margin: 0 }}>{snapshot.horizonteHoras} h</dd>
          <dt>Nivel</dt>
          <dd style={{ margin: 0 }}>{etiqueta(ETIQUETA_NIVEL, snapshot.nivelRiesgo)}</dd>
          <dt>Confianza</dt>
          <dd style={{ margin: 0 }}>{etiqueta(ETIQUETA_CONFIANZA, snapshot.confianza)}</dd>
          <dt>Evidencia válida</dt>
          <dd style={{ margin: 0 }}>{snapshot.evidenciaValida ? 'sí' : 'no'}</dd>
          <dt>Calculado en</dt>
          <dd style={{ margin: 0 }}>{formatearFecha(snapshot.calculadoEn)}</dd>
          <dt>Válido hasta</dt>
          <dd style={{ margin: 0 }}>{formatearFecha(snapshot.validoHasta)}</dd>
        </dl>
      </section>

      <section style={bloque}>
        <h2>Factores</h2>
        {factores.length === 0 ? (
          <p>Sin factores registrados para este snapshot</p>
        ) : (
          <table style={tabla}>
            <thead>
              <tr>
                <th style={celda}>Tipo</th>
                <th style={celda}>Fuente</th>
                <th style={celda}>Variable</th>
                <th style={celda}>Valor</th>
                <th style={celda}>Unidad</th>
                <th style={celda}>Contribucion</th>
                <th style={celda}>Peso</th>
                <th style={celda}>Explicacion</th>
                <th style={celda}>Observado en</th>
              </tr>
            </thead>
            <tbody>
              {factores.map((factor) => (
                <tr key={factor.id}>
                  <td style={celda}>{etiqueta(ETIQUETA_TIPO_FACTOR, factor.tipo)}</td>
                  <td style={celda}>{factor.fuente}</td>
                  <td style={celda}>{factor.variable}</td>
                  <td style={celda}>{formatearNumero(factor.valor)}</td>
                  <td style={celda}>{factor.unidad ?? '—'}</td>
                  <td style={celda}>{formatearNumero(factor.contribucion)}</td>
                  <td style={celda}>{formatearNumero(factor.peso)}</td>
                  <td style={celda}>{factor.explicacion}</td>
                  <td style={celda}>
                    {factor.observadoEn === null
                      ? '—'
                      : formatearFecha(factor.observadoEn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Link href="/admin/riesgo" style={enlace}>
        Volver al ranking
      </Link>
    </div>
  )
}
