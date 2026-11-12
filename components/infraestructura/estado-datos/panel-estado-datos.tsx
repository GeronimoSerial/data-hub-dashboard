'use client'

// Panel "Estado de los datos" del Centro de Situación: resumen en una línea y,
// al abrirlo, la lista de jobs y fuentes agrupada por área con los problemas
// primero. Cerrado cuando todo está al día; abierto y resaltado si algo falla.
// El estado siempre es ícono + texto (el color sólo refuerza).
import { formatoFechaRegion, localeRegion } from '@/lib/infraestructura/formato-region'
import { useState, type CSSProperties, type JSX } from 'react'
import { CircleCheck, CircleDashed, CircleMinus, CirclePause, CircleX, Clock, TriangleAlert } from 'lucide-react'
import { DatoFechado } from '@/components/ui/dato-fechado'
import type { EstadoDato, EstadoDatos, GrupoDato, ItemEstadoDato } from '@/lib/infraestructura/riesgo/estado-datos/clasificar'

const ESTADO_VISUAL: Record<EstadoDato, { texto: string; clase: string; Icono: typeof CircleCheck }> = {
  fallido: { texto: 'Falló', clase: 'badge--danger', Icono: CircleX },
  sin_datos: { texto: 'Sin datos', clase: 'badge--danger', Icono: CircleDashed },
  pausado: { texto: 'Pausado', clase: 'badge--danger', Icono: CirclePause },
  atrasado: { texto: 'Desactualizado', clase: 'badge--warning', Icono: Clock },
  ok: { texto: 'Al día', clase: 'badge--success', Icono: CircleCheck },
  deshabilitado: { texto: 'No programado', clase: 'badge--neutral', Icono: CircleMinus },
}

const NOMBRE_GRUPO: Record<GrupoDato, string> = {
  riesgo: 'Riesgo',
  hidrometria: 'Hidrometría',
  lluvia: 'Lluvia y pronóstico',
  climatologias: 'Climatologías',
  geo: 'Geográficos y estáticos',
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
function haceCuanto(iso: string, referencia: string): string {
  const minutos = Math.max(0, Math.round((Date.parse(referencia) - Date.parse(iso)) / 60_000))
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  if (minutos < 48 * 60) return `hace ${Math.round(minutos / 60)} h`
  return `hace ${Math.round(minutos / 1440)} días`
}

const estilos = {
  panel: (problemas: boolean): CSSProperties => ({
    border: '1px solid var(--line)',
    borderLeft: `4px solid ${problemas ? 'var(--danger-mark)' : 'var(--line)'}`,
    borderRadius: 'var(--r-md)',
    background: problemas ? 'var(--danger-tint)' : 'var(--fill)',
    margin: 'var(--s-5) 0',
  }),
  resumen: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--s-2) var(--s-3)',
    padding: 'var(--s-3) var(--s-4)',
    cursor: 'pointer',
  } satisfies CSSProperties,
  cuerpo: { padding: '0 var(--s-4) var(--s-4)' } satisfies CSSProperties,
  lista: { listStyle: 'none', margin: 0, padding: 0 } satisfies CSSProperties,
  fila: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 'var(--s-1) var(--s-3)',
    padding: 'var(--s-2) 0',
    borderTop: '1px solid var(--line)',
    minWidth: 0,
  } satisfies CSSProperties,
  texto: { flex: '1 1 16rem', minWidth: 0 } satisfies CSSProperties,
  secundario: { color: 'var(--ink-soft)', fontSize: '0.875rem', margin: 0 } satisfies CSSProperties,
  error: {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.8125rem',
    color: 'var(--danger-ink)',
    overflowWrap: 'anywhere',
    margin: 'var(--s-1) 0 0',
  } satisfies CSSProperties,
}

function Insignia({ estado }: { estado: EstadoDato }): JSX.Element {
  const { texto, clase, Icono } = ESTADO_VISUAL[estado]
  return (
    <span className={`badge ${clase}`}>
      <Icono aria-hidden="true" size={14} />
      {texto}
    </span>
  )
}

function Fila({ item, generadoEn }: { item: ItemEstadoDato; generadoEn: string }): JSX.Element {
  return (
    <li style={estilos.fila} data-testid="estado-datos-item">
      <Insignia estado={item.estado} />
      <div style={estilos.texto}>
        <strong>{item.nombre}</strong>
        <p style={estilos.secundario}>{item.motivo}</p>
        {item.ultimoError && <p style={estilos.error}>{item.ultimoError}</p>}
      </div>
      <span style={estilos.secundario}>
        {item.ultimoExitoEn ? (
          <DatoFechado actualizado={`Último éxito ${fechaAbsoluta(item.ultimoExitoEn)}`}>
            {haceCuanto(item.ultimoExitoEn, generadoEn)}
          </DatoFechado>
        ) : (
          'Sin éxito registrado'
        )}
      </span>
    </li>
  )
}

function textoResumen(estado: EstadoDatos | null): string {
  if (estado === null) return 'No se pudo leer el estado de los datos'
  if (estado.problemas === 0) return 'Todos los datos al día'
  return estado.problemas === 1 ? '1 fuente con problemas' : `${estado.problemas} fuentes con problemas`
}

export function PanelEstadoDatos({ estado }: { estado: EstadoDatos | null }): JSX.Element {
  const hayProblemas = estado === null || estado.problemas > 0
  // La elección del usuario (abrir/cerrar) se respeta en los refrescos.
  const [abierto, setAbierto] = useState(hayProblemas)

  const grupos = new Map<GrupoDato, ItemEstadoDato[]>()
  for (const item of estado?.items ?? []) grupos.set(item.grupo, [...(grupos.get(item.grupo) ?? []), item])
  const peor = (items: ItemEstadoDato[]) => Math.min(...items.map((i) => ORDEN_ESTADO.indexOf(i.estado)))
  const gruposOrdenados = [...grupos.entries()].sort(([, a], [, b]) => peor(a) - peor(b))

  return (
    <details
      style={estilos.panel(hayProblemas)}
      open={abierto}
      onToggle={(e) => setAbierto(e.currentTarget.open)}
      data-testid="estado-datos"
      data-problemas={hayProblemas}
    >
      <summary style={estilos.resumen}>
        <strong>Estado de los datos</strong>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)' }}>
          {hayProblemas ? (
            <TriangleAlert aria-hidden="true" size={16} color="var(--danger-mark)" />
          ) : (
            <CircleCheck aria-hidden="true" size={16} color="var(--ok)" />
          )}
          {textoResumen(estado)}
        </span>
      </summary>
      {estado !== null && (
        <div style={estilos.cuerpo}>
          {gruposOrdenados.map(([grupo, items]) => (
            <section key={grupo} aria-labelledby={`estado-datos-${grupo}`}>
              <h3 id={`estado-datos-${grupo}`} style={{ fontSize: '0.9375rem', margin: 'var(--s-4) 0 var(--s-1)' }}>
                {NOMBRE_GRUPO[grupo]}
              </h3>
              <ul style={estilos.lista}>
                {items.map((item) => (
                  <Fila key={item.id} item={item} generadoEn={estado.generadoEn} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </details>
  )
}
