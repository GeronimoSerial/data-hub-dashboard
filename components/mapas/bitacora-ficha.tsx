'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { momentoCortoHistorial } from '@/components/infraestructura/historial-formato'
import type { MovimientoHistorial } from '@/components/infraestructura/historial-movimiento'
import type { EventoMovimiento } from '@/lib/infraestructura/movimiento-eventos'
import type { LlamadaFicha } from '@/components/call-center/llamadas-ficha'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import type { Idioma } from '@/lib/i18n'
import styles from './ficha-escuela-pagina.module.css'

type Filtro = 'todo' | 'parte' | 'llamadas'

/** One line of an entry: who or what changed (bold) and how. */
export interface LineaBitacora {
  sujeto: string
  detalle: string
}

interface EntradaBitacora {
  id: string
  fuente: 'parte' | 'llamada'
  creadaEn: string
  lineas: LineaBitacora[]
  nota: string | null
}

const VISIBLES_INICIALES = 15
// A back-dated load only matters when it differs by more than a moment.
const UMBRAL_VIGENCIA_MS = 30 * 60_000

interface TextosBitacora {
  supervisor: string
  escuela: string
  llamada: (operador: string) => string
  rigeDesde: (momento: string) => string
  seCargo: (paso: string) => string
  gravedadPaso: (paso: string) => string
  alcancePaso: (paso: string) => string
}

function lineaEvento(evento: EventoMovimiento, tb: TextosBitacora): LineaBitacora {
  const sujeto = evento.motivo ?? tb.escuela
  switch (evento.tipo) {
    case 'nueva':
      return { sujeto, detalle: tb.seCargo(evento.paso) }
    case 'gravedad':
      return { sujeto, detalle: tb.gravedadPaso(evento.paso) }
    case 'alcance':
      return { sujeto, detalle: tb.alcancePaso(evento.paso) }
    case 'datos': {
      // The log text repeats the situation name as a prefix; the subject already carries it.
      const prefijo = `${evento.motivo}: `
      return { sujeto, detalle: evento.texto.startsWith(prefijo) ? evento.texto.slice(prefijo.length) : evento.texto }
    }
    case 'general':
    case 'evidencia':
      return { sujeto, detalle: evento.texto }
    default:
      return { sujeto, detalle: evento.paso }
  }
}

/** Lines of a movement, situation first; older payloads without events fall back to the title. */
export function lineasMovimiento(movimiento: MovimientoHistorial, tb: TextosBitacora): LineaBitacora[] {
  if (movimiento.eventos && movimiento.eventos.length > 0) return movimiento.eventos.map((evento) => lineaEvento(evento, tb))
  const respaldo = movimiento.titulo || movimiento.cambios[0]
  return respaldo ? [{ sujeto: tb.escuela, detalle: respaldo }] : []
}

function notaMovimiento(movimiento: MovimientoHistorial, ahora: Date | null, idioma: Idioma, tb: TextosBitacora): string | null {
  const partes: string[] = []
  if (movimiento.rol === 'supervisor') partes.push(tb.supervisor)
  const diferencia = Date.parse(movimiento.creadaEn) - Date.parse(movimiento.rigeDesde)
  if (Number.isFinite(diferencia) && Math.abs(diferencia) > UMBRAL_VIGENCIA_MS) {
    partes.push(tb.rigeDesde(momentoCortoHistorial(movimiento.rigeDesde, ahora, idioma)))
  }
  return partes.length > 0 ? partes.join(' · ') : null
}

