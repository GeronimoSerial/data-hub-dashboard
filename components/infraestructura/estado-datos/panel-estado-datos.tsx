'use client'

// Panel "Estado de los datos" del Centro de Situación: una línea de resumen
// neutra con los conteos por estado y, al abrirlo, sólo las fuentes con
// problema. Cerrado por defecto; se abre solo si una fuente falló, los jobs
// están en pausa o no se pudo leer el estado. Las
// fuentes al día y las no programadas quedan detrás de "Ver todas las
// fuentes". Rojo sólo para "Falló", ámbar para "Desactualizado"; el estado
// siempre es ícono + texto (el color sólo refuerza).
import { formatoFechaRegion, localeRegion } from '@/lib/infraestructura/formato-region'
import { useState, type JSX } from 'react'
import { CircleCheck, CircleDashed, CircleMinus, CirclePause, CircleX, ChevronDown, Clock, TriangleAlert } from 'lucide-react'
import { DatoFechado } from '@/components/ui/dato-fechado'
import type { EstadoDato, EstadoDatos, ItemEstadoDato } from '@/lib/infraestructura/riesgo/estado-datos/clasificar'
import type { Diccionario } from '@/lib/i18n'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { LatidoFuente } from './latido-fuente'
import type { CorridaLatido } from './latido'
import { traducirMotivo } from './traducir-motivo'
import { traducirNombre } from './traducir-nombre'

const ESTADO_VISUAL: Record<EstadoDato, { clase: string; Icono: typeof CircleCheck }> = {
  fallido: { clase: 'badge--danger', Icono: CircleX },
  sin_datos: { clase: 'badge--neutral', Icono: CircleDashed },
  pausado: { clase: 'badge--warning', Icono: CirclePause },
  atrasado: { clase: 'badge--warning', Icono: Clock },
  ok: { clase: 'badge--success', Icono: CircleCheck },
  deshabilitado: { clase: 'badge--neutral', Icono: CircleMinus },
}

type ClaveEstado = 'fallido' | 'sinDatos' | 'pausado' | 'atrasado' | 'ok' | 'deshabilitado'

const CLAVE_ESTADO: Record<EstadoDato, ClaveEstado> = {
  fallido: 'fallido',
  sin_datos: 'sinDatos',
  pausado: 'pausado',
  atrasado: 'atrasado',
  ok: 'ok',
  deshabilitado: 'deshabilitado',
}

const ORDEN_ESTADO: EstadoDato[] = ['fallido', 'sin_datos', 'pausado', 'atrasado', 'ok', 'deshabilitado']

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

