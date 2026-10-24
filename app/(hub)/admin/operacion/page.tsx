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
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'


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
  await requireServerHubPageAccess('/admin/operacion', 'infrastructure')
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin/operacion')
  if (gate === 'forbidden') redirect('/forbidden')

  await ensureSeeded()

  const estado = await obtenerEstadoOperativo()
  const fuentes = await getDb().select().from(hazardSourceHealth)
  const datoMasRecienteImerg = await obtenerDatoMasRecienteImerg()
  const cupo = await obtenerResumenCupo({ apiKeyPresente: Boolean(apiKeyDesdeEntorno()) })
  // A missing published dataset must not take down the whole health page.
  const avanceClimatologia = await obtenerAvanceClimatologia().catch(() => null)
  const flagsOperativas = listarFlagsOperativas()

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>Salud</h1>
        <p className="page-intro">Flags, jobs, fuentes de amenazas y cupos del motor de riesgo.</p>
      </header>

      <section className="admin-panel">
        <h2>Flags</h2>
        <ul className="admin-plain-list">
          {flagsOperativas.map(({ nombre, valor }) => <li key={nombre}>{nombre}: {valor}</li>)}
        </ul>
      </section>

      <section className="admin-panel">
        <h2>Jobs</h2>
        {estado.jobs.length === 0 ? (
          <p>Sin ejecuciones registradas todavía</p>
        ) : (
          <div className="ui-table-wrap"><table className="ui-table">
            <thead>
              <tr>
                <th>tipo</th>
                <th>estado</th>
                <th>intento</th>
                <th>actualizadaEn</th>
                <th>errorSaneado</th>
                <th>última corrida</th>
                <th>próxima esperada</th>
                <th>atrasado</th>
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
                const estilo = resaltado ? 'is-danger' : undefined
                return (
                  <tr key={job.tipo}>
                    <td className={estilo}>{job.tipo}</td>
                    <td className={estilo}>{job.estado}</td>
                    <td className={estilo}>{job.intento}</td>
                    <td className={estilo}>{job.actualizadaEn}</td>
                    <td className={estilo}>{job.errorSaneado ?? '—'}</td>
                    <td className={estilo}>{nombreJob ? (job.ultimaCompletadaEn ?? '—') : '—'}</td>
                    <td className={estilo}>{proxima ? proxima.toISOString() : '—'}</td>
                    <td className={estilo}>{textoAtraso}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="admin-panel">
        <h2>Fuentes de amenazas</h2>
        {fuentes.length === 0 ? (
          <p>Sin proveedores registrados todavía</p>
        ) : (
          <div className="ui-table-wrap"><table className="ui-table">
            <thead>
              <tr>
                <th>provider</th>
                <th>estado</th>
                <th>ultimoExitoEn</th>
                <th>frescura</th>
                <th>ttlMinutos</th>
                <th>licencia</th>
                <th>aviso</th>
              </tr>
            </thead>
            <tbody>
              {fuentes.map((fuente) => {
                const { frescuraMinutos: frescura, limiteMinutos, vencida, base } = calcularFrescura(fuente, datoMasRecienteImerg)
                const resaltado = fuente.estado !== 'ok' || vencida
                const estilo = resaltado ? 'is-danger' : undefined
                return (
                  <tr key={fuente.provider}>
                    <td className={estilo}>{fuente.provider}</td>
                    <td className={estilo}>{fuente.estado}</td>
                    <td className={estilo}>{fuente.ultimoExitoEn ?? '—'}</td>
                    <td className={estilo}>{frescura === null ? '—' : `${frescura} min`}{base === 'dato' ? ' (edad del dato)' : ''}</td>
                    <td className={estilo}>{base === 'dato' ? `${limiteMinutos} (dato)` : fuente.ttlMinutos}</td>
                    <td className={estilo}>{fuente.licencia}</td>
                    <td className={estilo}>{vencida ? 'vencida' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
        <p className="ui-hint">
          Datos meteorológicos: Open-Meteo.com (CC BY 4.0), ECMWF.
        </p>
      </section>

      <section className="admin-panel">
        <h2>Avance de climatología (cursor resumable de cupo)</h2>
        <p>
          Precipitación: {estado.climatologiaPrecipitacion.celdasUsables}/{estado.climatologiaPrecipitacion.celdasTotal} celdas
          con ≥{estado.climatologiaPrecipitacion.minimoUsable} años · años acumulados{' '}
          {estado.climatologiaPrecipitacion.aniosMin}–{estado.climatologiaPrecipitacion.aniosMax} (mediana{' '}
          {estado.climatologiaPrecipitacion.aniosMediana}) de {estado.climatologiaPrecipitacion.aniosObjetivo}
        </p>
        <p className="ui-hint">
          Las celdas con menos de {estado.climatologiaPrecipitacion.minimoUsable} años siguen usando los umbrales provisorios.
        </p>
        <p className="ui-hint">
          El cálculo completo excede el cupo diario/mensual de Open-Meteo en una
          sola corrida: el timer diario avanza el cursor hasta el tope de cupo
          disponible ese día, sin recomputar lo ya hecho. Ver
          docs/ejecucion-enos/OM-cupo/registro.md.
        </p>
        {avanceClimatologia ? <div className="ui-table-wrap"><table className="ui-table">
          <thead>
            <tr>
              <th>climatología</th>
              <th>celdas/puntos completos</th>
              <th>total</th>
              <th>%</th>
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
                  <td>{etiqueta}</td>
                  <td>{avance.completas}</td>
                  <td>{avance.total}</td>
                  <td className={completo ? undefined : 'is-danger'}>{porcentaje}%{completo ? ' (completo)' : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div> : <p className="ui-hint is-danger">No se pudo calcular el avance: falta publicar algún dataset de referencia.</p>}
      </section>

      <section className="admin-panel">
        <h2>Cupo Open-Meteo</h2>
        {cupo.filas.length === 0 ? (
          <p>Sin uso registrado todavía</p>
        ) : (
          <div className="ui-table-wrap"><table className="ui-table">
            <thead>
              <tr>
                <th>host</th>
                <th>ventana</th>
                <th>usado</th>
                <th>límite</th>
                <th>%</th>
                <th>estado</th>
              </tr>
            </thead>
            <tbody>
              {cupo.filas.map((fila) => {
                const resaltado = fila.agotado || fila.porcentaje >= 100
                const estilo = resaltado ? 'is-danger' : undefined
                return (
                  <tr key={`${fila.host}-${fila.ventana}`}>
                    <td className={estilo}>{fila.host}</td>
                    <td className={estilo}>{fila.ventana}</td>
                    <td className={estilo}>{fila.usado.toFixed(1)}</td>
                    <td className={estilo}>{fila.limite}</td>
                    <td className={estilo}>{fila.porcentaje}%</td>
                    <td className={estilo}>{fila.agotado ? 'cupo agotado' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
        {cupo.cooldowns.length > 0 && (
          <div>
            <strong>Hosts en cooldown (post-429):</strong>
            <ul>
              {cupo.cooldowns.map((c) => (
                <li key={c.host} className="is-danger">
                  {c.host}: hasta {c.hastaEn} ({c.motivoSaneado})
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="ui-hint">
          Límites del nivel gratuito de Open-Meteo, con margen de seguridad. Ver
          docs/ejecucion-enos/OM-cupo/registro.md.
        </p>
      </section>

      <p className="ui-hint">Generado en: {estado.generadoEn}</p>
    </div>
  )
}
