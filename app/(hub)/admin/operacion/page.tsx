import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { evaluarFrescuraFuente, obtenerDatoMasRecienteImerg, obtenerEstadoOperativo, type FrescuraFuente } from '@/lib/infraestructura/riesgo/salud'
import {
  estadoAtrasoJob,
  proximaCorridaEsperada,
  TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB,
} from '@/lib/infraestructura/riesgo/cadencias'
import { getDb } from '@/lib/db'
import { hazardSourceHealth } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { apiKeyDesdeEntorno, obtenerResumenCupo } from '@/lib/infraestructura/riesgo/providers/cupo-om'
import { obtenerAvanceClimatologia } from '@/lib/infraestructura/riesgo/avance-climatologia'
import { listarFlagsOperativas } from '@/lib/infraestructura/riesgo/flags'

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

// Fuera del componente a propósito: `react-hooks/purity` marca `Date.now()`
// llamado directamente en el cuerpo de un componente, aun siendo un Server
// Component async — mismo patrón que ya usa `obtenerEstadoOperativo()`
// (calcula `generadoEn` puertas adentro, no en el JSX).
// IMERG mide la edad del gránulo más reciente (no la de la última corrida del
// job); el resto de las fuentes, la última corrida exitosa contra su TTL.
function calcularFrescura(
  fuente: { provider: string; ultimoExitoEn: string | null; ttlMinutos: number },
  datoMasRecienteImerg: string | null,
): FrescuraFuente {
  return evaluarFrescuraFuente({ ...fuente, datoMasRecienteEn: datoMasRecienteImerg, ahora: new Date() })
}

