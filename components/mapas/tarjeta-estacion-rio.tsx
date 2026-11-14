'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { distanciaAUmbral, variacionEnVentana, type PuntoNivel, type Variacion } from '@/lib/infraestructura/hidrometria/ultima-lectura'
import { trazoSparkline } from '@/lib/mapas/sparkline'
import { formatoFechaRegion } from '@/components/mapas/formato-fecha-region'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { fichaCuerpoEs } from '@/lib/i18n/diccionarios/grupos/fichaCuerpo.es'

type TextosRio = ReturnType<typeof useTextos>['fichaCuerpo']['estacionRio']
type TextosHace = TextosRio['hace']

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
const DEMORA_REINTENTO_MS = 1500
const MS_POR_HORA = 3_600_000
const ANCHO = 260
const ALTO = 56

// "Alerta" and "Normal" read the same in Portuguese, so they stay literal.
function etiquetaEstado(t: TextosRio, estado: EstadoNivelRio): string {
  if (estado === 'evacuacion') return t.evacuacion
  if (estado === 'alerta') return 'Alerta'
  if (estado === 'normal') return 'Normal'
  return t.sinDato
}

const OPCIONES_FECHA: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}

const metros = (v: number, signo = false) => `${signo && v > 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} m`

/** "hace 26 h", "hace 3 días", "hace menos de 1 h". */
export function haceCuanto(medidaEn: string, ahora: Date, textos: TextosHace = fichaCuerpoEs.estacionRio.hace): string {
  const horas = Math.floor((ahora.getTime() - Date.parse(medidaEn)) / MS_POR_HORA)
  if (Number.isNaN(horas)) return ''
  if (horas < 1) return textos.menosDeUnaHora
  if (horas < 48) return textos.horas(horas)
  return textos.dias(Math.floor(horas / 24))
}

/** State of the current value from the numbers alone (staleness ignored). */
export function nivelActual(
  lecturaM: number | null,
  alertaM: number | null,
  evacuacionM: number | null,
  textos: Pick<TextosRio, 'sobreEvacuacion' | 'sobreAlerta'> = fichaCuerpoEs.estacionRio,
): { estado: EstadoNivelRio; nota: string | null } {
  if (lecturaM === null) return { estado: 'sin_dato', nota: null }
  if (evacuacionM !== null && lecturaM >= evacuacionM) return { estado: 'evacuacion', nota: textos.sobreEvacuacion(metros(lecturaM - evacuacionM)) }
  if (alertaM !== null && lecturaM >= alertaM) return { estado: 'alerta', nota: textos.sobreAlerta(metros(lecturaM - alertaM)) }
  return { estado: 'normal', nota: null }
}

function cifra(v: number | null, sinDato: string) {
  if (v === null) return <span aria-label={sinDato}>—</span>
  return (
    <>
      {v.toFixed(2).replace('.', ',')}
      <span className="tarjeta-estacion__unidad"> m</span>
    </>
  )
}

function textoVariacion(v: Variacion | null, sinDato: string): string {
  if (!v) return sinDato
  const pct = v.porcentaje === null ? '' : ` (${v.porcentaje > 0 ? '+' : ''}${v.porcentaje.toFixed(1).replace('.', ',')} %)`
  return `${metros(v.deltaM, true)}${pct}`
}

/** Threshold label at the right end of its dashed line, e.g. "Alerta 7,90". */
const etiquetaUmbral = (t: TextosRio, valor: number, tipo: 'alerta' | 'evacuacion') => {
  const numero = valor.toFixed(2).replace('.', ',')
  return tipo === 'alerta' ? t.umbralAlerta(numero) : t.umbralEvacuacion(numero)
}

function textoDistancia(t: TextosRio, d: number | null): string {
  if (d === null) return t.sinUmbral
  return d > 0 ? t.faltan(metros(d)) : t.superada(metros(-d))
}

type EstadoSerie = { tipo: 'cargando' } | { tipo: 'error' } | { tipo: 'lista'; puntos: PuntoNivel[] } | { tipo: 'respaldo'; puntos: PuntoNivel[] }

