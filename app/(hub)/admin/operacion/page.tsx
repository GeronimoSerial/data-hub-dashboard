import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { obtenerDatoMasRecienteImerg, obtenerEstadoOperativo } from '@/lib/infraestructura/riesgo/salud'
import { clasificarFuente, esProblema, type ItemEstadoDato } from '@/lib/infraestructura/riesgo/estado-datos/clasificar'
import { PROVIDER_OBSERVADO } from '@/lib/infraestructura/riesgo/peligro/observado'
import {
  estadoAtrasoJob,
  proximaCorridaEsperada,
  TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB,
} from '@/lib/infraestructura/riesgo/cadencias'
import { getDb } from '@/lib/db'
import { filasRecibidas, JOBS_ESPERADOS } from '@/lib/infraestructura/riesgo/jobs-esperados'
import { hazardSourceHealth } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { apiKeyDesdeEntorno, obtenerResumenCupo } from '@/lib/infraestructura/riesgo/providers/cupo-om'
import { obtenerAvanceClimatologia } from '@/lib/infraestructura/riesgo/avance-climatologia'
import { listarFlagsOperativas } from '@/lib/infraestructura/riesgo/flags'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'
import { textos } from '@/lib/i18n'
import { idiomaEfectivo } from '@/lib/i18n/idioma'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { regionActiva } from '@/lib/infraestructura/region'
import { traducirMotivo } from '@/components/infraestructura/estado-datos/traducir-motivo'


// Fuera del componente a propósito: `react-hooks/purity` marca `Date.now()`
// llamado directamente en el cuerpo de un componente, aun siendo un Server
// Component async — mismo patrón que ya usa `obtenerEstadoOperativo()`
// (calcula `generadoEn` puertas adentro, no en el JSX).
// Mismo criterio que el panel "Estado de los datos" y el KPI del Centro de
// Situación (clasificarFuente): la tabla y el KPI no pueden discrepar.
function clasificarFuenteOperacion(
  fuente: { provider: string; estado: string; ultimoExitoEn: string | null; ultimoIntentoEn: string | null; ultimoErrorSaneado: string | null; ttlMinutos: number },
  datoMasRecienteImerg: string | null,
): ItemEstadoDato {
  return clasificarFuente({ ...fuente, datoMasRecienteImerg, ahora: new Date() })
}

