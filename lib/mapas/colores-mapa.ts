// Tokens de color del mapa, espejados de `app/globals.css` porque MapLibre y
// los SVG rasterizados no resuelven var(). Cada token tiene variante clara y
// oscura: el borde oscuro fijo (`#1c1c1c`) desaparecía sobre el basemap oscuro.

export type ColoresMapa = {
  /** Borde de formas rellenas y glifo neutro (`--ink`). */
  tinta: string
  /** Halo difuso del cluster (`--page`). */
  halo: string
  /** Halo de 2 px de los íconos rasterizados: claro en ambos temas para despegarlos del basemap. */
  contornoIcono: string
  /** Relleno del punto de escuela sin reporte (`--page` / `--card`). */
  sinReporteRelleno: string
  /** Borde del punto de escuela sin reporte (`--ink-faint`). */
  sinReporteBorde: string
  /** Texto del conteo de clusters neutros (`--ink-soft`). */
  textoSuave: string
  /** Relleno suave de los clusters sin situaciones (retroceden frente a los afectados). */
  clusterNeutro: string
  /** Conteo de los clusters sin situaciones. */
  clusterNeutroTexto: string
  /** Color de foco de la selección (`--marker`). */
  foco: string
  /** Sombra de los marcadores DOM. */
  sombra: string
}

export const COLORES_MAPA_CLARO: ColoresMapa = {
  tinta: '#1c1c1c',
  halo: '#ffffff',
  contornoIcono: '#ffffff',
  sinReporteRelleno: '#ffffff',
  sinReporteBorde: '#8a8886',
  textoSuave: '#5f5e5c',
  clusterNeutro: '#dcd8d3',
  clusterNeutroTexto: '#57534e',
  foco: '#facd05',
  sombra: 'rgba(0, 0, 0, 0.35)',
}

// En oscuro el punto sin reporte usa `--card` en vez del negro de `--page`
// para no perderse sobre el basemap oscuro.
export const COLORES_MAPA_OSCURO: ColoresMapa = {
  tinta: '#ffffff',
  halo: '#000000',
  contornoIcono: '#e8e6e3',
  sinReporteRelleno: '#383634',
  sinReporteBorde: '#b5b2af',
  textoSuave: '#dcd9d6',
  clusterNeutro: '#4d4b49',
  clusterNeutroTexto: '#dcd9d6',
  foco: '#facd05',
  sombra: 'rgba(0, 0, 0, 0.6)',
}

export const coloresMapa = (oscuro = false): ColoresMapa =>
  oscuro ? COLORES_MAPA_OSCURO : COLORES_MAPA_CLARO

/** Grosor único de trazo para todos los glifos del mapa. */
export const GROSOR_TRAZO_ICONO = 2

/** Densidad con la que se rasterizan las imágenes de MapLibre (HiDPI). */
export const PIXEL_RATIO_ICONOS = 2
