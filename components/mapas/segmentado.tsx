'use client'

import type { JSX } from 'react'

export interface OpcionSegmentada<T extends string | number> {
  valor: T
  etiqueta: string
  /** Sin datos para esta opción: se ve atenuada y no cambia el valor. */
  deshabilitada?: boolean
  /** Texto de ayuda (atributo title) para la opción deshabilitada. */
  titulo?: string
}

export function Segmentado<T extends string | number>(props: {
  etiqueta: string
  opciones: ReadonlyArray<OpcionSegmentada<T>>
  valor: T
  onChange: (valor: T) => void
  columnas?: 2
}): JSX.Element {
  const { etiqueta, opciones, valor, onChange, columnas } = props

  return (
    <div className={`map-seg${columnas ? ` map-seg--${columnas}` : ''}`} role="group" aria-label={etiqueta}>
      {opciones.map((opcion) => (
        <button
          aria-pressed={opcion.valor === valor}
          aria-disabled={opcion.deshabilitada ? 'true' : 'false'}
          className="map-seg__opcion"
          key={opcion.valor}
          onClick={() => {
            if (!opcion.deshabilitada) onChange(opcion.valor)
          }}
          title={opcion.deshabilitada ? opcion.titulo : undefined}
          type="button"
        >
          {opcion.etiqueta}
        </button>
      ))}
    </div>
  )
}
