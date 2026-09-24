import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { obtenerEstadoOperativo } from '@/lib/infraestructura/riesgo/salud'

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
const alerta: React.CSSProperties = { ...celda, color: 'var(--danger)' }

export default async function OperacionSalud() {
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin/operacion')
  if (gate === 'forbidden') redirect('/forbidden')

  const estado = await obtenerEstadoOperativo()

  return (
    <div style={contenedor}>
      <h1>Operación</h1>

      <section style={bloque}>
        <h2>Flags</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li>riskEngineEnabled: {String(estado.flags.riskEngineEnabled)}</li>
          <li>riskRadarEnabled: {String(estado.flags.riskRadarEnabled)}</li>
          <li>aiBriefingEnabled: {String(estado.flags.aiBriefingEnabled)}</li>
          <li>riskMode: {estado.flags.riskMode}</li>
        </ul>
      </section>

      <section style={bloque}>
        <h2>Jobs</h2>
        {estado.jobs.length === 0 ? (
          <p>Sin ejecuciones registradas todavía</p>
        ) : (
          <table style={tabla}>
            <thead>
              <tr>
                <th style={celda}>tipo</th>
                <th style={celda}>estado</th>
                <th style={celda}>intento</th>
                <th style={celda}>actualizadaEn</th>
                <th style={celda}>errorSaneado</th>
              </tr>
            </thead>
            <tbody>
              {estado.jobs.map((job) => {
                const resaltado = job.leaseVencido || job.estado === 'fallido'
                const estilo = resaltado ? alerta : celda
                return (
                  <tr key={job.tipo}>
                    <td style={estilo}>{job.tipo}</td>
                    <td style={estilo}>{job.estado}</td>
                    <td style={estilo}>{job.intento}</td>
                    <td style={estilo}>{job.actualizadaEn}</td>
                    <td style={estilo}>{job.errorSaneado ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <p style={{ color: 'var(--ink-soft)' }}>Generado en: {estado.generadoEn}</p>
    </div>
  )
}