// Última serie cargada por estación: respaldo si una recarga falla.
const CACHE_SERIES = new Map<string, PuntoNivel[]>()
export function limpiarCacheSeries() {
  CACHE_SERIES.clear()
}

const esperar = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolver) => {
    const timer = setTimeout(resolver, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolver()
    }, { once: true })
  })

async function pedirSerie(url: string, signal: AbortSignal): Promise<PuntoNivel[]> {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error('serie')
  const cuerpo: { lecturas?: Array<{ medidaEn: string; lecturaM: number | null; inconsistente?: boolean }> } = await r.json()
  return (cuerpo.lecturas ?? []).map((p) => ({ medidaEn: p.medidaEn, lecturaM: p.inconsistente ? null : p.lecturaM }))
}

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
    const url = `/api/infraestructura/hidrometria/estaciones/${encodeURIComponent(estacionId)}/lecturas?${params}`
    const cargar = async () => {
      // Un reintento tras una demora corta: fallos transitorios (timeout, 500) son frecuentes.
      let puntos: PuntoNivel[] | null = null
      for (let intento = 0; intento < 2 && puntos === null; intento++) {
        if (intento > 0) await esperar(DEMORA_REINTENTO_MS, controller.signal)
        if (controller.signal.aborted) return
        try {
          puntos = await pedirSerie(url, controller.signal)
        } catch {
          if (controller.signal.aborted) return
        }
      }
      if (puntos) {
        CACHE_SERIES.set(estacionId, puntos)
        setSerie({ tipo: 'lista', puntos })
        return
      }
      const previa = CACHE_SERIES.get(estacionId)
      setSerie(previa ? { tipo: 'respaldo', puntos: previa } : { tipo: 'error' })
    }
    void cargar()
    return () => controller.abort()
  }, [estacionId, ultimaMedidaEn])
  return resultado?.clave === clave ? resultado.serie : { tipo: 'cargando' }
}

