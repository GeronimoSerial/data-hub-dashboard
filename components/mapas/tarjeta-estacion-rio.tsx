'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { distanciaAUmbral, variacionEnVentana, type PuntoNivel, type Variacion } from '@/lib/infraestructura/hidrometria/ultima-lectura'
import { trazoSparkline } from '@/lib/mapas/sparkline'

export type EstadoNivelRio = 'evacuacion' | 'alerta' | 'normal' | 'sin_dato'

export type EstacionTarjeta = {
  estacionId: string
  nombre: string
  rio: 'parana' | 'uruguay'
  estado: EstadoNivelRio
  vencida: boolean
  lectura: { lecturaM: number; medidaEn: string; alertaM: number | null; evacuacionM: number | null; inconsistente: boolean } | null
}

const DIAS_SERIE = 7
const MS_POR_HORA = 3_600_000
const ANCHO = 260
const ALTO = 56

const ETIQUETA_RIO = { parana: 'Río Paraná', uruguay: 'Río Uruguay' } as const
const ETIQUETA_ESTADO: Record<EstadoNivelRio, string> = {
  evacuacion: 'Evacuación',
  alerta: 'Alerta',
  normal: 'Normal',
  sin_dato: 'Sin dato',
}

const FECHA = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Argentina/Buenos_Aires',
})

const metros = (v: number, signo = false) => `${signo && v > 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} m`

/** "hace 26 h", "hace 3 días", "hace menos de 1 h". */
export function haceCuanto(medidaEn: string, ahora: Date): string {
  const horas = Math.floor((ahora.getTime() - Date.parse(medidaEn)) / MS_POR_HORA)
  if (Number.isNaN(horas)) return ''
  if (horas < 1) return 'hace menos de 1 h'
  if (horas < 48) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} días`
}

/** State of the current value from the numbers alone (staleness ignored). */
export function nivelActual(
  lecturaM: number | null,
  alertaM: number | null,
  evacuacionM: number | null,
): { estado: EstadoNivelRio; nota: string | null } {
  if (lecturaM === null) return { estado: 'sin_dato', nota: null }
  if (evacuacionM !== null && lecturaM >= evacuacionM) return { estado: 'evacuacion', nota: `▲ ${metros(lecturaM - evacuacionM)} sobre evacuación` }
  if (alertaM !== null && lecturaM >= alertaM) return { estado: 'alerta', nota: `▲ ${metros(lecturaM - alertaM)} sobre alerta` }
  return { estado: 'normal', nota: null }
}

function cifra(v: number | null) {
  if (v === null) return <span aria-label="Sin dato">—</span>
  return (
    <>
      {v.toFixed(2).replace('.', ',')}
      <span className="tarjeta-estacion__unidad"> m</span>
    </>
  )
}

function textoVariacion(v: Variacion | null): string {
  if (!v) return 'Sin dato'
  const pct = v.porcentaje === null ? '' : ` (${v.porcentaje > 0 ? '+' : ''}${v.porcentaje.toFixed(1).replace('.', ',')} %)`
  return `${metros(v.deltaM, true)}${pct}`
}

/** Threshold label at the right end of its dashed line, e.g. "Alerta 7,90". */
const etiquetaUmbral = (valor: number, tipo: 'alerta' | 'evacuacion') =>
  `${tipo === 'alerta' ? 'Alerta' : 'Evac.'} ${valor.toFixed(2).replace('.', ',')}`

function textoDistancia(d: number | null): string {
  if (d === null) return 'Sin umbral'
  return d > 0 ? `Faltan ${metros(d)}` : `Superada por ${metros(-d)}`
}

type EstadoSerie = { tipo: 'cargando' } | { tipo: 'error' } | { tipo: 'lista'; puntos: PuntoNivel[] }

function useSerie(estacionId: string, ultimaMedidaEn: string | null): EstadoSerie {
  // El resultado guarda la clave que lo produjo: si cambia la estación, se deriva 'cargando' en render.
  const clave = `${estacionId}|${ultimaMedidaEn ?? ''}`
  const [resultado, setResultado] = useState<{ clave: string; serie: EstadoSerie } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const claveEfecto = `${estacionId}|${ultimaMedidaEn ?? ''}`
    const setSerie = (serie: EstadoSerie) => setResultado({ clave: claveEfecto, serie })
    const hasta = new Date()
    // A stale station still gets its last week of readings, not an empty window.
    const fin = ultimaMedidaEn ? Math.min(hasta.getTime(), Date.parse(ultimaMedidaEn)) : hasta.getTime()
    const desde = new Date(fin - DIAS_SERIE * 24 * MS_POR_HORA)
    const params = new URLSearchParams({ desde: desde.toISOString(), hasta: hasta.toISOString() })
    fetch(`/api/infraestructura/hidrometria/estaciones/${encodeURIComponent(estacionId)}/lecturas?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('serie'))))
      .then((cuerpo: { lecturas?: Array<{ medidaEn: string; lecturaM: number | null; inconsistente?: boolean }> }) => {
        const puntos = (cuerpo.lecturas ?? []).map((p) => ({ medidaEn: p.medidaEn, lecturaM: p.inconsistente ? null : p.lecturaM }))
        setSerie({ tipo: 'lista', puntos })
      })
      .catch(() => {
        if (!controller.signal.aborted) setSerie({ tipo: 'error' })
      })
    return () => controller.abort()
  }, [estacionId, ultimaMedidaEn])
  return resultado?.clave === clave ? resultado.serie : { tipo: 'cargando' }
}

