'use client'

import { zonaHorariaRegion } from '@/lib/infraestructura/formato-region'
import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type JSX } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { DtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import type { EventoTerreno } from '@/lib/infraestructura/veredicto/eventos-terreno'
import { etiquetaNivel, nombreDepartamento } from '@/lib/infraestructura/veredicto/niveles'
import { lecturaDelDia } from '@/lib/infraestructura/veredicto/resumen'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { NivelChip } from './nivel-chip'
import { contarPalabras, pasoEscritura, TextoIA, useEscribiendo } from './texto-ia'
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

function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-')
  return `${d}/${m}`
}

function diaSemana(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', { weekday: 'long' })
}

// The label comes from the stored `tipoDia` (computed in Argentina time by the
// job), not from the browser clock.
function fechaHoyArgentina(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: zonaHorariaRegion() })
}

function diaSemanaCorto(fecha: string): string {
  const dia = diaSemana(fecha).slice(0, 3)
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}`
}

function etiquetaTemporal(tipoDia: DtoVeredicto['tipoDia']): string {
  if (tipoDia === 'hoy') return 'hoy'
  return tipoDia === 'observado' ? 'observado' : 'pronóstico'
}

function etiquetaDia(tipoDia: string, fecha: string): string {
  if (tipoDia === 'hoy') return 'Hoy'
  const dia = diaSemana(fecha)
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${fechaCorta(fecha)} · ${etiquetaTemporal(tipoDia)}`
}

function extraerVeredictos(body: unknown): DtoVeredicto[] {
  if (Array.isArray(body)) return body as DtoVeredicto[]
  if (body !== null && typeof body === 'object' && Array.isArray((body as { veredictos?: unknown }).veredictos)) {
    return (body as { veredictos: DtoVeredicto[] }).veredictos
  }
  return []
}

/** Text that types in only when it was written by the AI. */
function Texto({ texto, ia, inicio, paso }: { texto: string; ia: boolean; inicio: number; paso: number }): JSX.Element {
  return ia ? <TextoIA texto={texto} inicio={inicio} paso={paso} /> : <>{texto}</>
}

