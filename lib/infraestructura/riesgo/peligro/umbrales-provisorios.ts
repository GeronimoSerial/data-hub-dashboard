// Umbrales PROVISORIOS de peligro por precipitación acumulada (mm) mientras se
// calcula la climatología ERA5. Es una decisión razonable de arranque, NO un
// umbral oficial: en cuanto exista climatología completa para una celda, esa
// climatología (percentiles) es el ÚNICO método válido y estos umbrales no se
// mezclan con ella.

import type { HorizontePeligro, NivelPeligro } from './nivel'

// Versión de la tabla de umbrales. Cambiar los valores de abajo exige subir
// esta versión para poder auditar qué regla produjo un nivel.
export const VERSION_UMBRALES_PROVISORIOS = 'umbrales-provisorios-v0.1'

export interface UmbralesProvisoriosMm {
  amarillo: number
  naranja: number
  rojo: number
}

// Única fuente editable de los umbrales de 72 h. Los de 240 h se derivan de
// estos (×1.5) y los de 24 h son explícitos.
const UMBRALES_72H: UmbralesProvisoriosMm = {
  amarillo: 80,
  naranja: 120,
  rojo: 180,
}

const ESCALA_240H = 1.5

export const UMBRALES_PROVISORIOS_MM: Record<HorizontePeligro, UmbralesProvisoriosMm> = {
  24: { amarillo: 50, naranja: 80, rojo: 120 },
  72: UMBRALES_72H,
  240: {
    amarillo: UMBRALES_72H.amarillo * ESCALA_240H,
    naranja: UMBRALES_72H.naranja * ESCALA_240H,
    rojo: UMBRALES_72H.rojo * ESCALA_240H,
  },
}

/**
 * Traduce una precipitación acumulada (mm) a nivel de peligro usando los
 * umbrales provisorios del horizonte. Mismo criterio de bordes estricto que
 * `nivelDesdeDeterministico`: igualar un umbral NO lo supera.
 */
export function nivelDesdeUmbralProvisorio(
  precipitacionMm: number,
  horizonteHoras: HorizontePeligro,
): NivelPeligro {
  const umbrales = UMBRALES_PROVISORIOS_MM[horizonteHoras]
  if (precipitacionMm > umbrales.rojo) return 'rojo'
  if (precipitacionMm > umbrales.naranja) return 'naranja'
  if (precipitacionMm > umbrales.amarillo) return 'amarillo'
  return 'verde'
}