export function TarjetaEstacionRio({ estacion, onCerrar }: { estacion: EstacionTarjeta; onCerrar: () => void }) {
  const raiz = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const { lectura } = estacion
  const t = useTextos().fichaCuerpo.estacionRio
  const serie = useSerie(estacion.estacionId, lectura?.medidaEn ?? null)

  useEffect(() => {
    raiz.current?.focus({ preventScroll: true })
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  }, [estacion.estacionId, onCerrar])

  const puntos = serie.tipo === 'lista' || serie.tipo === 'respaldo' ? serie.puntos : []
  const umbrales = [lectura?.alertaM ?? null, lectura?.evacuacionM ?? null]
  const trazo = trazoSparkline(puntos, { ancho: ANCHO, alto: ALTO, margen: 4, umbrales })
  const ahora = new Date()
  const nivel = nivelActual(lectura?.lecturaM ?? null, lectura?.alertaM ?? null, lectura?.evacuacionM ?? null, t)

  return (
    <div
      ref={raiz}
      className="map-popup tarjeta-estacion"
      data-testid="tarjeta-estacion-rio"
      role="dialog"
      aria-labelledby={idTitulo}
      tabIndex={-1}
      data-estado={estacion.estado}
      data-vencida={estacion.vencida || undefined}
    >
      <div className="tarjeta-estacion__cabecera">
        <div>
          <h3 id={idTitulo} className="tarjeta-estacion__titulo">{estacion.nombre}</h3>
          <p className="tarjeta-estacion__sub">{t.rio[estacion.rio]} · Prefectura Naval Argentina</p>
        </div>
        <span className="tarjeta-estacion__estado">{etiquetaEstado(t, estacion.estado)}</span>
      </div>

      <dl className="tarjeta-estacion__cifras">
        <div className={`tarjeta-estacion__cifra tarjeta-estacion__cifra--actual-${nivel.estado}`}>
          <dt>{t.actual}</dt>
          <dd>{cifra(lectura?.lecturaM ?? null, t.sinDato)}</dd>
          {nivel.nota && <dd className="tarjeta-estacion__exceso">{nivel.nota}</dd>}
        </div>
        <div className="tarjeta-estacion__cifra tarjeta-estacion__cifra--alerta">
          <dt>Alerta</dt>
          <dd>{cifra(lectura?.alertaM ?? null, t.sinDato)}</dd>
        </div>
        <div className="tarjeta-estacion__cifra tarjeta-estacion__cifra--evacuacion">
          <dt>{t.evacuacionDt}</dt>
          <dd>{cifra(lectura?.evacuacionM ?? null, t.sinDato)}</dd>
        </div>
      </dl>

      {lectura ? (
        <p className="tarjeta-estacion__hora">
          <time dateTime={lectura.medidaEn} className={estacion.vencida ? 'tarjeta-estacion__aviso' : undefined} title={estacion.vencida ? t.lecturaVencida : undefined}>
            {haceCuanto(lectura.medidaEn, ahora, t.hace)}
          </time>
          {' · '}
          {formatoFechaRegion(OPCIONES_FECHA).format(new Date(lectura.medidaEn))}
          {lectura.inconsistente && <span> · {t.inconsistente}</span>}
        </p>
      ) : (
        <p className="tarjeta-estacion__hora">{t.sinLecturas}</p>
      )}

      <figure className="tarjeta-estacion__grafico">
        {serie.tipo === 'cargando' && <p className="tarjeta-estacion__sub">{t.cargandoSerie}</p>}
        {serie.tipo === 'error' && <p className="tarjeta-estacion__sub">{t.errorSerie}</p>}
        {serie.tipo === 'respaldo' && <p className="tarjeta-estacion__sub">{t.respaldoSerie}</p>}
        {(serie.tipo === 'lista' || serie.tipo === 'respaldo') && !trazo && <p className="tarjeta-estacion__sub">{t.pocasLecturas}</p>}
        {trazo && (
          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" height={ALTO} role="img" aria-label={t.alturaRio(DIAS_SERIE)}>
            {trazo.lineas.map((linea) => {
              const tipo = linea.valor === lectura?.evacuacionM ? 'evacuacion' : 'alerta'
              // Two close thresholds: the alert label goes under its line so both read.
              const pegadas = trazo.lineas.length === 2 && Math.abs(trazo.lineas[0].y - trazo.lineas[1].y) < 12
              const yTexto = tipo === 'alerta' && pegadas ? linea.y + 10 : linea.y - 3
              return (
                <g key={linea.valor}>
                  <line className={`tarjeta-estacion__umbral--${tipo}`} x1={0} x2={ANCHO} y1={linea.y} y2={linea.y} />
                  <text className={`tarjeta-estacion__umbral-texto tarjeta-estacion__umbral-texto--${tipo}`} x={ANCHO} y={yTexto} textAnchor="end">
                    {etiquetaUmbral(t, linea.valor, tipo)}
                  </text>
                </g>
              )
            })}
            <path className="tarjeta-estacion__linea" d={trazo.path} />
            <circle className="tarjeta-estacion__punto" cx={trazo.ultimo.x} cy={trazo.ultimo.y} r={3} />
          </svg>
        )}
        <figcaption className="tarjeta-estacion__sub">
          {t.ultimosDias(DIAS_SERIE)}
        </figcaption>
      </figure>

      <dl className="tarjeta-estacion__datos">
        <div><dt>{t.variacion24}</dt><dd>{textoVariacion(variacionEnVentana(puntos, 24), t.sinDato)}</dd></div>
        <div><dt>{t.variacion72}</dt><dd>{textoVariacion(variacionEnVentana(puntos, 72), t.sinDato)}</dd></div>
        <div><dt>{t.hastaAlerta}</dt><dd>{textoDistancia(t, distanciaAUmbral(lectura?.lecturaM ?? null, lectura?.alertaM ?? null))}</dd></div>
        <div><dt>{t.hastaEvacuacion}</dt><dd>{textoDistancia(t, distanciaAUmbral(lectura?.lecturaM ?? null, lectura?.evacuacionM ?? null))}</dd></div>
      </dl>
    </div>
  )
}
