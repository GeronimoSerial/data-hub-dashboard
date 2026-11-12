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
import { useCallback, useEffect, useState, type JSX } from 'react'
import type { EstadoDatos } from '@/lib/infraestructura/riesgo/estado-datos/clasificar'
import { PanelEstadoDatos } from './estado-datos/panel-estado-datos'

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
}

export interface CorteSituacionCliente {
  id: string
  generadoEn: string
  kpis: KpisSituacionCliente
  conteosPorNivelRiesgo: Record<string, number>
  fuentesSalud: FuenteSaludCliente[]
  episodiosAbiertos: number
  episodiosCerradosDesdeAnterior: number
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
  // null: no se pudo leer el estado de los datos (el panel lo avisa).
  estadoDatos: EstadoDatos | null
}

// Refresco automático: cada 5 minutos, alineado a la cadencia horaria del job
// (varias veces por hora es suficiente para notar un corte nuevo sin
// sobrecargar el servidor con polling agresivo).
const REFRESCO_MS = 5 * 60 * 1000

type ModoCambios = 'registro' | 'vigencia'

const OPCIONES_DESDE = [
  { valor: '1h', etiqueta: 'Última hora', horas: 1 },
  { valor: '24h', etiqueta: 'Últimas 24 horas', horas: 24 },
  { valor: '7d', etiqueta: 'Últimos 7 días', horas: 24 * 7 },
] as const

const ETIQUETA_TIPO_CAMBIO: Record<CambioSituacionCliente['tipo'], string> = {
  afectacion: 'Afectación',
  episodio_abierto: 'Episodio abierto',
  episodio_cerrado: 'Episodio cerrado',
  riesgo: 'Riesgo',
}

const ETIQUETA_NIVEL_RIESGO: Record<string, string> = {
  bajo: 'Bajo',
  moderado: 'Moderado',
  alto: 'Alto',
  muy_alto: 'Muy alto',
}

function etiquetaNivelRiesgo(nivel: string | null): string {
  if (nivel === null) return 'Sin dato'
  return ETIQUETA_NIVEL_RIESGO[nivel] ?? nivel
}

// Built from formatToParts with an explicit 24 h cycle: `toLocaleString` output
// depends on the runtime's ICU data (Node renders "09:05 a. m.", browsers
// "09:05"), which broke hydration of the server-rendered page (React #418).
const FORMATO_FECHA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function formatearFecha(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  const p = Object.fromEntries(FORMATO_FECHA.formatToParts(fecha).map((parte) => [parte.type, parte.value]))
  return `${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}`
}

function kpiTile(props: {
  titulo: string
  valor: number
  tono: 'neutro' | 'alerta_texto'
}): JSX.Element {
  return (
    <div
      className="situacion-kpi"
      data-tono={props.tono}
      data-testid={`situacion-kpi-${props.titulo}`}
    >
      <span className="situacion-kpi__titulo">{props.titulo}</span>
      <span className="situacion-kpi__valor">{props.valor}</span>
    </div>
  )
}

const ENLACE_RADAR = '/mapas/infraestructura#radar'

function PanelPrioridades(props: { prioridades: PrioridadCliente[] }): JSX.Element {
  if (props.prioridades.length === 0) {
    return <p role="status">Sin escuelas en riesgo alto o muy alto en este momento.</p>
  }
  return (
    <ul className="situacion-prioridades" data-testid="situacion-prioridades">
      {props.prioridades.map((p) => (
        <li key={p.cueAnexo}>
          <a href={ENLACE_RADAR}>
            {p.cueAnexo} — {p.departamento ?? 'sin departamento'} — {etiquetaNivelRiesgo(p.nivelRiesgo)}
          </a>
        </li>
      ))}
    </ul>
  )
}

function PanelTimeline(props: { cambios: CambioSituacionCliente[] }): JSX.Element {
  if (props.cambios.length === 0) {
    return <p role="status">Sin cambios en el rango seleccionado.</p>
  }
  return (
    <ol className="situacion-timeline" data-testid="situacion-timeline">
      {props.cambios.map((cambio) => (
        <li key={cambio.id} data-testid="situacion-timeline-item">
          <span className="situacion-timeline__fecha">{formatearFecha(cambio.ocurreEn)}</span>{' '}
          <span className="situacion-timeline__tipo">[{ETIQUETA_TIPO_CAMBIO[cambio.tipo]}]</span>{' '}
          {cambio.departamento && <a href={ENLACE_RADAR}>{cambio.departamento}</a>}{' '}
          {cambio.descripcion}
        </li>
      ))}
    </ol>
  )
}

