'use client'

import { useState, type JSX } from 'react'
import { Button } from '@/components/ui/button'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { severidadDelMovimiento } from '@/lib/infraestructura/severidad-movimiento'
import { formatearMomentoHistorial } from './historial-formato'
import type { MovimientoHistorial } from './historial-movimiento'

export { severidadDelMovimiento }

function esConfirmacionSinCambios(cambio: string): boolean {
  return /^sigue igual\s*:/i.test(cambio.trim())
}

function detalleYaIncluido(titulo: string, detalle: string): boolean {
  if (titulo === detalle) return true

  // Los títulos persistidos antes del cambio incluyen gravedad y vigencia.
  const severidad = /^Severidad de "(.+)": (.+) → (.+)$/.exec(detalle)
  if (severidad) return titulo.startsWith(`${severidad[1]} · ${severidad[2]} → ${severidad[3]} ·`)

  const agregado = /^Se agregó "(.+)" · Severidad (.+)$/.exec(detalle)
  if (agregado) return titulo.startsWith(`${agregado[1]} · ${agregado[2]} ·`)

  return false
}

// Presenta lo más reciente primero, con la fecha local en cada movimiento.
export function LineaDeTiempo({ movimientos, limite }: { movimientos: MovimientoHistorial[]; limite?: number }): JSX.Element {
  const [expandida, setExpandida] = useState(false)
  const ordenados = [...movimientos]
    .map((movimiento) => ({
      ...movimiento,
      cambios: movimiento.cambios.filter((cambio) => !esConfirmacionSinCambios(cambio)),
    }))
    .filter((movimiento) => movimiento.cambios.length > 0)
    .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
  const visibles = limite !== undefined && !expandida ? ordenados.slice(0, limite) : ordenados
  const ocultos = ordenados.length - visibles.length

  return (
    <div className="linea-de-tiempo">
      <ol className="linea-de-tiempo__lista">
        {visibles.map((movimiento) => {
          const detalles = movimiento.cambios.filter((cambio) => !detalleYaIncluido(movimiento.titulo, cambio))
          return (
            <li key={movimiento.id} className="linea-de-tiempo__entrada">
              <span
                className="linea-de-tiempo__punto"
                aria-hidden="true"
                style={{ background: movimiento.severidad ? colorSeveridad(movimiento.severidad) : 'var(--line)' }}
              />
              <time dateTime={movimiento.creadaEn} className="linea-de-tiempo__hora">
                {formatearMomentoHistorial(movimiento.creadaEn)}
              </time>
              <div className="linea-de-tiempo__cambios">
                <p className="linea-de-tiempo__titulo">{movimiento.titulo}</p>
                {detalles.length > 0 ? (
                  <ul className="linea-de-tiempo__detalles">
                    {detalles.map((detalle, indice) => <li key={`${movimiento.id}-${indice}`}>{detalle}</li>)}
                  </ul>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      {ocultos > 0 ? (
        <Button type="button" variant="secondary" className="linea-de-tiempo__mas" onClick={() => setExpandida(true)}>
          {`Ver movimientos anteriores (${ocultos})`}
        </Button>
      ) : null}
    </div>
  )
}