export default async function OperacionSalud() {
  await requireServerHubPageAccess('/admin/operacion', 'infrastructure')
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin/operacion')
  if (gate === 'forbidden') redirect('/forbidden')

  const region = regionActiva()
  const idioma = idiomaEfectivo({ preferencia: user?.idioma, region })
  const t = textos(idioma)
  const o = t.situacion.operacion

  await ensureSeeded()

  const estado = await obtenerEstadoOperativo()
  const fuentes = await getDb().select().from(hazardSourceHealth)
  const datoMasRecienteImerg = await obtenerDatoMasRecienteImerg()
  const cupo = await obtenerResumenCupo({ apiKeyPresente: Boolean(apiKeyDesdeEntorno()) })
  // A missing published dataset must not take down the whole health page.
  const avanceClimatologia = await obtenerAvanceClimatologia().catch(() => null)
  const flagsOperativas = listarFlagsOperativas()

  return (
    <IdiomaProvider idioma={idioma}>
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>{o.titulo}</h1>
        <p className="page-intro">{o.intro}</p>
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
          <p>{o.sinEjecuciones}</p>
        ) : (
          <div className="ui-table-wrap"><table className="ui-table">
            <thead>
              <tr>
                <th>tipo</th>
                <th>estado</th>
                <th>{o.colIntento}</th>
                <th>{o.colFilas}</th>
                <th>{o.colActualizada}</th>
                <th>{o.colError}</th>
                <th>{o.colUltimaCorrida}</th>
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
                // I2: filas recibidas de la última corrida completada; bajo el mínimo del job, sin datos.
                const esperado = JOBS_ESPERADOS.find((j) => j.tipo === job.tipo)
                const filas = esperado ? filasRecibidas(esperado, job.contadoresUltimaCompletada) : null
                const sinDatos = esperado?.minimoFilas !== undefined && filas !== null && filas < esperado.minimoFilas
                const resaltado =
                  !desactivadoPorConfig && (job.leaseVencido || job.estado === 'fallido' || atrasado || sinDatos)
                const estilo = resaltado ? 'is-danger' : undefined
                return (
                  <tr key={job.tipo}>
                    <td className={estilo}>{job.tipo}</td>
                    <td className={estilo}>{job.estado}</td>
                    <td className={estilo}>{job.intento}</td>
                    <td className={estilo}>{filas ?? '—'}</td>
                    <td className={estilo}>{job.actualizadaEn}</td>
                    <td className={estilo}>{job.errorSaneado ?? '—'}</td>
                    <td className={estilo}>{nombreJob ? (job.ultimaCompletadaEn ?? '—') : '—'}</td>
                    <td className={estilo}>{proxima ? proxima.toISOString() : '—'}</td>
                    <td className={estilo}>{textoAtraso === 'al día' ? o.atrasoAlDia : textoAtraso === 'Desactivado por configuración' ? o.atrasoDesactivado : textoAtraso}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="admin-panel">
        <h2>{o.fuentesTitulo}</h2>
        {fuentes.length === 0 ? (
          <p>{o.sinProveedores}</p>
        ) : (
          <div className="ui-table-wrap"><table className="ui-table">
            <thead>
              <tr>
                <th>provider</th>
                <th>estado</th>
                <th>{o.colUltimoExito}</th>
                <th>{o.colFrescura}</th>
                <th>ttlMinutos</th>
                <th>{o.colLicencia}</th>
                <th>aviso</th>
              </tr>
            </thead>
            <tbody>
              {fuentes.map((fuente) => {
                const item = clasificarFuenteOperacion(fuente, datoMasRecienteImerg)
                const resaltado = esProblema(item.estado)
                const frescura = item.edadMinutos
                const limiteMinutos = item.intervaloMinutos
                const base = fuente.provider === PROVIDER_OBSERVADO ? 'dato' : 'ultimo_exito'
                const estilo = resaltado ? 'is-danger' : undefined
                return (
                  <tr key={fuente.provider}>
                    <td className={estilo}>{fuente.provider}</td>
                    <td className={estilo}>{fuente.estado}</td>
                    <td className={estilo}>{fuente.ultimoExitoEn ?? '—'}</td>
                    <td className={estilo}>{frescura === null ? '—' : o.minutos(frescura)}{base === 'dato' ? o.edadDelDato : ''}</td>
                    <td className={estilo}>{base === 'dato' ? `${limiteMinutos}${o.dato}` : fuente.ttlMinutos}</td>
                    <td className={estilo}>{fuente.licencia}</td>
                    <td className={estilo}>{resaltado ? traducirMotivo(item.motivo, t.situacion) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
        <p className="ui-hint">{o.datosMeteo}</p>
      </section>

      <section className="admin-panel">
        <h2>{o.climatologiaTitulo}</h2>
        <p>
          {o.precipitacionResumen(
            estado.climatologiaPrecipitacion.celdasUsables,
            estado.climatologiaPrecipitacion.celdasTotal,
            estado.climatologiaPrecipitacion.minimoUsable,
            estado.climatologiaPrecipitacion.aniosMin,
            estado.climatologiaPrecipitacion.aniosMax,
            estado.climatologiaPrecipitacion.aniosMediana,
            estado.climatologiaPrecipitacion.aniosObjetivo,
          )}
        </p>
        <p className="ui-hint">{o.provisorios(estado.climatologiaPrecipitacion.minimoUsable)}</p>
        <p className="ui-hint">{o.cuposCompletoExplicacion}</p>
        {avanceClimatologia ? <div className="ui-table-wrap"><table className="ui-table">
          <thead>
            <tr>
              <th>{o.colClimatologia}</th>
              <th>{o.colCompletas}</th>
              <th>total</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                [o.precipitacionEtiqueta, avanceClimatologia.precipitacion],
                [o.caudalEtiqueta, avanceClimatologia.caudal],
              ] as const
            ).map(([etiqueta, avance]) => {
              const porcentaje = avance.total === 0 ? 0 : Math.round((avance.completas / avance.total) * 100)
              const completo = avance.total > 0 && avance.completas >= avance.total
              return (
                <tr key={etiqueta}>
                  <td>{etiqueta}</td>
                  <td>{avance.completas}</td>
                  <td>{avance.total}</td>
                  <td className={completo ? undefined : 'is-danger'}>{porcentaje}%{completo ? o.completo : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div> : <p className="ui-hint is-danger">{o.avanceNoDisponible}</p>}
      </section>

      <section className="admin-panel">
        <h2>{o.cupoTitulo}</h2>
        {cupo.filas.length === 0 ? (
          <p>{o.sinUso}</p>
        ) : (
          <div className="ui-table-wrap"><table className="ui-table">
            <thead>
              <tr>
                <th>host</th>
                <th>ventana</th>
                <th>usado</th>
                <th>{o.colLimite}</th>
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
                    <td className={estilo}>{fila.agotado ? o.cupoAgotado : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
        {cupo.cooldowns.length > 0 && (
          <div>
            <strong>{o.cooldowns}</strong>
            <ul>
              {cupo.cooldowns.map((c) => (
                <li key={c.host} className="is-danger">
                  {c.host}{o.cooldownHasta(c.hastaEn)} ({c.motivoSaneado})
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="ui-hint">{o.limitesCupo}</p>
      </section>

      <p className="ui-hint">{o.generadoEn(estado.generadoEn)}</p>
    </div>
    </IdiomaProvider>
  )
}
