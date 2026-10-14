'use client'

import * as React from 'react'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { useEffect, useMemo, useState, type JSX } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { DtoVeredicto, MetricaDtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import type { EventoTerreno } from '@/lib/infraestructura/veredicto/eventos-terreno'
import { nombreDepartamento } from '@/lib/infraestructura/veredicto/niveles'
import {
  describirAguaArriba,
  describirTraza,
  horaArt,
  type TrazaLegible,
} from '@/lib/infraestructura/veredicto/traza-texto'
import { NivelChip } from './nivel-chip'
import { VeredictoAcciones } from './veredicto-acciones'

export type { EventoTerreno }

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  onSeleccionarDepartamento?(departamentoId: string): void
  eventos?: EventoTerreno[]
  acciones?: React.ReactNode
}

type EstadoCarga = 'cargando' | 'error' | 'ok'

const PREFIJO_DEPARTAMENTO = 'departamento:'

function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-')
  return `${d}/${m}`
}

function diaSemana(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', { weekday: 'long' })
}

// La etiqueta sale del `tipoDia` persistido (calculado en hora argentina por el
// job), no del reloj del navegador.
function etiquetaTemporal(tipoDia: DtoVeredicto['tipoDia']): 'OBSERVADO' | 'HOY' | 'PRONÓSTICO' {
  if (tipoDia === 'hoy') return 'HOY'
  return tipoDia === 'observado' ? 'OBSERVADO' : 'PRONÓSTICO'
}

function prettifyDepartamento(id: string): string {
  // Mismo nombre (con tildes) que el resto del mapa.
  return etiquetaDepartamento(id.toUpperCase())
}

function primeraOracion(texto: string | null): string {
  if (!texto) return ''
  return texto.split(/(?<=[.!?])\s/)[0] ?? ''
}

type NivelRadar = 'bajo' | 'moderado' | 'alto' | 'muy_alto'
type PuntoRadar = {
  departamento: string | null
  horizonteHoras: number
  nivelRiesgo: NivelRadar | null
}
type ConteoNiveles = Partial<Record<NivelRadar, number>>

const ORDEN_NIVELES_RADAR: NivelRadar[] = ['muy_alto', 'alto', 'moderado', 'bajo']
const ETIQUETA_NIVEL_RADAR: Record<NivelRadar, string> = {
  muy_alto: 'muy alto',
  alto: 'alto',
  moderado: 'moderado',
  bajo: 'bajo',
}