export default async function OperacionSalud() {
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin/operacion')
  if (gate === 'forbidden') redirect('/forbidden')

  await ensureSeeded()

  const estado = await obtenerEstadoOperativo()
  const fuentes = await getDb().select().from(hazardSourceHealth)
  const datoMasRecienteImerg = await obtenerDatoMasRecienteImerg()
  const cupo = await obtenerResumenCupo({ apiKeyPresente: Boolean(apiKeyDesdeEntorno()) })
  const avanceClimatologia = await obtenerAvanceClimatologia()
  const flagsOperativas = listarFlagsOperativas()

  return (
    <div style={contenedor}>
      <h1>Operación</h1>

      <section style={bloque}>
        <h2>Flags</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {flagsOperativas.map(({ nombre, valor }) => <li key={nombre}>{nombre}: {valor}</li>)}
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
                <th style={celda}>última corrida</th>
                <th style={celda}>próxima esperada</th>
                <th style={celda}>atrasado</th>
              </tr>
            </thead>
            <tbody>
              {estado.jobs.map((job) => {
                // job.tipo es el TIPO_JOB interno de infra_job_run, no el
                // nombre CLI de scripts/jobs.mjs: hay que traducirlo primero
                // (ver cadencias.ts). Jobs de otros batches (p. ej.
                // 'diagnostico') no están en el mapeo y muestran '—'.
                const nombreJob = TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB[job.tipo]
                const ultimaCorridaExitosaEn = job.ultimaCompletadaEn
                  ? new Date(job.ultimaCompletadaEn)
                  : null
                const { texto: textoAtraso, atrasado, desactivadoPorConfig } = estadoAtrasoJob({
                  nombre: nombreJob,
                  ultimaCorridaExitosaEn,
                  enosJobsEnabled: estado.flags.enosJobsEnabled,
                })
                const proxima = nombreJob
                  ? proximaCorridaEsperada({ nombre: nombreJob, ultimaCorridaExitosaEn })
                  : null
                const resaltado =
                  !desactivadoPorConfig && (job.leaseVencido || job.estado === 'fallido' || atrasado)
                const estilo = resaltado ? alerta : celda
                return (
                  <tr key={job.tipo}>
                    <td style={estilo}>{job.tipo}</td>
                    <td style={estilo}>{job.estado}</td>
                    <td style={estilo}>{job.intento}</td>
                    <td style={estilo}>{job.actualizadaEn}</td>
                    <td style={estilo}>{job.errorSaneado ?? '—'}</td>
                    <td style={estilo}>{nombreJob ? (job.ultimaCompletadaEn ?? '—') : '—'}</td>
                    <td style={estilo}>{proxima ? proxima.toISOString() : '—'}</td>
                    <td style={estilo}>{textoAtraso}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={bloque}>
        <h2>Fuentes de amenazas</h2>
        {fuentes.length === 0 ? (
          <p>Sin proveedores registrados todavía</p>
        ) : (
          <table style={tabla}>
            <thead>
              <tr>
                <th style={celda}>provider</th>
                <th style={celda}>estado</th>
                <th style={celda}>ultimoExitoEn</th>
                <th style={celda}>frescura</th>
                <th style={celda}>ttlMinutos</th>
                <th style={celda}>licencia</th>
                <th style={celda}>aviso</th>
              </tr>
            </thead>
            <tbody>
              {fuentes.map((fuente) => {
                const { frescuraMinutos: frescura, limiteMinutos, vencida, base } = calcularFrescura(fuente, datoMasRecienteImerg)
                const resaltado = fuente.estado !== 'ok' || vencida
                const estilo = resaltado ? alerta : celda
                return (
                  <tr key={fuente.provider}>
                    <td style={estilo}>{fuente.provider}</td>
                    <td style={estilo}>{fuente.estado}</td>
                    <td style={estilo}>{fuente.ultimoExitoEn ?? '—'}</td>
                    <td style={estilo}>{frescura === null ? '—' : `${frescura} min`}{base === 'dato' ? ' (edad del dato)' : ''}</td>
                    <td style={estilo}>{base === 'dato' ? `${limiteMinutos} (dato)` : fuente.ttlMinutos}</td>
                    <td style={estilo}>{fuente.licencia}</td>
                    <td style={estilo}>{vencida ? 'vencida' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
          Datos meteorológicos: Open-Meteo.com (CC BY 4.0), ECMWF.
        </p>
      </section>

      <section style={bloque}>
        <h2>Avance de climatología (cursor resumable de cupo)</h2>
        <p style={{ marginTop: 0 }}>
          Precipitación: {estado.climatologiaPrecipitacion.celdasUsables}/{estado.climatologiaPrecipitacion.celdasTotal} celdas
          con ≥{estado.climatologiaPrecipitacion.minimoUsable} años · años acumulados{' '}
          {estado.climatologiaPrecipitacion.aniosMin}–{estado.climatologiaPrecipitacion.aniosMax} (mediana{' '}
          {estado.climatologiaPrecipitacion.aniosMediana}) de {estado.climatologiaPrecipitacion.aniosObjetivo}
        </p>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', marginTop: 0 }}>
          Las celdas con menos de {estado.climatologiaPrecipitacion.minimoUsable} años siguen usando los umbrales provisorios.
        </p>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', marginTop: 0 }}>
          El cálculo completo excede el cupo diario/mensual de Open-Meteo en una
          sola corrida: el timer diario avanza el cursor hasta el tope de cupo
          disponible ese día, sin recomputar lo ya hecho. Ver
          docs/ejecucion-enos/OM-cupo/registro.md.
        </p>
        <table style={tabla}>
          <thead>
            <tr>
              <th style={celda}>climatología</th>
              <th style={celda}>celdas/puntos completos</th>
              <th style={celda}>total</th>
              <th style={celda}>%</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Precipitación (ERA5 respaldo, ~387 celdas)', avanceClimatologia.precipitacion],
                ['Caudal (GloFAS, 8 puntos fijos)', avanceClimatologia.caudal],
              ] as const
            ).map(([etiqueta, avance]) => {
              const porcentaje = avance.total === 0 ? 0 : Math.round((avance.completas / avance.total) * 100)
              const completo = avance.total > 0 && avance.completas >= avance.total
              return (
                <tr key={etiqueta}>
                  <td style={celda}>{etiqueta}</td>
                  <td style={celda}>{avance.completas}</td>
                  <td style={celda}>{avance.total}</td>
                  <td style={completo ? celda : alerta}>{porcentaje}%{completo ? ' (completo)' : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section style={bloque}>
        <h2>Cupo Open-Meteo</h2>
        {cupo.filas.length === 0 ? (
          <p>Sin uso registrado todavía</p>
        ) : (
          <table style={tabla}>
            <thead>
              <tr>
                <th style={celda}>host</th>
                <th style={celda}>ventana</th>
                <th style={celda}>usado</th>
                <th style={celda}>límite</th>
                <th style={celda}>%</th>
                <th style={celda}>estado</th>
              </tr>
            </thead>
            <tbody>
              {cupo.filas.map((fila) => {
                const resaltado = fila.agotado || fila.porcentaje >= 100
                const estilo = resaltado ? alerta : celda
                return (
                  <tr key={`${fila.host}-${fila.ventana}`}>
                    <td style={estilo}>{fila.host}</td>
                    <td style={estilo}>{fila.ventana}</td>
                    <td style={estilo}>{fila.usado.toFixed(1)}</td>
                    <td style={estilo}>{fila.limite}</td>
                    <td style={estilo}>{fila.porcentaje}%</td>
                    <td style={estilo}>{fila.agotado ? 'cupo agotado' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {cupo.cooldowns.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <strong>Hosts en cooldown (post-429):</strong>
            <ul>
              {cupo.cooldowns.map((c) => (
                <li key={c.host} style={{ color: 'var(--danger)' }}>
                  {c.host}: hasta {c.hastaEn} ({c.motivoSaneado})
                </li>
              ))}
            </ul>
          </div>
        )}
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
          Límites del nivel gratuito de Open-Meteo, con margen de seguridad. Ver
          docs/ejecucion-enos/OM-cupo/registro.md.
        </p>
      </section>

      <p style={{ color: 'var(--ink-soft)' }}>Generado en: {estado.generadoEn}</p>
    </div>
  )
}
