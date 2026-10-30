'use client'

import type { CSSProperties } from 'react'
import { Switch } from '@/components/ui/switch'
import { COLORES_CAPAS, ETIQUETAS_CAPAS } from '@/lib/reorganizacion/capas'
import { COLOR_TENDENCIA, ETIQUETA_TENDENCIA, RADIO_ZONA_KM, type Tendencia } from '@/lib/reorganizacion/zonas'
import type { VisibilidadCapas } from './capas-reorganizacion'
import type { FondoId } from '@/lib/reorganizacion/fondos'
import { SelectorFondo } from './selector-fondo'

export interface PanelCapasReorganizacionProps {
  visibles: VisibilidadCapas
  onVisibles: (visibles: VisibilidadCapas) => void
  fondo: FondoId
  onFondo: (fondo: FondoId) => void
}

const TENDENCIAS = Object.keys(ETIQUETA_TENDENCIA) as Tendencia[]

type ClaveEncendible = keyof VisibilidadCapas

const CAPAS: Array<{ clave: ClaveEncendible; muestra: string; zona?: boolean; detalle?: string }> = [
  { clave: 'otrasPrimarias', muestra: COLORES_CAPAS.otrasPrimarias },
  { clave: 'secundarias', muestra: COLORES_CAPAS.secundarias },
  {
    clave: 'zonas',
    muestra: COLORES_CAPAS.seleccion,
    zona: true,
    detalle: `Radio de ${RADIO_ZONA_KM} km alrededor de cada centro`,
  },
]

/** Capas del mapa: cada fila es a la vez la leyenda de su color y el control que la muestra u oculta. */
export function PanelCapasReorganizacion({ visibles, onVisibles, fondo, onFondo }: PanelCapasReorganizacionProps) {
  return (
    <>
      <section className="rz-seccion" aria-labelledby="rz-capas-titulo">
        <h3 id="rz-capas-titulo" className="rz-seccion__titulo">
          Capas
        </h3>
        <ul className="rz-capas">
          <li className="rz-capa">
            <span className="rz-muestra" style={{ '--muestra': COLORES_CAPAS.universo } as CSSProperties} aria-hidden="true" />
            <span>
              {ETIQUETAS_CAPAS.universo}
              <span className="rz-capa__detalle">Primaria común, 1 a 10 alumnos</span>
            </span>
            <span className="rz-capa__fijo">Siempre visible</span>
          </li>
          {CAPAS.map(({ clave, muestra, zona, detalle }) => (
            <li key={clave} className="rz-capa">
              <span
                className={zona ? 'rz-muestra rz-muestra--zona' : 'rz-muestra'}
                style={{ '--muestra': muestra } as CSSProperties}
                aria-hidden="true"
              />
              <span>
                {ETIQUETAS_CAPAS[clave]}
                {detalle && <span className="rz-capa__detalle">{detalle}</span>}
              </span>
              <Switch
                aria-label={ETIQUETAS_CAPAS[clave]}
                checked={visibles[clave]}
                onCheckedChange={(marcado) => onVisibles({ ...visibles, [clave]: marcado })}
              />
            </li>
          ))}
          <li className="rz-capa">
            <span className="rz-muestra rz-muestra--anillo" aria-hidden="true" />
            <span>
              {ETIQUETAS_CAPAS.seleccion}
              <span className="rz-capa__detalle">Anillo alrededor del punto, no solo color</span>
            </span>
            <span className="rz-capa__fijo">Siempre visible</span>
          </li>
        </ul>
      </section>

      <section className="rz-seccion" aria-labelledby="rz-tendencia-titulo">
        <h3 id="rz-tendencia-titulo" className="rz-seccion__titulo">
          Tendencia de cada zona
        </h3>
        <p className="rz-nota">Color de relleno según la matrícula de 2023 a 2026.</p>
        <ul className="rz-tendencias">
          {TENDENCIAS.map((tendencia) => (
            <li key={tendencia}>
              <span
                className="rz-muestra"
                style={{ '--muestra': COLOR_TENDENCIA[tendencia] } as CSSProperties}
                aria-hidden="true"
              />
              <span>{ETIQUETA_TENDENCIA[tendencia]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rz-seccion" aria-labelledby="rz-fondo-titulo">
        <h3 id="rz-fondo-titulo" className="rz-seccion__titulo">
          Mapa de fondo
        </h3>
        <SelectorFondo valor={fondo} onCambio={onFondo} />
      </section>
    </>
  )
}
