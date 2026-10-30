'use client'

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { COLORES_CAPAS, ETIQUETAS_CAPAS } from '@/lib/reorganizacion/capas'
import { COLOR_TENDENCIA, ETIQUETA_TENDENCIA, RADIO_ZONA_KM, type Tendencia } from '@/lib/reorganizacion/zonas'

export type ClaveLeyenda = 'zonas' | 'universo' | 'otrasPrimarias' | 'secundarias' | 'seleccion'

export interface LeyendaReorganizacionProps {
  /** Capas visibles. Las ausentes se consideran visibles; las ocultas quedan atenuadas. */
  capasVisibles?: Partial<Record<ClaveLeyenda, boolean>>
}

const TENDENCIAS = Object.keys(ETIQUETA_TENDENCIA) as Tendencia[]
const DIAMETRO_ZONA_KM = RADIO_ZONA_KM * 2

/** Leyenda plegable del mapa: colores y formas de cada capa, con texto para cada uno. */
export function LeyendaReorganizacion({ capasVisibles = {} }: LeyendaReorganizacionProps) {
  const [abierta, setAbierta] = useState(true)
  const idContenido = useId()

  const visible = (clave: ClaveLeyenda) => capasVisibles[clave] !== false
  const atenuada = (clave: ClaveLeyenda) => (visible(clave) ? undefined : 'opacity-50')

  return (
    <section aria-label="Leyenda del mapa" className="flex flex-col gap-2 rounded-md bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Leyenda</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={abierta}
          aria-controls={idContenido}
          onClick={() => setAbierta((valor) => !valor)}
        >
          {abierta ? 'Ocultar leyenda' : 'Mostrar leyenda'}
        </Button>
      </div>

      <div id={idContenido} hidden={!abierta} className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          <li className={`flex items-center gap-2 ${atenuada('universo') ?? ''}`}>
            <span
              aria-hidden="true"
              className="inline-block size-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: COLORES_CAPAS.universo }}
            />
            <span>{ETIQUETAS_CAPAS.universo}</span>
            {!visible('universo') && <span className="text-slate-600">(oculta)</span>}
          </li>
          <li className={`flex items-center gap-2 ${atenuada('otrasPrimarias') ?? ''}`}>
            <span
              aria-hidden="true"
              className="inline-block size-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: COLORES_CAPAS.otrasPrimarias }}
            />
            <span>{ETIQUETAS_CAPAS.otrasPrimarias}</span>
            {!visible('otrasPrimarias') && <span className="text-slate-600">(oculta)</span>}
          </li>
          <li className={`flex items-center gap-2 ${atenuada('secundarias') ?? ''}`}>
            <span
              aria-hidden="true"
              className="inline-block size-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: COLORES_CAPAS.secundarias }}
            />
            <span>{ETIQUETAS_CAPAS.secundarias}</span>
            {!visible('secundarias') && <span className="text-slate-600">(oculta)</span>}
          </li>
          <li className={`flex items-start gap-2 ${atenuada('seleccion') ?? ''}`}>
            <span
              aria-hidden="true"
              className="mt-0.5 inline-block size-3.5 shrink-0 rounded-full border-2"
              style={{ borderColor: COLORES_CAPAS.seleccion }}
            />
            <span className="flex flex-col">
              <span>{ETIQUETAS_CAPAS.seleccion}</span>
              <span className="text-slate-600">Anillo alrededor del punto. Se distingue por forma, no solo por color.</span>
            </span>
            {!visible('seleccion') && <span className="text-slate-600">(oculta)</span>}
          </li>
        </ul>

        <div className={`flex flex-col gap-2 ${atenuada('zonas') ?? ''}`}>
          <p>
            <span className="font-medium">{ETIQUETAS_CAPAS.zonas}</span>
            <span className="text-slate-600">{` (radio de ${RADIO_ZONA_KM} km, diámetro de ${DIAMETRO_ZONA_KM} km)`}</span>
            {!visible('zonas') && <span className="text-slate-600"> (oculta)</span>}
          </p>
          <p className="text-slate-600">Color de relleno según la tendencia de matrícula 2023 a 2026:</p>
          <ul className="flex flex-col gap-1.5">
            {TENDENCIAS.map((tendencia) => (
              <li key={tendencia} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block size-3.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: COLOR_TENDENCIA[tendencia] }}
                />
                <span>{ETIQUETA_TENDENCIA[tendencia]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
