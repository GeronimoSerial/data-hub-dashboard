'use client'

import { useState, type JSX } from 'react'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { severidadDelMovimiento } from '@/lib/infraestructura/severidad-movimiento'
import type { MovimientoHistorial } from './historial-movimiento'

export { severidadDelMovimiento }

const ZONA = 'America/Argentina/Buenos_Aires'
const fmtDia = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'short', day: '2-digit', month: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false })
const fmtClave = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' })

function etiquetaDia(fecha: Date, ahora: Date): string {
  const clave = fmtClave.format(fecha)
  const partes = Object.fromEntries(fmtDia.formatToParts(fecha).map((parte) => [parte.type, parte.value]))
  const texto = `${partes.weekday?.replace('.', '')} ${partes.day}/${partes.month}`
  if (clave === fmtClave.format(ahora)) return `Hoy, ${texto}`
  if (clave === fmtClave.format(new Date(ahora.getTime() - 86_400_000))) return `Ayer, ${texto}`
  return texto
}

export function agruparPorDia(movimientos: MovimientoHistorial[], ahora: Date = new Date()) {
  const grupos: Array<{ dia: string; movimientos: MovimientoHistorial[] }> = []
  const ordenados = [...movimientos].sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
  for (const movimiento of ordenados) {
    const dia = etiquetaDia(new Date(movimiento.creadaEn), ahora)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.dia === dia) ultimo.movimientos.push(movimiento)
    else grupos.push({ dia, movimientos: [movimiento] })
  }
  return grupos
}

// Presenta lo más reciente primero, agrupado por fecha local.
export function LineaDeTiempo({ movimientos, limite }: { movimientos: MovimientoHistorial[]; limite?: number }): JSX.Element {
  const [expandida, setExpandida] = useState(false)
  const ordenados = [...movimientos].sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
  const visibles = limite !== undefined && !expandida ? ordenados.slice(0, limite) : ordenados
  const ocultos = ordenados.length - visibles.length

  return (
    <div className="linea-de-tiempo">
      {agruparPorDia(visibles).map((grupo) => (
        <section key={grupo.dia}>
          <h3 className="linea-de-tiempo__dia">{grupo.dia}</h3>
          <ol className="linea-de-tiempo__lista">
            {grupo.movimientos.map((movimiento) => (
              <li key={movimiento.id} className="linea-de-tiempo__entrada">
                <span
                  className="linea-de-tiempo__punto"
                  aria-hidden="true"
                  style={{ background: movimiento.severidad ? colorSeveridad(movimiento.severidad) : 'var(--line)' }}
                />
                <time dateTime={movimiento.creadaEn} className="linea-de-tiempo__hora">
                  {fmtHora.format(new Date(movimiento.creadaEn))}
                </time>
                <div className="linea-de-tiempo__cambios">
                  {movimiento.cambios.map((cambio, indice) => <p key={`${movimiento.id}-${indice}`}>{cambio}</p>)}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {ocultos > 0 ? (
        <button type="button" className="linea-de-tiempo__mas" onClick={() => setExpandida(true)}>
          {ocultos === 1 ? 'Ver 1 movimiento anterior' : `Ver ${ocultos} movimientos anteriores`}
        </button>
      ) : null}
    </div>
  )
}
