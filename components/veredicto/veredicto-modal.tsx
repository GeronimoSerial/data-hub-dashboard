'use client'

import * as React from 'react'
import { useEffect, useMemo, useState, type JSX } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { DtoVeredicto, MetricaDtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import { NivelChip } from './nivel-chip'

export type EventoTerreno = {
  id: string
  fecha: string
  departamento: string
  descripcion: string
  confianza: 'alta' | 'media' | 'baja' | 'muy baja'
  fuenteUrl?: string
}

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  onSeleccionarDepartamento?(departamentoId: string): void
  eventos?: EventoTerreno[]
  acciones?: React.ReactNode
}

type EstadoCarga = 'cargando' | 'error' | 'ok'

const PREFIJO_DEPARTAMENTO = 'departamento:'
const PALABRAS_MINUSCULA = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y'])

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-')
  return `${d}/${m}`
}

function diaSemana(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', { weekday: 'long' })
}

function horaGenerado(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// La etiqueta sale del `tipoDia` persistido (calculado en hora argentina por el
// job), no del reloj del navegador.
function etiquetaTemporal(tipoDia: DtoVeredicto['tipoDia']): 'OBSERVADO' | 'HOY' | 'PRONÓSTICO' {
  if (tipoDia === 'hoy') return 'HOY'
  return tipoDia === 'observado' ? 'OBSERVADO' : 'PRONÓSTICO'
}

function prettifyDepartamento(id: string): string {
  return id
    .toLowerCase()
    .split(' ')
    .map((palabra, i) => (i > 0 && PALABRAS_MINUSCULA.has(palabra) ? palabra : palabra.charAt(0).toUpperCase() + palabra.slice(1)))
    .join(' ')
}

function primeraOracion(texto: string | null): string {
  if (!texto) return ''
  return texto.split(/(?<=[.!?])\s/)[0] ?? ''
}

function etiquetaMetrica(metrica: MetricaDtoVeredicto): string {
  const unidad = metrica.unidad ? ` ${metrica.unidad}` : ''
  return `${metrica.etiqueta} ${String(metrica.valor)}${unidad}`
}

function textoItem(item: unknown): string {
  if (typeof item === 'string') return item
  if (item !== null && typeof item === 'object') {
    const r = item as Record<string, unknown>
    return String(r.etiqueta ?? r.id ?? r.fuente ?? JSON.stringify(item))
  }
  return String(item)
}

function descripcionTraza(item: unknown): string {
  if (item === null || typeof item !== 'object') return textoItem(item)
  const r = item as Record<string, unknown>
  const umbral = r.umbral !== undefined ? ` (umbral ${String(r.umbral)})` : ''
  return `${String(r.regla ?? '')}: ${String(r.valor ?? '')}${umbral}`
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
}: {
  veredicto: DtoVeredicto
  metricas: MetricaDtoVeredicto[]
}): JSX.Element {
  const frases = (veredicto.frases ?? []) as Array<{ texto?: string; refs?: string[] }>
  return (
    <section aria-label="Detalle del veredicto" className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold capitalize">
          {diaSemana(veredicto.fecha)} {fechaCorta(veredicto.fecha)} · {etiquetaTemporal(veredicto.tipoDia)}
        </h3>
        <NivelChip nivel={veredicto.nivel} />
        {veredicto.enCalibracion ? (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">En calibración</span>
        ) : null}
        <span className="text-xs text-muted-foreground">generado {horaGenerado(veredicto.generadoEn)}</span>
      </header>

      {/* Con frases de IA, `texto` es su concatenación: se muestra una sola vez. */}
      {veredicto.texto && frases.length === 0 ? <p className="text-sm">{veredicto.texto}</p> : null}

      {frases.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {frases.map((frase, i) => (
            <li key={i}>
              <span>{frase.texto}</span>{' '}
              {(frase.refs ?? []).map((refId) => {
                const metrica = metricas.find((m) => m.id === refId)
                if (!metrica) return null
                const etiqueta = etiquetaMetrica(metrica)
                return metrica.fuenteUrl ? (
                  <a
                    key={refId}
                    href={metrica.fuenteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mx-1 text-blue-700 underline"
                  >
                    {etiqueta}
                  </a>
                ) : (
                  <span key={refId} className="mx-1">
                    {etiqueta}
                  </span>
                )
              })}
            </li>
          ))}
        </ul>
      ) : null}

      {veredicto.traza.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium">Por qué este nivel</h4>
          <ul className="list-disc pl-5 text-sm">
            {veredicto.traza.map((item, i) => (
              <li key={i}>{descripcionTraza(item)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {veredicto.fuentesAusentes.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Fuentes ausentes: {veredicto.fuentesAusentes.map(textoItem).join(', ')}
        </p>
      ) : null}

      {veredicto.fuente === 'plantilla' ? (
        <p className="text-xs text-muted-foreground">Generado por reglas (IA no disponible)</p>
      ) : null}
    </section>
  )
}

export function VeredictoModal({
  open,
  onOpenChange,
  onSeleccionarDepartamento,
  eventos = [],
  acciones,
}: Props): JSX.Element {
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [veredictos, setVeredictos] = useState<DtoVeredicto[]>([])
  const [seleccion, setSeleccion] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelado = false
    fetch('/api/infraestructura/veredictos', { headers: { Accept: 'application/json' } })
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
  const eventosDelDia = fechaActiva ? eventos.filter((e) => e.fecha === fechaActiva) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DialogTitle>Veredicto diario</DialogTitle>
          {acciones ? <div className="flex flex-wrap gap-2">{acciones}</div> : null}
        </div>

        {estado === 'cargando' ? <p className="text-sm text-muted-foreground">Cargando veredictos…</p> : null}
        {estado === 'error' ? (
          <p role="alert" className="text-sm text-red-700">
            No se pudieron cargar los veredictos.
          </p>
        ) : null}
        {estado === 'ok' && fechas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin veredictos todavía para este período.</p>
        ) : null}

        {estado === 'ok' && fechas.length > 0 ? (
          <div className="space-y-6">
            <div role="group" aria-label="Línea de tiempo" className="flex flex-wrap gap-2">
              {fechas.map((fecha) => {
                const prov = (porFecha.get(fecha) ?? []).find((v) => v.ambito === 'provincia')
                const activa = fecha === fechaActiva
                return (
                  <button
                    key={fecha}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => setSeleccion(fecha)}
                    className={`flex flex-col items-start rounded border px-3 py-1 text-left text-xs ${
                      activa ? 'border-foreground' : 'border-border'
                    }`}
                  >
                    <span className="font-medium">{fechaCorta(fecha)}</span>
                    {prov ? <NivelChip nivel={prov.nivel} /> : null}
                    {prov ? (
                      <span className="text-muted-foreground">{etiquetaTemporal(prov.tipoDia).toLowerCase()}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {provincia ? (
              <DetalleVeredicto veredicto={provincia} metricas={provincia.metricas} />
            ) : (
              <p className="text-sm text-muted-foreground">Sin veredicto de provincia para este día.</p>
            )}

            <section aria-label="Departamentos con señal" className="space-y-2">
              <h3 className="text-sm font-semibold">Departamentos con señal</h3>
              {departamentos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin departamentos con señal para este día.</p>
              ) : (
                <ul className="space-y-2">
                  {departamentos.map((d) => {
                    const id = d.ambito.startsWith(PREFIJO_DEPARTAMENTO)
                      ? d.ambito.slice(PREFIJO_DEPARTAMENTO.length)
                      : d.ambito
                    return (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <NivelChip nivel={d.nivel} />
                        <span className="font-medium">{prettifyDepartamento(id)}</span>
                        <span className="text-muted-foreground">{primeraOracion(d.texto)}</span>
                        <button
                          type="button"
                          className="text-blue-700 underline"
                          onClick={() => onSeleccionarDepartamento?.(id)}
                        >
                          Ver en el mapa
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section aria-label="Confirmado en terreno (no modifica el nivel)" className="space-y-2">
              <h3 className="text-sm font-semibold">Confirmado en terreno (no modifica el nivel)</h3>
              {eventosDelDia.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin eventos confirmados para este día.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {eventosDelDia.map((e) => (
                    <li key={e.id}>
                      <span className="font-medium">{prettifyDepartamento(e.departamento)}</span>{' '}
                      <span>{e.descripcion}</span>{' '}
                      <span className="text-xs text-muted-foreground">confianza {e.confianza}</span>{' '}
                      {e.fuenteUrl ? (
                        <a href={e.fuenteUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                          fuente
                        </a>
                      ) : null}
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