function claveDepartamento(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

function contarNivelesPorDepartamento(puntos: PuntoRadar[]): Record<string, ConteoNiveles> {
  const mapa: Record<string, ConteoNiveles> = {}
  for (const p of puntos) {
    if (p.horizonteHoras !== 72 || !p.nivelRiesgo || !p.departamento) continue
    const clave = claveDepartamento(p.departamento)
    const conteo = mapa[clave] ?? {}
    conteo[p.nivelRiesgo] = (conteo[p.nivelRiesgo] ?? 0) + 1
    mapa[clave] = conteo
  }
  return mapa
}

function textoEscuelasPorRiesgo(conteo: ConteoNiveles | undefined): string {
  if (!conteo) return ''
  return ORDEN_NIVELES_RADAR.filter((nivel) => (conteo[nivel] ?? 0) > 0)
    .map((nivel) => `${conteo[nivel]} ${ETIQUETA_NIVEL_RADAR[nivel]}`)
    .join(' · ')
}

function etiquetaMetrica(metrica: MetricaDtoVeredicto): string {
  const unidad = metrica.unidad ? ` ${metrica.unidad}` : ''
  return `${metrica.etiqueta} ${String(metrica.valor)}${unidad}`
}

const NOMBRE_FUENTE: Record<string, string> = {
  glofas: 'caudal pronosticado (GloFAS)',
  ensamble: 'ensamble de lluvia',
  ecmwf: 'lluvia pronosticada (ECMWF)',
  imerg: 'lluvia observada (NASA IMERG)',
  prefectura: 'alturas de Prefectura',
  smn: 'alertas del SMN',
}

function textoItem(item: unknown): string {
  if (typeof item === 'string') return NOMBRE_FUENTE[item] ?? item
  if (item !== null && typeof item === 'object') {
    const r = item as Record<string, unknown>
    return String(r.etiqueta ?? r.id ?? r.fuente ?? JSON.stringify(item))
  }
  return String(item)
}

function descripcionTraza(item: unknown, metricas: MetricaDtoVeredicto[]): string {
  if (item === null || typeof item !== 'object') return textoItem(item)
  return describirTraza(item as TrazaLegible, metricas)
}

function extraerVeredictos(body: unknown): DtoVeredicto[] {
  if (Array.isArray(body)) return body as DtoVeredicto[]
  if (body !== null && typeof body === 'object' && Array.isArray((body as { veredictos?: unknown }).veredictos)) {
    return (body as { veredictos: DtoVeredicto[] }).veredictos
  }
  return []
}

function DetalleVeredicto({
  veredicto,
  metricas,
  ahoraMs,
}: {
  veredicto: DtoVeredicto
  metricas: MetricaDtoVeredicto[]
  /** Instante de referencia para "hace N h", fijado al abrir el modal. */
  ahoraMs: number
}): JSX.Element {
  const frases = (veredicto.frases ?? []) as Array<{
    texto?: string
    refs?: string[]
  }>
  return (
    <section aria-label="Detalle del veredicto" className="veredicto-detalle">
      <header className="veredicto-detalle__encabezado">
        <h3>
          {diaSemana(veredicto.fecha)} {fechaCorta(veredicto.fecha)} · {etiquetaTemporal(veredicto.tipoDia)}
        </h3>
        <NivelChip nivel={veredicto.nivel} />
        {veredicto.enCalibracion ? <span className="badge veredicto-calibracion">En calibración</span> : null}
        <span className="veredicto-detalle__meta">generado {horaArt(veredicto.generadoEn)}</span>
        {veredicto.tipoDia === 'hoy' && veredicto.imergHasta ? (
          <span className="veredicto-detalle__meta">
            Lluvia observada hasta {horaArt(veredicto.imergHasta)} (hace{' '}
            {Math.round((ahoraMs - Date.parse(veredicto.imergHasta)) / 3600_000)} h)
          </span>
        ) : null}
      </header>

      {/* Con frases de IA, `texto` es su concatenación: se muestra una sola vez. */}
      {veredicto.texto && frases.length === 0 ? <p>{veredicto.texto}</p> : null}

      {frases.length > 0 ? (
        <ul className="veredicto-detalle__frases">
          {frases.map((frase, i) => (
            <li key={i}>
              <span>{frase.texto}</span>{' '}
              <span className="veredicto-detalle__refs">
                {(frase.refs ?? []).map((refId) => {
                  const metrica = metricas.find((m) => m.id === refId)
                  if (!metrica) return null
                  const etiqueta = etiquetaMetrica(metrica)
                  return metrica.fuenteUrl ? (
                    <a key={refId} href={metrica.fuenteUrl} target="_blank" rel="noreferrer">
                      {etiqueta}
                    </a>
                  ) : (
                    <span key={refId}>{etiqueta}</span>
                  )
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {veredicto.traza.length > 0 ? (
        <div className="veredicto-seccion">
          <h4>Por qué este nivel</h4>
          <ul>
            {veredicto.traza.map((item, i) => (
              <li key={i}>{descripcionTraza(item, metricas)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {veredicto.aguasArriba.length > 0 ? (
        <div className="veredicto-seccion">
          <h4>Aguas arriba (contexto, no modifica el nivel)</h4>
          <ul>
            {veredicto.aguasArriba.map((a) => (
              <li key={a.estacionId}>{describirAguaArriba(a)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {veredicto.fuentesAusentes.length > 0 ? (
        <p className="veredicto-detalle__nota">
          Fuentes ausentes: {veredicto.fuentesAusentes.map(textoItem).join(', ')}
        </p>
      ) : null}

      {veredicto.fuente === 'plantilla' ? (
        <p className="veredicto-detalle__nota">Generado por reglas (IA no disponible)</p>
      ) : null}
    </section>
  )
}

export function VeredictoModal({
  open,
  onOpenChange,
  onSeleccionarDepartamento,
  eventos,
  acciones = <VeredictoAcciones />,
}: Props): JSX.Element {
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [veredictos, setVeredictos] = useState<DtoVeredicto[]>([])
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [eventosCargados, setEventosCargados] = useState<EventoTerreno[]>([])
  const [conteoRadar, setConteoRadar] = useState<Record<string, ConteoNiveles>>({})
  const [ahoraMs] = useState(() => Date.now())

  useEffect(() => {
    if (!open) return
    let cancelado = false
    fetch('/api/infraestructura/radar?horizonte=72&pageSize=1', {
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { puntos?: PuntoRadar[] }
        return contarNivelesPorDepartamento(Array.isArray(body.puntos) ? body.puntos : [])
      })
      .then((conteo) => {
        if (!cancelado) setConteoRadar(conteo)
      })
      .catch(() => {
        // Fallo silencioso: sin conteos, la lista de departamentos sigue igual.
      })
    return () => {
      cancelado = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelado = false
    fetch('/api/infraestructura/veredictos', {
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return extraerVeredictos(await res.json())
      })
      .then((lista) => {
        if (cancelado) return
        setVeredictos(lista)
        setEstado('ok')
      })
      .catch(() => {
        if (cancelado) return
        setEstado('error')
      })
    return () => {
      cancelado = true
    }
  }, [open])

  const porFecha = useMemo(() => {
    const mapa = new Map<string, DtoVeredicto[]>()
    for (const v of veredictos) {
      mapa.set(v.fecha, [...(mapa.get(v.fecha) ?? []), v])
    }
    return new Map([...mapa.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  }, [veredictos])

  const fechas = [...porFecha.keys()]
  const fechaHoy = veredictos.find((v) => v.tipoDia === 'hoy')?.fecha
  const fechaDefault = fechaHoy ?? fechas[fechas.length - 1] ?? null
  const fechaActiva = seleccion && porFecha.has(seleccion) ? seleccion : fechaDefault

  const delDia = fechaActiva ? (porFecha.get(fechaActiva) ?? []) : []
  const provincia = delDia.find((v) => v.ambito === 'provincia') ?? null
  const departamentos = delDia.filter((v) => v.ambito !== 'provincia')
  const eventosVisibles = eventos ?? eventosCargados
  const eventosDelDia = fechaActiva ? eventosVisibles.filter((e) => e.fecha === fechaActiva) : []

  useEffect(() => {
    if (!open || eventos !== undefined || estado !== 'ok' || veredictos.length === 0) return
    const fechasOrdenadas = veredictos.map((v) => v.fecha).sort()
    const desde = fechasOrdenadas[0]
    const hasta = fechasOrdenadas[fechasOrdenadas.length - 1]
    let cancelado = false
    fetch(`/api/infraestructura/veredictos/eventos?desde=${desde}&hasta=${hasta}`, {
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { eventos?: EventoTerreno[] }
        return Array.isArray(body.eventos) ? body.eventos : []
      })
      .then((lista) => {
        if (!cancelado) setEventosCargados(lista)
      })
      .catch(() => {
        if (!cancelado) setEventosCargados([])
      })
    return () => {
      cancelado = true
    }
  }, [open, eventos, estado, veredictos])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="veredicto-modal">
        <div className="veredicto-modal__cabecera">
          <DialogTitle>Veredicto diario</DialogTitle>
          {acciones ? <div>{acciones}</div> : null}
        </div>

        {estado === 'cargando' ? <p className="veredicto-modal__estado">Cargando veredictos…</p> : null}
        {estado === 'error' ? (
          <p role="alert" className="veredicto-modal__estado veredicto-modal__estado--error">
            No se pudieron cargar los veredictos.
          </p>
        ) : null}
        {estado === 'ok' && fechas.length === 0 ? (
          <p className="veredicto-modal__estado">Sin veredictos todavía para este período.</p>
        ) : null}

        {estado === 'ok' && fechas.length > 0 ? (
          <div className="veredicto-modal__cuerpo">
            <div role="group" aria-label="Línea de tiempo" className="veredicto-timeline">
              {fechas.map((fecha) => {
                const prov = (porFecha.get(fecha) ?? []).find((v) => v.ambito === 'provincia')
                const activa = fecha === fechaActiva
                return (
                  <button
                    key={fecha}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => setSeleccion(fecha)}
                    className="chip veredicto-timeline__dia"
                  >
                    <span className="veredicto-timeline__fecha">{fechaCorta(fecha)}</span>
                    {prov ? <NivelChip nivel={prov.nivel} /> : null}
                    {prov ? (
                      <span className="veredicto-timeline__tipo">{etiquetaTemporal(prov.tipoDia).toLowerCase()}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {provincia ? (
              <DetalleVeredicto veredicto={provincia} metricas={provincia.metricas} ahoraMs={ahoraMs} />
            ) : (
              <p className="veredicto-seccion__vacio">Sin veredicto de provincia para este día.</p>
            )}

            <section aria-label="Departamentos con señal" className="veredicto-seccion">
              <h3>Departamentos con señal</h3>
              <p className="veredicto-seccion__nota">
                Nivel del día según reglas del veredicto: lluvia, ríos y pronóstico por departamento.
              </p>
              {departamentos.length === 0 ? (
                <p className="veredicto-seccion__vacio">Sin departamentos con señal para este día.</p>
              ) : (
                <ul>
                  {departamentos.map((d) => {
                    const id = d.ambito.startsWith(PREFIJO_DEPARTAMENTO)
                      ? d.ambito.slice(PREFIJO_DEPARTAMENTO.length)
                      : d.ambito
                    return (
                      <li key={d.id} className="veredicto-depto">
                        <NivelChip nivel={d.nivel} />
                        <span className="veredicto-depto__nombre">{prettifyDepartamento(id)}</span>
                        <span className="veredicto-depto__resumen">{primeraOracion(d.texto)}</span>
                        {textoEscuelasPorRiesgo(conteoRadar[claveDepartamento(id)]) ? (
                          <span className="veredicto-depto__escuelas" data-testid="veredicto-depto-escuelas">
                            Escuelas por riesgo actual (hoy):{' '}
                            {textoEscuelasPorRiesgo(conteoRadar[claveDepartamento(id)])}
                          </span>
                        ) : null}
                        <Button type="button" variant="ghost" size="sm" onClick={() => onSeleccionarDepartamento?.(id)}>
                          Ver en el mapa
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section aria-label="Confirmado en terreno (no modifica el nivel)" className="veredicto-seccion">
              <h3>Confirmado en terreno (no modifica el nivel)</h3>
              {eventosDelDia.length === 0 ? (
                <p className="veredicto-seccion__vacio">Sin eventos confirmados con fuente verificable para este día.</p>
              ) : (
                <ul>
                  {eventosDelDia.map((e) => (
                    <li key={e.id} className="veredicto-evento">
                      <strong>{e.titulo}</strong>
                      <span>
                        {e.lugar} ({nombreDepartamento(e.departamento)}) · {e.fechaTexto}
                      </span>
                      <span className="badge veredicto-nivel">{e.confianzaTexto}</span>
                      <a href={e.fuente.url} target="_blank" rel="noopener noreferrer">
                        {e.fuente.medio}
                        {e.fuente.fecha ? `, ${e.fuente.fecha}` : ''}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