export function TarjetaEstacionRio({ estacion, onCerrar }: { estacion: EstacionTarjeta; onCerrar: () => void }) {
  const raiz = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const { lectura } = estacion
  const serie = useSerie(estacion.estacionId, lectura?.medidaEn ?? null)

  useEffect(() => {
    raiz.current?.focus({ preventScroll: true })
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  }, [estacion.estacionId, onCerrar])

  const puntos = serie.tipo === 'lista' ? serie.puntos : []
  const umbrales = [lectura?.alertaM ?? null, lectura?.evacuacionM ?? null]
  const trazo = trazoSparkline(puntos, { ancho: ANCHO, alto: ALTO, margen: 4, umbrales })
  const ahora = new Date()
  const nivel = nivelActual(lectura?.lecturaM ?? null, lectura?.alertaM ?? null, lectura?.evacuacionM ?? null)

  return (
    <div
      ref={raiz}
      className="map-popup tarjeta-estacion"
      role="dialog"
      aria-labelledby={idTitulo}
      tabIndex={-1}
      data-estado={estacion.estado}
      data-vencida={estacion.vencida || undefined}
    >
      <div className="tarjeta-estacion__cabecera">
        <div>
          <h3 id={idTitulo} className="tarjeta-estacion__titulo">{estacion.nombre}</h3>
          <p className="tarjeta-estacion__sub">{ETIQUETA_RIO[estacion.rio]} · Prefectura Naval Argentina</p>
        </div>
        <span className="tarjeta-estacion__estado">{ETIQUETA_ESTADO[estacion.estado]}</span>
      </div>

      <dl className="tarjeta-estacion__cifras">
        <div className={`tarjeta-estacion__cifra tarjeta-estacion__cifra--actual-${nivel.estado}`}>
          <dt>Actual</dt>
          <dd>{cifra(lectura?.lecturaM ?? null)}</dd>
          {nivel.nota && <dd className="tarjeta-estacion__exceso">{nivel.nota}</dd>}
        </div>
        <div className="tarjeta-estacion__cifra tarjeta-estacion__cifra--alerta">
          <dt>Alerta</dt>
          <dd>{cifra(lectura?.alertaM ?? null)}</dd>
        </div>
        <div className="tarjeta-estacion__cifra tarjeta-estacion__cifra--evacuacion">
          <dt>Evacuación</dt>
          <dd>{cifra(lectura?.evacuacionM ?? null)}</dd>
        </div>
      </dl>

      {lectura ? (
        <p className="tarjeta-estacion__hora">
          <time dateTime={lectura.medidaEn} className={estacion.vencida ? 'tarjeta-estacion__aviso' : undefined} title={estacion.vencida ? 'Lectura de más de 18 h' : undefined}>
            {haceCuanto(lectura.medidaEn, ahora)}
          </time>
          {' · '}
          {FECHA.format(new Date(lectura.medidaEn))}
          {lectura.inconsistente && <span> · Marcada como inconsistente por la fuente</span>}
        </p>
      ) : (
        <p className="tarjeta-estacion__hora">Sin lecturas publicadas.</p>
      )}

      <figure className="tarjeta-estacion__grafico">
        {serie.tipo === 'cargando' && <p className="tarjeta-estacion__sub">Cargando la serie…</p>}
        {serie.tipo === 'error' && <p className="tarjeta-estacion__sub">No se pudo cargar la serie.</p>}
        {serie.tipo === 'lista' && !trazo && <p className="tarjeta-estacion__sub">Pocas lecturas para graficar.</p>}
        {trazo && (
          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" height={ALTO} role="img" aria-label={`Altura del río en los últimos ${DIAS_SERIE} días`}>
            {trazo.lineas.map((linea) => {
              const tipo = linea.valor === lectura?.evacuacionM ? 'evacuacion' : 'alerta'
              // Two close thresholds: the alert label goes under its line so both read.
              const pegadas = trazo.lineas.length === 2 && Math.abs(trazo.lineas[0].y - trazo.lineas[1].y) < 12
              const yTexto = tipo === 'alerta' && pegadas ? linea.y + 10 : linea.y - 3
              return (
                <g key={linea.valor}>
                  <line className={`tarjeta-estacion__umbral--${tipo}`} x1={0} x2={ANCHO} y1={linea.y} y2={linea.y} />
                  <text className={`tarjeta-estacion__umbral-texto tarjeta-estacion__umbral-texto--${tipo}`} x={ANCHO} y={yTexto} textAnchor="end">
                    {etiquetaUmbral(linea.valor, tipo)}
                  </text>
                </g>
              )
            })}
            <path className="tarjeta-estacion__linea" d={trazo.path} />
            <circle className="tarjeta-estacion__punto" cx={trazo.ultimo.x} cy={trazo.ultimo.y} r={3} />
          </svg>
        )}
        <figcaption className="tarjeta-estacion__sub">
          Últimos {DIAS_SERIE} días
        </figcaption>
      </figure>

      <dl className="tarjeta-estacion__datos">
        <div><dt>Variación 24 h</dt><dd>{textoVariacion(variacionEnVentana(puntos, 24))}</dd></div>
        <div><dt>Variación 72 h</dt><dd>{textoVariacion(variacionEnVentana(puntos, 72))}</dd></div>
        <div><dt>Hasta alerta</dt><dd>{textoDistancia(distanciaAUmbral(lectura?.lecturaM ?? null, lectura?.alertaM ?? null))}</dd></div>
        <div><dt>Hasta evacuación</dt><dd>{textoDistancia(distanciaAUmbral(lectura?.lecturaM ?? null, lectura?.evacuacionM ?? null))}</dd></div>
      </dl>
    </div>
  )
}
