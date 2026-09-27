'use client'

import { Button } from '@/components/ui/button'

// Horizonte temporal del "modo Radar". 'ahora' es cualitativo; los números son
// horas y espejan el contrato de la API (24 | 72 | 240).
export type HorizonteRadar = 'ahora' | 24 | 72 | 240

// Orden de presentación fijo, de lo más inmediato a lo más lejano.
export const HORIZONTES_RADAR: HorizonteRadar[] = ['ahora', 24, 72, 240]

// Copy de UI (español neutro). El guion de "7–10 días" es en dash a propósito.
export const ETIQUETA_HORIZONTE: Record<HorizonteRadar, string> = {
  ahora: 'Ahora',
  24: '24 h',
  72: '72 h',
  240: '7–10 días',
}

export const TEXTO_SIN_EVIDENCIA = 'Sin evidencia suficiente para este horizonte todavía'

type Props = {
  horizonte: HorizonteRadar
  onChange: (h: HorizonteRadar) => void
  // Horizontes con evidencia disponible. Los que NO estén acá se muestran
  // deshabilitados pero visibles (nunca ocultos en silencio).
  disponibles: HorizonteRadar[]
}

/**
 * Selector de horizonte operable por teclado (botones nativos vía `Button`).
 *
 * Decisiones:
 * - Los horizontes sin evidencia usan `aria-disabled` pero NO el atributo
 *   nativo `disabled`: así siguen siendo alcanzables con Tab y un lector de
 *   pantalla puede anunciar el `title` que explica por qué están inactivos.
 *   El guard en `onClick` garantiza que ni click ni Enter/Space disparen el
 *   cambio.
 * - La región `aria-live="polite"` vive dentro del propio componente (no se
 *   exporta texto para que la renderice el padre). Así el integrador sólo
 *   monta `<SelectorHorizonte>` y el anuncio del horizonte activo queda
 *   garantizado, sin duplicar el estado en dos lugares.
 */
export function SelectorHorizonte({ horizonte, onChange, disponibles }: Props) {
  const hayDeshabilitados = HORIZONTES_RADAR.some((h) => !disponibles.includes(h))

  return (
    <div
      className="selector-horizonte"
      role="group"
      aria-label="Horizonte temporal del radar"
    >
      {HORIZONTES_RADAR.map((h) => {
        const habilitado = disponibles.includes(h)
        const activo = horizonte === h
        return (
          <Button
            key={h}
            type="button"
            size="sm"
            variant={activo ? 'default' : 'secondary'}
            className={`selector-horizonte__boton${activo ? ' ui-button--active' : ''}`}
            aria-pressed={activo}
            aria-disabled={!habilitado}
            title={habilitado ? undefined : TEXTO_SIN_EVIDENCIA}
            onClick={() => {
              if (!habilitado) return
              onChange(h)
            }}
          >
            {ETIQUETA_HORIZONTE[h]}
          </Button>
        )
      })}

      {hayDeshabilitados ? (
        <p className="selector-horizonte__nota">{TEXTO_SIN_EVIDENCIA}</p>
      ) : null}

      <p className="selector-horizonte__estado" aria-live="polite">
        Horizonte activo: {ETIQUETA_HORIZONTE[horizonte]}
      </p>
    </div>
  )
}