function fechaAbsoluta(iso: string): string {
  const p = Object.fromEntries(formatoFecha().formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}`
}

// Relativa al momento en que se generó el estado (no a Date.now()): el texto
// coincide entre servidor y cliente y no cambia sin datos nuevos.
function haceCuanto(iso: string, referencia: string, t: Diccionario): string {
  const d = t.situacion.estadoDatos
  const minutos = Math.max(0, Math.round((Date.parse(referencia) - Date.parse(iso)) / 60_000))
  if (minutos < 1) return d.recien
  if (minutos < 60) return d.haceMinutos(minutos)
  if (minutos < 48 * 60) return d.haceHoras(Math.round(minutos / 60))
  return d.haceDias(Math.round(minutos / 1440))
}

function Insignia({ estado, t }: { estado: EstadoDato; t: Diccionario }): JSX.Element {
  const { clase, Icono } = ESTADO_VISUAL[estado]
  return (
    <span className={`badge ${clase}`}>
      <Icono aria-hidden="true" size={14} />
      {t.situacion.estadoDatos[CLAVE_ESTADO[estado]]}
    </span>
  )
}

function Fila({
  item,
  generadoEn,
  corridas,
  t,
}: {
  item: ItemEstadoDato
  generadoEn: string
  corridas: CorridaLatido[] | null
  t: Diccionario
}): JSX.Element {
  return (
    <li className="situacion-datos__fila" data-testid="estado-datos-item">
      <Insignia estado={item.estado} t={t} />
      <div className="situacion-datos__texto">
        <strong>{traducirNombre(item.nombre, t)}</strong>
        <p className="situacion-datos__secundario">{traducirMotivo(item.motivo, t.situacion)}</p>
        {item.ultimoError && <p className="situacion-datos__error">{item.ultimoError}</p>}
      </div>
      <div className="situacion-datos__latido">
        <LatidoFuente
          corridas={corridas}
          ahora={generadoEn}
          ultimoExitoEn={item.ultimoExitoEn}
          intervaloMinutos={item.intervaloMinutos}
          t={t}
        />
        <span className="situacion-datos__secundario">
          {item.ultimoExitoEn ? (
            <DatoFechado actualizado={t.situacion.estadoDatos.ultimoExito(fechaAbsoluta(item.ultimoExitoEn))}>
              {haceCuanto(item.ultimoExitoEn, generadoEn, t)}
            </DatoFechado>
          ) : (
            t.situacion.estadoDatos.sinExito
          )}
        </span>
      </div>
    </li>
  )
}

function textoResumen(estado: EstadoDatos | null, t: Diccionario): string {
  const d = t.situacion.estadoDatos
  if (estado === null) return d.noLeer
  if (estado.problemas === 0) return d.todosAlDia
  return estado.problemas === 1 ? d.problemaUno : d.problemasVarios(estado.problemas)
}

// Orden de lectura del conteo: de lo sano a lo grave, sin estados en cero.
const ORDEN_CONTEO: EstadoDato[] = ['ok', 'atrasado', 'sin_datos', 'pausado', 'fallido', 'deshabilitado']

function textoConteos(items: ItemEstadoDato[], t: Diccionario): string {
  const d = t.situacion.estadoDatos
  return ORDEN_CONTEO.map((estado) => ({ estado, n: items.filter((i) => i.estado === estado).length }))
    .filter(({ n }) => n > 0)
    .map(({ estado, n }) => d.conteo[CLAVE_ESTADO[estado]](n))
    .join(' · ')
}

const ES_PROBLEMA = (estado: EstadoDato): boolean => estado !== 'ok' && estado !== 'deshabilitado'

function ordenarPorGravedad(items: ItemEstadoDato[]): ItemEstadoDato[] {
  return [...items].sort((a, b) => ORDEN_ESTADO.indexOf(a.estado) - ORDEN_ESTADO.indexOf(b.estado))
}

export function PanelEstadoDatos({
  estado,
  corridas,
}: {
  estado: EstadoDatos | null
  // Historial 72 h por id de item; sin entrada, el latido se arma con el último éxito.
  corridas?: Record<string, CorridaLatido[]>
}): JSX.Element {
  const t = useTextos()
  const d = t.situacion.estadoDatos
  const items = estado?.items ?? []
  const hayProblemas = estado === null || estado.problemas > 0
  const hayFallo = items.some((i) => i.estado === 'fallido')
  const hayAtraso = items.some((i) => i.estado === 'atrasado')
  // La elección del usuario (abrir/cerrar) se respeta en los refrescos.
  const hayPausa = items.some((i) => i.estado === 'pausado')
  // Alarmas que el operador debe ver sin hacer clic: fuente caída, jobs en
  // pausa operativa o estado ilegible.
  const [abierto, setAbierto] = useState(hayFallo || hayPausa || estado === null)
  const [verTodas, setVerTodas] = useState(false)

  const problemas = ordenarPorGravedad(items.filter((i) => ES_PROBLEMA(i.estado)))
  const resto = ordenarPorGravedad(items.filter((i) => !ES_PROBLEMA(i.estado)))
  const tono = hayFallo ? 'fallo' : hayAtraso ? 'atraso' : 'neutro'

  return (
    <details
      className="situacion-datos"
      data-tono={tono}
      open={abierto}
      onToggle={(e) => setAbierto(e.currentTarget.open)}
      data-testid="estado-datos"
      data-problemas={hayProblemas}
    >
      <summary className="situacion-datos__resumen">
        <span className="situacion-datos__titulo">
          <strong>{d.titulo}</strong>
          <span className="situacion-datos__estado">
            {hayProblemas ? (
              <TriangleAlert aria-hidden="true" size={16} className="situacion-datos__icono" />
            ) : (
              <CircleCheck aria-hidden="true" size={16} color="var(--ok)" />
            )}
            {textoResumen(estado, t)}
          </span>
        </span>
        {estado !== null && items.length > 0 && (
          <span className="situacion-datos__conteos" data-testid="estado-datos-conteos">
            {textoConteos(items, t)}
          </span>
        )}
      </summary>
      {estado !== null && (
        <div className="situacion-datos__cuerpo">
          {problemas.length > 0 && (
            <section aria-label={d.fuentesConProblemas}>
              <h3 className="situacion-datos__subtitulo">{d.fuentesConProblemas}</h3>
              <ul className="situacion-datos__lista">
                {problemas.map((item) => (
                  <Fila key={item.id} item={item} generadoEn={estado.generadoEn} corridas={corridas?.[item.id] ?? null} t={t} />
                ))}
              </ul>
            </section>
          )}
          {items.length > 0 && (
            <>
              <button
                type="button"
                className="situacion-datos__ver-todas"
                aria-expanded={verTodas}
                aria-controls="estado-datos-todas"
                onClick={() => setVerTodas((v) => !v)}
              >
                <ChevronDown aria-hidden="true" size={16} data-abierto={verTodas} />
                {d.verTodas}
              </button>
              <div id="estado-datos-todas" hidden={!verTodas}>
                <ul className="situacion-datos__lista">
                  {resto.map((item) => (
                    <Fila key={item.id} item={item} generadoEn={estado.generadoEn} corridas={corridas?.[item.id] ?? null} t={t} />
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </details>
  )
}