export function SituacionClient(props: { estadoInicial: EstadoSituacionCliente }): JSX.Element {
  const [estado, setEstado] = useState(props.estadoInicial)
  const [modoCambios, setModoCambios] = useState<ModoCambios>('vigencia')
  const [rangoDesde, setRangoDesde] = useState<(typeof OPCIONES_DESDE)[number]['valor']>('24h')
  const [cambios, setCambios] = useState<{
    porRegistro: CambioSituacionCliente[]
    porVigencia: CambioSituacionCliente[]
  }>({ porRegistro: [], porVigencia: [] })
  const [estadoTexto, setEstadoTexto] = useState('')

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
          setEstadoTexto(`Actualizado a las ${formatearFecha(new Date().toISOString())}.`)
        })
        .catch(() => {
          // Ídem: se conserva el último estado visto ante un error de red.
        })
    }, REFRESCO_MS)
    return () => clearInterval(id)
  }, [])

  const listaCambios = modoCambios === 'registro' ? cambios.porRegistro : cambios.porVigencia

  return (
    <div className="situacion-page" data-testid="situacion-page">
      <header className="situacion-page__header">
        <h1>Centro de Situación</h1>
        {estado.corte === null ? (
          <p role="status">Todavía no se generó ningún corte.</p>
        ) : (
          <p className="situacion-page__generado">
            Corte generado el {formatearFecha(estado.corte.generadoEn)}
            {estado.atraso.desactivadoPorConfig
              ? ' — jobs batch en pausa operativa'
              : estado.atraso.texto === 'no verificable'
                ? ' — No verificable'
                : estado.atraso.atrasado
                  ? ' — Desactualizado'
                  : ''}
          </p>
        )}
        {/* Región aria-live polite: anuncia el refresco sin mover el foco del
            usuario a ningún lado (ni scroll, ni focus()). */}
        <span aria-live="polite" className="sr-only" data-testid="situacion-live">
          {estadoTexto}
        </span>
        {estado.corte ? (
          <a className="ui-button" href="/api/infraestructura/situacion/export?formato=csv" download>
            Exportar CSV
          </a>
        ) : (
          <button className="ui-button" type="button" disabled aria-disabled="true">
            Exportar CSV
          </button>
        )}
      </header>

      <PanelEstadoDatos estado={estado.estadoDatos} />

      {estado.corte !== null && (
        <section aria-label="Indicadores principales" className="situacion-kpis">
          {kpiTile({
            titulo: 'Escuelas con afectación confirmada vigente',
            valor: estado.corte.kpis.escuelasAfectacionConfirmadaVigente,
            tono: estado.corte.kpis.escuelasAfectacionConfirmadaVigente > 0 ? 'alerta_texto' : 'neutro',
          })}
          {kpiTile({
            titulo: 'Escuelas con riesgo alto o muy alto (24 h)',
            valor: estado.corte.kpis.escuelasRiesgoAlto24h,
            tono: estado.corte.kpis.escuelasRiesgoAlto24h > 0 ? 'alerta_texto' : 'neutro',
          })}
          {kpiTile({
            titulo: 'Fuentes vencidas',
            valor: estado.corte.kpis.fuentesVencidas,
            tono: estado.corte.kpis.fuentesVencidas > 0 ? 'alerta_texto' : 'neutro',
          })}
        </section>
      )}

      {estado.briefing.length > 0 && (
        <section aria-label="Resumen" className="situacion-briefing">
          {/* Nunca abierto por defecto ni largo: una lista corta de líneas
              cortas, sin acordeón que el operador tenga que gestionar. */}
          <ul>
            {estado.briefing.map((linea, i) => (
              <li key={i}>{linea}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Cambios desde">
        <div className="situacion-cambios__controles">
          <label htmlFor="situacion-rango-desde">Rango de cambios</label>
          <select
            id="situacion-rango-desde"
            value={rangoDesde}
            onChange={(e) => setRangoDesde(e.target.value as (typeof OPCIONES_DESDE)[number]['valor'])}
          >
            {OPCIONES_DESDE.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>

          <label htmlFor="situacion-modo-cambios">Mostrar por</label>
          <select
            id="situacion-modo-cambios"
            value={modoCambios}
            onChange={(e) => setModoCambios(e.target.value as ModoCambios)}
          >
            <option value="vigencia">Vigencia (cuándo rige)</option>
            <option value="registro">Registro (cuándo se cargó)</option>
          </select>
        </div>
        <PanelTimeline cambios={listaCambios} />
      </section>

      <section aria-label="Prioridades">
        <h2>Prioridades (riesgo alto o muy alto)</h2>
        <PanelPrioridades prioridades={estado.prioridades} />
      </section>
    </div>
  )
}
