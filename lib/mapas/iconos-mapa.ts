// Íconos rasterizables para las capas `symbol` de MapLibre. Las capas DOM
// (badges por escuela) usan los componentes de `lucide-react` directamente;
// acá sólo viven los SVG standalone que `map.addImage` necesita para los
// íconos de agregado a nivel cluster (no hay componente React en WebGL).
//
// Los paths son los mismos que expone `lucide-react` (v1.34.0) para Tent,
// DoorOpen y School, con los atributos por defecto de Lucide (viewBox 24x24,
// stroke 2). Se duplican acá como string porque `map.addImage` necesita un
// HTMLImageElement, no un componente React, y no se importa React en un
// módulo puro de datos. Si Lucide cambia un path, la leyenda sigue usando el
// componente real; este string es la única copia desacoplada.
//
// El badge de cluster lleva fondo blanco para leerse sobre cualquier color de
// severidad (incluida Crítica, rojo oscuro), igual que el badge DOM.
//
// Q17: la escuela individual NO usa un badge blanco único. Las escuelas sin
// afectación llevan fondo blanco con borde gris fino y trazo del ícono en gris
// oscuro (grises neutros, nunca negro puro); las afectadas llevan el badge
// ENTERO relleno del color de su severidad y el trazo del ícono elegido por
// contraste (oscuro sobre fondos claros, blanco sobre oscuros), para que la
// severidad se lea de un vistazo aun sin el anillo de color de abajo. El borde
// oscuro fino del círculo se conserva en las variantes de severidad.
//
// Q17b (modo oscuro): el canvas de MapLibre se filtra con CSS en tema oscuro
// (`app/globals.css`), así que el fondo blanco de la variante normal no se
// revierte de forma confiable. Se registra una variante dedicada para oscuro
// (fondo gris muy oscuro, ícono claro) en vez de depender de ese filtro.

import { SEVERIDAD_COLORES } from '@/lib/infraestructura/severidad'

export const ATRIBUTOS_LUCIDE_BASE =
  'xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" ' +
  'fill="none" stroke-linecap="round" stroke-linejoin="round"'

const atributosLucide = (strokeWidth: number, stroke = '#1c1c1c') =>
  `${ATRIBUTOS_LUCIDE_BASE} stroke="${stroke}" stroke-width="${strokeWidth}"`

const ATRIBUTOS_LUCIDE = atributosLucide(2.4)

// Fondo del badge circular con el color que se le pase. El borde oscuro fino
// (por defecto `#1c1c1c`, stroke-width 1) se conserva para las variantes de
// severidad y los íconos de cluster; la variante normal sin afectación pasa un
// borde gris medio (`#9ca3af`) para no usar negro puro.
export const fondoBadge = (colorRelleno: string, colorBorde = '#1c1c1c') =>
  `<circle cx="12" cy="12" r="11" fill="${colorRelleno}" stroke="${colorBorde}" stroke-width="1" />`

// Construye un badge con el trazo elegido por contraste: oscuro sobre fondos claros y blanco sobre los oscuros de la rampa.
export const construirSvgIcono = (
  path: string,
  colorFondo: string,
  colorTrazo: string,
  colorBorde = '#1c1c1c',
  strokeWidth = 2.4,
) => `<svg ${atributosLucide(strokeWidth, colorTrazo)}>${fondoBadge(colorFondo, colorBorde)}${path}</svg>`

export const ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS = 'infra-icono-centro-evacuados'
export const ID_IMAGEN_CLUSTER_EVACUADO = 'infra-icono-evacuado'

// Q13a/Q17: escuela individual (no clusterizada). Una variante por estado:
// normal (sin afectación, clara y oscura) + una por cada severidad.
export const ID_IMAGEN_ESCUELA_NORMAL = 'infra-icono-escuela-normal'
export const ID_IMAGEN_ESCUELA_NORMAL_OSCURO = 'infra-icono-escuela-normal-oscuro'
export const ID_IMAGEN_ESCUELA_BAJA = 'infra-icono-escuela-baja'
export const ID_IMAGEN_ESCUELA_MEDIA = 'infra-icono-escuela-media'
export const ID_IMAGEN_ESCUELA_ALTA = 'infra-icono-escuela-alta'
export const ID_IMAGEN_ESCUELA_CRITICA = 'infra-icono-escuela-critica'

const PATH_ESCUELA =
  '<path d="M14 21v-3a2 2 0 0 0-4 0v3" />' +
  '<path d="M18 4.933V21" />' +
  '<path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6" />' +
  '<path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11" />' +
  '<path d="M6 4.933V21" />' +
  '<circle cx="12" cy="9" r="2" />'

const svgIconoEscuela = (colorFondo: string, colorTrazo: string, colorBorde = '#1c1c1c') =>
  construirSvgIcono(PATH_ESCUELA, colorFondo, colorTrazo, colorBorde, 1.7)

