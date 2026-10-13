// Puntos fijos de consulta de caudal (GloFAS vía Open-Meteo Flood API) para
// los cursos de agua relevantes a Corrientes. Configuración versionada del
// repo (decisión de producto E2, ver docs/ejecucion-enos/E2/registro.md §4):
// no es una tabla de DB porque cambia rara vez y su curación es manual/
// geográfica, igual que LIMITES_CORRIENTES en lib/mapas/departamentos.ts.
//
// Por qué existe este archivo: una coordenada de centro urbano puede caer
// fuera de la celda del cauce y devolver un caudal irrelevante — se verificó
// en vivo que el centro de Corrientes (capital) da 0.67 m³/s en esa API. Cada
// punto de acá fue elegido con un barrido automatizado (grilla de ±0.2° en
// pasos de 0.1° alrededor de la coordenada de la localidad, eligiendo la
// celda de mayor caudal reportado) y no la coordenada de memoria de la
// localidad. Ver el detalle del barrido, con los caudales obtenidos el
// 2026-09-26, en el registro del batch.
export type PuntoRio = {
  id: string
  rio: 'parana' | 'uruguay' | 'corriente' | 'santa-lucia' | 'miriñay' | 'aguapey'
  localidad: string
  lat: number
  lon: number
  criterio: string
}

export const PUNTOS_RIO_VERSION = 'puntos-rio-v1'

export const PUNTOS_RIO: readonly PuntoRio[] = [
  {
    id: 'parana-ituzaingo',
    rio: 'parana',
    localidad: 'Ituzaingó',
    lat: -27.49,
    lon: -56.8,
    criterio:
      'Barrido ±0.2°/paso 0.1° sobre el centro de la localidad; caudal máximo 14756 m³/s (2026-09-26), consistente con el tramo del Paraná aguas abajo de Yacyretá.',
  },
  {
    id: 'parana-corrientes-paso-patria',
    rio: 'parana',
    localidad: 'Corrientes / Paso de la Patria',
    lat: -27.4692,
    lon: -58.9306,
    criterio:
      'Barrido sobre el centro de la ciudad de Corrientes; caudal máximo 17740.9 m³/s (2026-09-26), tramo inmediatamente aguas abajo de la confluencia con el río Paraguay. Un barrido independiente centrado en Paso de la Patria confirmó un caudal comparable (17337 m³/s) en el mismo tramo.',
  },
  {
    id: 'parana-bella-vista',
    rio: 'parana',
    localidad: 'Bella Vista',
    lat: -28.3069,
    lon: -59.1387,
    criterio: 'Barrido sobre el centro de la localidad; caudal máximo 17822.79 m³/s (2026-09-26).',
  },
  {
    id: 'parana-goya',
    rio: 'parana',
    localidad: 'Goya',
    lat: -29.0382,
    lon: -59.2649,
    criterio:
      'Barrido sobre el centro de la localidad. Los umbrales de caudal no están hardcodeados: los calcula el job `climatologia-caudal` (lib/infraestructura/riesgo/jobs/calcular-climatologia-caudal.ts) y los guarda en `hazard_climatology`.',
  },
  {
    id: 'parana-esquina',
    rio: 'parana',
    localidad: 'Esquina',
    lat: -30.0022,
    lon: -59.6314,
    criterio: 'Barrido sobre el centro de la localidad; caudal máximo 17659.39 m³/s (2026-09-26).',
  },
  {
    id: 'uruguay-santo-tome',
    rio: 'uruguay',
    localidad: 'Santo Tomé',
    lat: -28.6511,
    lon: -56.1459,
    criterio:
      'Barrido sobre el centro de la localidad; caudal máximo 12734.03 m³/s (2026-09-26). Magnitud alta respecto de la referencia histórica del río Uruguay en este tramo (del orden de miles, no de decenas de miles) — pendiente de contrastar contra la climatología de caudal (hazard_climatology) antes de un uso operativo que dependa de umbrales absolutos.',
  },
  {
    id: 'uruguay-paso-de-los-libres',
    rio: 'uruguay',
    localidad: 'Paso de los Libres',
    lat: -29.5061,
    lon: -56.9866,
    criterio:
      'Barrido sobre el centro de la localidad; caudal máximo 14124.38 m³/s (2026-09-26). Misma advertencia de magnitud que uruguay-santo-tome.',
  },
  {
    id: 'uruguay-monte-caseros',
    rio: 'uruguay',
    localidad: 'Monte Caseros',
    lat: -30.0639,
    lon: -57.5389,
    criterio:
      'Barrido sobre el centro de la localidad; caudal máximo 12851.87 m³/s (2026-09-26). Misma advertencia de magnitud que uruguay-santo-tome.',
  },
] as const

// Afluentes (Corriente, Santa Lucía, Miriñay, Aguapey): NO se incluyen en
// esta versión. El barrido automatizado por caudal máximo en una ventana
// alrededor de la localidad converge sistemáticamente al cauce principal
// (Paraná/Uruguay) más cercano, que domina el caudal de cualquier celda
// vecina — no sirve para aislar un afluente mucho más chico. Ubicar esos
// puntos requiere el curso real del afluente (polígono/línea, no sólo un
// centro de localidad), que no está disponible en este repo (ver
// cobertura-geo.md de E2-prep: no hay polígonos de hidrografía). Queda como
// pendiente explícito, documentado en el registro del batch; no bloquea la
// aceptación de E2 (la integración mínima exigida es Paraná + Uruguay).
export function puntoRioPorId(id: string): PuntoRio | undefined {
  return PUNTOS_RIO.find((p) => p.id === id)
}