function VeredictoDelDia({
  fecha,
  fechaHoy,
  delDia,
  onSeleccionarDepartamento,
}: {
  fecha: string
  fechaHoy: string
  delDia: DtoVeredicto[]
  onSeleccionarDepartamento?(departamentoId: string): void
}): JSX.Element {
  const lectura = lecturaDelDia(delDia)
  const tr = useTextos().residuos
  const { provincia, titular, lineas, sinNovedad, conIa } = lectura
  const tipoDia = fecha === fechaHoy ? 'hoy' : fecha < fechaHoy ? 'observado' : 'pronostico'
  // The headline and every line type in as one sequence within one time budget.
  const textos = [titular, ...lineas.map((l) => l.texto)]
  const total = contarPalabras(textos)
  const paso = pasoEscritura(total)
  const inicio = (i: number) => contarPalabras(textos.slice(0, i))
  const escribiendo = useEscribiendo(total * paso + 250)

  return (
    <section
      aria-label={tr.veredicto.ariaDia}
      className="veredicto-dia"
      data-escribiendo={conIa && escribiendo ? 'true' : undefined}
    >
      <header className="veredicto-dia__encabezado">
        <h3>{etiquetaDia(tipoDia, fecha)}</h3>
        {provincia ? <NivelChip nivel={provincia.nivel} /> : null}
        {provincia?.enCalibracion ? <span className="veredicto-calibracion">{tr.veredicto.calibracion}</span> : null}
      </header>

      {delDia.length === 0 ? <p className="veredicto-modal__estado">{tr.veredicto.sinGenerar}</p> : null}

      {titular ? (
        <p className="veredicto-dia__titular">
          <Texto texto={titular} ia={provincia?.fuente === 'ia'} inicio={0} paso={paso} />
        </p>
      ) : (
        <p className="veredicto-dia__vacio">Sin veredicto de provincia para este día.</p>
      )}

      {lineas.length > 0 ? (
        <ul aria-label="Departamentos" className="veredicto-lineas">
          {lineas.map((linea, i) => (
            <li key={linea.veredicto.id} className="veredicto-linea" data-nivel={linea.veredicto.nivel}>
              <div className="veredicto-linea__cabeza">
                <strong>{linea.nombre}</strong>
                <NivelChip nivel={linea.veredicto.nivel} />
                {onSeleccionarDepartamento ? (
                  <button
                    type="button"
                    className="veredicto-linea__mapa"
                    aria-label={`Ver ${linea.nombre} en el mapa`}
                    onClick={() => onSeleccionarDepartamento(linea.id)}
                  >
                    Ver en el mapa
                  </button>
                ) : null}
              </div>
              <p className="veredicto-linea__texto">
                <Texto texto={linea.texto} ia={linea.veredicto.fuente === 'ia'} inicio={inicio(i + 1)} paso={paso} />
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {sinNovedad.length > 0 ? (
        <p className="veredicto-dia__quietos">
          {lineas.length === 0 ? 'Sin novedades en ningún departamento.' : `Sin novedades: ${sinNovedad.join(', ')}.`}
        </p>
      ) : null}

      <p className="veredicto-procedencia">
        {conIa ? (
          <>
            <Sparkles aria-hidden="true" className="veredicto-ia-icono" size={14} strokeWidth={2} />
            Generado con IA · puede contener errores
          </>
        ) : (
          'Generado por reglas automáticas'
        )}
      </p>
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
  const tr = useTextos().residuos
  // Every opening starts on the current day.
  const [abiertoAntes, setAbiertoAntes] = useState(open)
  if (open !== abiertoAntes) {
    setAbiertoAntes(open)
    if (open) setSeleccion(null)
  }
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

  // The stored `tipoDia` is fixed at generation time, so "today" comes from the clock.
  const fechaHoy = fechaHoyArgentina()
  const fechas = porFecha.has(fechaHoy) || porFecha.size === 0 ? [...porFecha.keys()] : [...porFecha.keys(), fechaHoy].sort()
  const fechaActiva = seleccion && fechas.includes(seleccion) ? seleccion : fechaHoy

  const delDia = fechaActiva ? (porFecha.get(fechaActiva) ?? []) : []
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
          <DialogTitle>{tr.veredicto.titulo}</DialogTitle>
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
                    aria-label={[fechaCorta(fecha), prov ? etiquetaNivel(prov.nivel) : null, prov ? etiquetaTemporal(prov.tipoDia) : null].filter(Boolean).join(' · ')}
                    onClick={() => setSeleccion(fecha)}
                    className="veredicto-timeline__dia"
                    data-tipo={fecha === fechaHoy ? 'hoy' : fecha < fechaHoy ? 'observado' : 'pronostico'}
                    data-nivel={prov?.nivel}
                  >
                    <span className="veredicto-timeline__semana">{fecha === fechaHoy ? 'Hoy' : diaSemanaCorto(fecha)}</span>
                    <span className="veredicto-timeline__fecha">{fecha.slice(8)}</span>
                    <span className="veredicto-timeline__nivel" aria-hidden="true" />
                  </button>
                )
              })}
            </div>

            {fechaActiva ? (
              // Keyed by date: the typing effect replays only when another day is shown.
              <VeredictoDelDia
                key={fechaActiva}
                fecha={fechaActiva}
                fechaHoy={fechaHoy}
                delDia={delDia}
                onSeleccionarDepartamento={onSeleccionarDepartamento}
              />
            ) : null}

            {eventosDelDia.length > 0 ? (
              <section aria-label="Confirmado en terreno" className="veredicto-seccion">
                <h3>Confirmado en terreno</h3>
                <ul>
                  {eventosDelDia.map((e) => (
                    <li key={e.id} className="veredicto-evento">
                      <strong>{e.titulo}</strong>
                      <span>
                        {e.lugar} ({nombreDepartamento(e.departamento)}) · {e.fechaTexto} · {e.confianzaTexto}
                      </span>
                      <a href={e.fuente.url} target="_blank" rel="noopener noreferrer">
                        {e.fuente.medio}
                        {e.fuente.fecha ? `, ${e.fuente.fecha}` : ''}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