function construirEntradas(
  movimientos: MovimientoHistorial[],
  llamadas: LlamadaFicha[],
  ahora: Date | null,
  idioma: Idioma,
  tb: TextosBitacora,
): EntradaBitacora[] {
  const deParte = movimientos
    .map((movimiento) => ({
      id: `m-${movimiento.id}`,
      fuente: 'parte' as const,
      creadaEn: movimiento.creadaEn,
      lineas: lineasMovimiento(movimiento, tb),
      nota: notaMovimiento(movimiento, ahora, idioma, tb),
    }))
    .filter((entrada) => entrada.lineas.length > 0)
  const deLlamadas = llamadas.map((llamada) => ({
    id: `l-${llamada.id}`,
    fuente: 'llamada' as const,
    creadaEn: llamada.creadaEn,
    lineas: [{ sujeto: tb.llamada(llamada.callerNombre), detalle: '' }],
    nota: llamada.respuestaDirector ? `«${llamada.respuestaDirector}»` : null,
  }))
  return [...deParte, ...deLlamadas].sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
}

export function BitacoraFicha({
  movimientos,
  llamadas,
  ahoraMs,
}: {
  movimientos: MovimientoHistorial[]
  /** Undefined when the viewer cannot see call-center calls. */
  llamadas?: LlamadaFicha[]
  ahoraMs: number | null
}) {
  const tb = useTextos().fichaBitacora
  const idioma = useIdioma()
  const [filtro, setFiltro] = useState<Filtro>('todo')
  const [expandida, setExpandida] = useState(false)
  const ahora = ahoraMs === null ? null : new Date(ahoraMs)

  const entradas = useMemo(
    () => construirEntradas(movimientos, llamadas ?? [], ahoraMs === null ? null : new Date(ahoraMs), idioma, tb),
    [movimientos, llamadas, ahoraMs, idioma, tb],
  )
  const filtradas = entradas.filter((entrada) =>
    filtro === 'todo' ? true : filtro === 'parte' ? entrada.fuente === 'parte' : entrada.fuente === 'llamada',
  )
  const visibles = expandida ? filtradas : filtradas.slice(0, VISIBLES_INICIALES)
  const ocultas = filtradas.length - visibles.length

  const filtros: Array<{ id: Filtro; etiqueta: string }> = llamadas
    ? [
        { id: 'todo', etiqueta: tb.todo },
        { id: 'parte', etiqueta: tb.parte },
        { id: 'llamadas', etiqueta: tb.llamadas },
      ]
    : []

  return (
    <div className={styles.bitacora}>
      {(filtros.length > 0 || llamadas) && (
        <div className={styles.bitacoraFiltros}>
          {filtros.length > 0 && (
            <div role="group" aria-label={tb.filtrar} className={styles.filtros}>
              {filtros.map((opcion) => (
                <button
                  key={opcion.id}
                  type="button"
                  className={styles.filtro}
                  aria-pressed={filtro === opcion.id}
                  onClick={() => {
                    setFiltro(opcion.id)
                    setExpandida(false)
                  }}
                >
                  {opcion.etiqueta}
                </button>
              ))}
            </div>
          )}
          {llamadas && (
            <Link href="/call-center" className={styles.linkAccion}>
              {tb.callCenter}
            </Link>
          )}
        </div>
      )}

      {visibles.length === 0 ? (
        <p className={styles.emptyState}>{tb.vacia}</p>
      ) : (
        <ol className={styles.timeline}>
          {visibles.map((entrada) => (
            <li key={entrada.id} className={styles.timelineEntrada} data-fuente={entrada.fuente}>
              <div className={styles.timelineCuerpo}>
                {entrada.lineas.map((linea, indice) => (
                  <p key={indice} className={styles.timelineLinea}>
                    <strong className={styles.timelineSujeto}>{linea.sujeto}</strong>
                    {linea.detalle && <span className={styles.timelineDetalle}>{` · ${linea.detalle}`}</span>}
                  </p>
                ))}
                {entrada.nota && <p className={styles.timelineNota}>{entrada.nota}</p>}
              </div>
              <time dateTime={entrada.creadaEn} className={styles.timelineHora}>
                {momentoCortoHistorial(entrada.creadaEn, ahora, idioma)}
              </time>
            </li>
          ))}
        </ol>
      )}

      {ocultas > 0 && (
        <button type="button" className={styles.verMas} onClick={() => setExpandida(true)}>
          {tb.verMas(ocultas)}
        </button>
      )}
    </div>
  )
}
