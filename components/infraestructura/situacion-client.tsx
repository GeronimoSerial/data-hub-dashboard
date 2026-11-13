'use client'

// Centro de Situación (E5): vista ejecutiva de sólo lectura. Recibe el estado
// inicial ya resuelto por el Server Component (sin parpadeo en la primera
// pintura) y se refresca solo cada REFRESCO_MS, sin robar foco: el refresco
// sólo actualiza los datos en memoria, nunca mueve el foco del usuario ni
// reabre/cierra nada que el usuario tenga abierto. El selector "Cambios
// desde" persiste su propia selección entre refrescos (no se resetea).
//
// La escala de riesgo escolar mantiene los niveles definidos para el mapa:
// el color es SIEMPRE un refuerzo de un texto, nunca la única señal; "Sin
// dato" nunca se pinta de verde; el copy no usa "alerta" ni "SMN".
import { formatoFechaRegion, localeRegion } from '@/lib/infraestructura/formato-region'
import { useCallback, useEffect, useState, type JSX } from 'react'
import type { EstadoDatos } from '@/lib/infraestructura/riesgo/estado-datos/clasificar'
import { PanelEstadoDatos } from './estado-datos/panel-estado-datos'
import { traducirMotivo } from './estado-datos/traducir-motivo'
import { traducirPlantilla } from './estado-datos/traducir-plantillas'
import type { Diccionario } from '@/lib/i18n'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { situacionEs } from '@/lib/i18n/diccionarios/grupos/situacion.es'

export interface KpisSituacionCliente {
  escuelasAfectacionConfirmadaVigente: number
  escuelasRiesgoAlto24h: number
  fuentesVencidas: number
}

export interface FuenteSaludCliente {
  provider: string
  estado: string
  frescuraMinutos: number | null
  vencida: boolean
  problema?: boolean
}

export interface CoberturaSituacionCliente {
  procesadas: number
  conEvidencia: number
  sinEvidencia: number
}

export interface CorteSituacionCliente {
  id: string
  generadoEn: string
  kpis: KpisSituacionCliente
  conteosPorNivelRiesgo: Record<string, number>
  fuentesSalud: FuenteSaludCliente[]
  episodiosAbiertos: number
  episodiosCerradosDesdeAnterior: number
  // null: el corte no tiene cobertura legible (nunca se muestra una cifra inventada).
  cobertura: CoberturaSituacionCliente | null
}

export interface AtrasoSituacionCliente {
  texto: string
  atrasado: boolean
  desactivadoPorConfig: boolean
}

export interface PrioridadCliente {
  cueAnexo: string
  departamento: string | null
  nivelRiesgo: string | null
  scoreRiesgo: number | null
}

export interface CambioSituacionCliente {
  id: string
  tipo: 'afectacion' | 'episodio_abierto' | 'episodio_cerrado' | 'riesgo'
  ocurreEn: string
  departamento: string | null
  cueAnexo: string | null
  descripcion: string
}

export interface EstadoSituacionCliente {
  corte: CorteSituacionCliente | null
  briefing: string[]
  atraso: AtrasoSituacionCliente
  prioridades: PrioridadCliente[]
  // true: no hay corrida de riesgo vigente (las prioridades no se pudieron calcular).
  sinRun: boolean
  // null: no se pudo leer el estado de los datos (el panel lo avisa).
  estadoDatos: EstadoDatos | null
}

// Refresco automático: cada 5 minutos, alineado a la cadencia horaria del job
// (varias veces por hora es suficiente para notar un corte nuevo sin
// sobrecargar el servidor con polling agresivo).
const REFRESCO_MS = 5 * 60 * 1000

type ModoCambios = 'registro' | 'vigencia'

const OPCIONES_DESDE = [
  { valor: '1h', clave: 'ultimaHora', horas: 1 },
  { valor: '24h', clave: 'ultimas24h', horas: 24 },
  { valor: '7d', clave: 'ultimos7d', horas: 24 * 7 },
] as const