// Tent (centro de evacuados): prioridad 1 del badge de estado.
export const SVG_ICONO_CLUSTER_CENTRO_EVACUADOS = `<svg ${ATRIBUTOS_LUCIDE}>${fondoBadge('#ffffff')}<path d="M3.5 21 14 3" /><path d="M20.5 21 10 3" /><path d="M15.5 21 12 15l-3.5 6" /><path d="M2 21h20" /></svg>`

// DoorOpen (establecimiento evacuado): prioridad 2 del badge de estado.
export const SVG_ICONO_CLUSTER_EVACUADO = `<svg ${ATRIBUTOS_LUCIDE}>${fondoBadge('#ffffff')}<path d="M11 20H2" /><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z" /><path d="M11 4H8a2 2 0 0 0-2 2v14" /><path d="M14 12h.01" /><path d="M22 20h-3" /></svg>`

// School: path copiado tal cual de `school.mjs` de lucide-react v1.34.0.
// Normal (sin afectación), tema claro: fondo blanco, borde gris medio fino
// (`#9ca3af`) y trazo del ícono en gris oscuro (`#4b5563`), nunca negro puro.
export const SVG_ICONO_ESCUELA_NORMAL = svgIconoEscuela('#ffffff', '#4b5563', '#9ca3af')

// Normal (sin afectación), tema oscuro. IMPORTANTE: en tema oscuro el canvas de
// MapLibre pasa por el filtro CSS de `app/globals.css`
// (`brightness(1.1) invert(0.72) contrast(1.2) hue-rotate(195deg)`), que aplica
// a TODA la capa symbol y en particular INVIERTE la luminancia. Por eso estos
// hex son "pre-filtro": compensan ese filtro para que el resultado final en
// pantalla sea el buscado (fondo gris oscuro, ícono claro), no el que se ve acá.
// Calculado con la matemática real del filtro (sRGB, clamp por paso):
//   fondo  entrada #bee0e8 -> final #374751 (slate oscuro, banda #1f2937-#374151)
//   trazo  entrada #000000 -> final #c3c3c3 (gris claro; es el máximo neutral
//          alcanzable: el filtro topa los neutros en #c3c3c3, por eso no llega
//          a #e5e7eb/#f3f4f6, pero conserva contraste y lectura)
//   borde  #9ca3af (sin compensar) -> final #63646d, intermedio entre ambos
// Contraste final fondo/ícono 5.46:1. No reutilizar estos hex en tema claro.
export const SVG_ICONO_ESCUELA_NORMAL_OSCURO = svgIconoEscuela('#bee0e8', '#000000', '#9ca3af')

// Afectadas: badge relleno del color de severidad. El trazo se elige por
// contraste contra la escala tonal de una sola gama (claro→oscuro): oscuro
// sobre los fondos claros (Baja/Media), blanco sobre los oscuros
// (Alta/Crítica), donde el trazo oscuro se perdería.
export const SVG_ICONO_ESCUELA_BAJA = svgIconoEscuela(SEVERIDAD_COLORES.Baja, '#1c1c1c')
export const SVG_ICONO_ESCUELA_MEDIA = svgIconoEscuela(SEVERIDAD_COLORES.Media, '#1c1c1c')
export const SVG_ICONO_ESCUELA_ALTA = svgIconoEscuela(SEVERIDAD_COLORES.Alta, '#ffffff')
export const SVG_ICONO_ESCUELA_CRITICA = svgIconoEscuela(SEVERIDAD_COLORES.Crítica, '#ffffff')

export const ICONOS_CLUSTER_MAPA: ReadonlyArray<{ id: string; svg: string }> = [
  { id: ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS, svg: SVG_ICONO_CLUSTER_CENTRO_EVACUADOS },
  { id: ID_IMAGEN_CLUSTER_EVACUADO, svg: SVG_ICONO_CLUSTER_EVACUADO },
  // Q13a/Q17: las variantes de escuela viajan en el mismo array para que
  // `registrarIconosCluster` las registre con el mismo patrón; los íconos de
  // cluster siguen eligiendo sólo entre sus dos ids.
  { id: ID_IMAGEN_ESCUELA_NORMAL, svg: SVG_ICONO_ESCUELA_NORMAL },
  { id: ID_IMAGEN_ESCUELA_NORMAL_OSCURO, svg: SVG_ICONO_ESCUELA_NORMAL_OSCURO },
  { id: ID_IMAGEN_ESCUELA_BAJA, svg: SVG_ICONO_ESCUELA_BAJA },
  { id: ID_IMAGEN_ESCUELA_MEDIA, svg: SVG_ICONO_ESCUELA_MEDIA },
  { id: ID_IMAGEN_ESCUELA_ALTA, svg: SVG_ICONO_ESCUELA_ALTA },
  { id: ID_IMAGEN_ESCUELA_CRITICA, svg: SVG_ICONO_ESCUELA_CRITICA },
]