const CLAVE_TIPO_CAMBIO = {
  afectacion: 'afectacion',
  episodio_abierto: 'episodioAbierto',
  episodio_cerrado: 'episodioCerrado',
  riesgo: 'riesgo',
} as const satisfies Record<CambioSituacionCliente['tipo'], keyof Diccionario['situacion']['tipoCambio']>

// "Moderado" y "Alto" son iguales en portugués: no van al diccionario.
function etiquetaNivelRiesgo(nivel: string | null, t: Diccionario): string {
  if (nivel === null) return t.situacion.sinDato
  switch (nivel) {
    case 'bajo':
      return t.situacion.nivel.bajo
    case 'moderado':
      return 'Moderado'
    case 'alto':
      return 'Alto'
    case 'muy_alto':
      return t.situacion.nivel.muyAlto
    default:
      return nivel
  }
}

// Built from formatToParts with an explicit 24 h cycle: `toLocaleString` output
// depends on the runtime's ICU data (Node renders "09:05 a. m.", browsers
// "09:05"), which broke hydration of the server-rendered page (React #418).
function formatoFecha(): Intl.DateTimeFormat {
  return formatoFechaRegion(localeRegion(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

// Sólo cuando la sonda de la cadena está ok; el texto sale del mismo item del panel.
export function textoCadenaVerificada(estadoDatos: EstadoDatos | null): string | null {
  const item = estadoDatos?.items.find((i) => i.id === 'sonda:cadena')
  if (item?.estado !== 'ok') return null
  return item.motivo.replace(/\.$/, '')
}

export function formatearFecha(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  const p = Object.fromEntries(formatoFecha().formatToParts(fecha).map((parte) => [parte.type, parte.value]))
  return `${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}`
}

// `clave` is the Spanish key of the KPI: it feeds the stable testid for every language.
function kpiTile(props: {
  clave: string
  titulo: string
  valor: number
  tono: 'neutro' | 'alerta_texto'
  nota?: string
}): JSX.Element {
  return (
    <div
      className="situacion-kpi"
      data-tono={props.tono}
      data-testid={`situacion-kpi-${props.clave}`}
    >
      <span className="situacion-kpi__titulo">{props.titulo}</span>
      <span className="situacion-kpi__valor">{props.valor}</span>
      {props.nota !== undefined && <span className="situacion-kpi__nota">{props.nota}</span>}
    </div>
  )
}

const ENLACE_RADAR = '/mapas/infraestructura#radar'

function textoCobertura(cobertura: CoberturaSituacionCliente | null, t: Diccionario): string | undefined {
  if (cobertura === null || cobertura.procesadas <= 0) return undefined
  const porcentaje = Math.round((cobertura.conEvidencia / cobertura.procesadas) * 100)
  return t.situacion.cobertura(porcentaje)
}

function PanelPrioridades(props: { prioridades: PrioridadCliente[]; sinRun: boolean }): JSX.Element {
  const t = useTextos()
  if (props.sinRun) {
    return <p role="status">{t.situacion.sinCalculo}</p>
  }
  if (props.prioridades.length === 0) {
    return <p role="status">{t.situacion.sinEscuelasRiesgo}</p>
  }
  return (
    <ul className="situacion-prioridades" data-testid="situacion-prioridades">
      {props.prioridades.map((p) => (
        <li key={p.cueAnexo}>
          <a href={ENLACE_RADAR}>
            {p.cueAnexo} — {p.departamento ?? t.situacion.sinDepartamento} — {etiquetaNivelRiesgo(p.nivelRiesgo, t)}
          </a>
        </li>
      ))}
    </ul>
  )
}

function PanelTimeline(props: { cambios: CambioSituacionCliente[] }): JSX.Element {
  const t = useTextos()
  if (props.cambios.length === 0) {
    return <p role="status">{t.situacion.sinCambiosRango}</p>
  }
  return (
    <ol className="situacion-timeline" data-testid="situacion-timeline">
      {props.cambios.map((cambio) => (
        <li key={cambio.id} data-testid="situacion-timeline-item">
          <span className="situacion-timeline__fecha">{formatearFecha(cambio.ocurreEn)}</span>{' '}
          <span className="situacion-timeline__tipo">[{t.situacion.tipoCambio[CLAVE_TIPO_CAMBIO[cambio.tipo]]}]</span>{' '}
          {cambio.departamento && <a href={ENLACE_RADAR}>{cambio.departamento}</a>}{' '}
          {traducirPlantilla(cambio.descripcion, t.situacion)}
        </li>
      ))}
    </ol>
  )
}

export function SituacionClient(props: { estadoInicial: EstadoSituacionCliente }): JSX.Element {
  const t = useTextos()
  const [estado, setEstado] = useState(props.estadoInicial)
  const [modoCambios, setModoCambios] = useState<ModoCambios>('vigencia')
  const [rangoDesde, setRangoDesde] = useState<(typeof OPCIONES_DESDE)[number]['valor']>('24h')
  const [cambios, setCambios] = useState<{
    porRegistro: CambioSituacionCliente[]
    porVigencia: CambioSituacionCliente[]
  }>({ porRegistro: [], porVigencia: [] })
  // Hora del último refresco; el texto se arma al pintar para seguir la región.
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null)

  const calcularDesdeIso = useCallback((rango: (typeof OPCIONES_DESDE)[number]['valor']) => {
    const opcion = OPCIONES_DESDE.find((o) => o.valor === rango) ?? OPCIONES_DESDE[1]
    return new Date(Date.now() - opcion.horas * 60 * 60 * 1000).toISOString()
  }, [])

  // Carga (y recarga al cambiar el rango) el timeline de cambios. Patrón
  // fetch().then() en el cuerpo del efecto, no una función extraída que
  // llame a setState (mismo criterio que evolucion-panel.tsx): evita
  // cascading renders y permite cancelar limpio si el rango cambia de nuevo
  // antes de que responda el fetch anterior.
  useEffect(() => {
    let cancelado = false
    const desde = calcularDesdeIso(rangoDesde)
    fetch(`/api/infraestructura/situacion/cambios?desde=${encodeURIComponent(desde)}`)
      .then(async (res) => (res.ok ? await res.json() : null))
      .then((body) => {
        if (cancelado || body === null) return
        setCambios(body)
      })
      .catch(() => {
        // Sin conexión / error de red: se mantiene el último timeline visto,
        // nunca se vacía silenciosamente lo que el operador ya estaba viendo.
      })
    return () => {
      cancelado = true
    }
  }, [rangoDesde, calcularDesdeIso])

  // Refresco automático del estado global (KPIs/briefing/salud/prioridades):
  // NUNCA en la carga inicial (esa ya llegó resuelta del servidor), sólo cada
  // REFRESCO_MS. Actualiza datos sin mover el foco ni el scroll del operador.
  useEffect(() => {
    const id = setInterval(() => {
      fetch('/api/infraestructura/situacion')
        .then(async (res) => (res.ok ? await res.json() : null))
        .then((body) => {
          if (body === null) return
          setEstado(body)
          setUltimaActualizacion(new Date().toISOString())
        })
        .catch(() => {
          // Ídem: se conserva el último estado visto ante un error de red.
        })
    }, REFRESCO_MS)
    return () => clearInterval(id)
  }, [])

  const listaCambios = modoCambios === 'registro' ? cambios.porRegistro : cambios.porVigencia
  const cadenaVerificada = textoCadenaVerificada(estado.estadoDatos)

  return (
    <div className="situacion-page" data-testid="situacion-page">
      <header className="situacion-page__header">
        <h1>{t.situacion.centroTitulo}</h1>
        {estado.corte === null ? (
          <p role="status">{t.situacion.sinCorte}</p>
        ) : (
          <p className="situacion-page__generado">
            {t.situacion.corteGenerado(formatearFecha(estado.corte.generadoEn))}
            {estado.atraso.desactivadoPorConfig
              ? t.situacion.sufijoPausaBatch
              : estado.atraso.texto === 'no verificable'
                ? t.situacion.sufijoNoVerificable
                : estado.atraso.atrasado
                  ? t.situacion.sufijoDesactualizado
                  : ''}
          </p>
        )}
        {cadenaVerificada !== null && (
          <p className="situacion-page__generado" data-testid="situacion-cadena-verificada">
            {traducirMotivo(cadenaVerificada, t.situacion)}
          </p>
        )}
        {/* Región aria-live polite: anuncia el refresco sin mover el foco del
            usuario a ningún lado (ni scroll, ni focus()). */}
        <span aria-live="polite" className="sr-only" data-testid="situacion-live">
          {ultimaActualizacion === null ? '' : t.situacion.actualizadoA(formatearFecha(ultimaActualizacion))}
        </span>
        {estado.corte ? (
          <a className="ui-button" href="/api/infraestructura/situacion/export?formato=csv" download>
            {t.situacion.exportarCsv}
          </a>
        ) : (
          <button className="ui-button" type="button" disabled aria-disabled="true">
            {t.situacion.exportarCsv}
          </button>
        )}
      </header>

      <PanelEstadoDatos estado={estado.estadoDatos} />

      {estado.corte !== null && (
        <section aria-label={t.situacion.aria.indicadores} className="situacion-kpis">
          {kpiTile({
            clave: situacionEs.kpi.afectacion,
            titulo: t.situacion.kpi.afectacion,
            valor: estado.corte.kpis.escuelasAfectacionConfirmadaVigente,
            tono: estado.corte.kpis.escuelasAfectacionConfirmadaVigente > 0 ? 'alerta_texto' : 'neutro',
          })}
          {kpiTile({
            clave: situacionEs.kpi.riesgoAlto,
            titulo: t.situacion.kpi.riesgoAlto,
            valor: estado.corte.kpis.escuelasRiesgoAlto24h,
            tono: estado.corte.kpis.escuelasRiesgoAlto24h > 0 ? 'alerta_texto' : 'neutro',
            nota: textoCobertura(estado.corte.cobertura, t),
          })}
          {kpiTile({
            clave: situacionEs.kpi.fuentesVencidas,
            titulo: t.situacion.kpi.fuentesVencidas,
            valor: estado.corte.kpis.fuentesVencidas,
            tono: estado.corte.kpis.fuentesVencidas > 0 ? 'alerta_texto' : 'neutro',
          })}
        </section>
      )}

      {estado.briefing.length > 0 && (
        <section aria-label={t.situacion.aria.resumen} className="situacion-briefing">
          {/* Nunca abierto por defecto ni largo: una lista corta de líneas
              cortas, sin acordeón que el operador tenga que gestionar. */}
          <ul>
            {estado.briefing.map((linea, i) => (
              <li key={i}>{traducirPlantilla(linea, t.situacion)}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t.situacion.aria.cambiosDesde}>
        <div className="situacion-cambios__controles">
          <label htmlFor="situacion-rango-desde">{t.situacion.rangoCambios}</label>
          <select
            id="situacion-rango-desde"
            value={rangoDesde}
            onChange={(e) => setRangoDesde(e.target.value as (typeof OPCIONES_DESDE)[number]['valor'])}
          >
            {OPCIONES_DESDE.map((o) => (
              <option key={o.valor} value={o.valor}>
                {t.situacion.rango[o.clave]}
              </option>
            ))}
          </select>

          <label htmlFor="situacion-modo-cambios">{t.situacion.mostrarPor}</label>
          <select
            id="situacion-modo-cambios"
            value={modoCambios}
            onChange={(e) => setModoCambios(e.target.value as ModoCambios)}
          >
            <option value="vigencia">{t.situacion.modoVigencia}</option>
            <option value="registro">{t.situacion.modoRegistro}</option>
          </select>
        </div>
        <PanelTimeline cambios={listaCambios} />
      </section>

      <section aria-label={t.situacion.aria.prioridades}>
        <h2>{t.situacion.prioridadesTitulo}</h2>
        <PanelPrioridades prioridades={estado.prioridades} sinRun={estado.sinRun} />
      </section>
    </div>
  )
}
