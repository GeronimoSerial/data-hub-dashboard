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
// Los íconos individuales muestran la severidad de escuelas afectadas y un
// check neutro para escuelas con una situación solucionada recientemente.
// Las demás escuelas sin reporte se representan con un punto.

import { SEVERIDAD_COLORES } from '@/lib/infraestructura/severidad'
import { COLOR_SIN_AFECTACION } from './construir-escuelas-mapa-feature-collection'
import { COLORES_MAPA_CLARO, GROSOR_TRAZO_ICONO, PIXEL_RATIO_ICONOS, coloresMapa } from './colores-mapa'

// Tamaño CSS por defecto del badge; el SVG se emite al doble y MapLibre lo
// registra con `pixelRatio: 2`, así queda nítido en pantallas HiDPI.
export const TAMANO_ICONO_BASE = 22

export const ATRIBUTOS_LUCIDE_BASE =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
  'fill="none" stroke-linecap="round" stroke-linejoin="round"'

const atributosLucide = (strokeWidth: number, stroke: string, tamano: number) => {
  const px = tamano * PIXEL_RATIO_ICONOS
  return `${ATRIBUTOS_LUCIDE_BASE} width="${px}" height="${px}" stroke="${stroke}" stroke-width="${strokeWidth}"`
}

// Fondo del badge circular con el color que se le pase. El borde fino separa
// el badge del basemap; su color depende del tema (ver `colores-mapa`).
export const fondoBadge = (colorRelleno: string, colorBorde = COLORES_MAPA_CLARO.tinta) =>
  `<circle cx="12" cy="12" r="11" fill="${colorRelleno}" stroke="${colorBorde}" stroke-width="1" />`

// Construye un badge con el trazo elegido por contraste: oscuro sobre fondos claros y blanco sobre los oscuros de la rampa.
export const construirSvgIcono = (
  path: string,
  colorFondo: string,
  colorTrazo: string,
  colorBorde = COLORES_MAPA_CLARO.tinta,
  strokeWidth = GROSOR_TRAZO_ICONO,
  tamano = TAMANO_ICONO_BASE,
) => `<svg ${atributosLucide(strokeWidth, colorTrazo, tamano)}>${fondoBadge(colorFondo, colorBorde)}${path}</svg>`

// Tamaños CSS finales (con `icon-size: 1`): la escuela individual se lee
// más grande que el badge de esquina del cluster.
export const TAMANO_ICONO_ESCUELA = 26
export const TAMANO_ICONO_CLUSTER = 18

export const ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS = 'infra-icono-centro-evacuados'
export const ID_IMAGEN_CLUSTER_EVACUADO = 'infra-icono-evacuado'

// Q13a/Q17: variantes para escuelas individuales afectadas, una por severidad.
export const ID_IMAGEN_ESCUELA_BAJA = 'infra-icono-escuela-baja'
export const ID_IMAGEN_ESCUELA_MEDIA = 'infra-icono-escuela-media'
export const ID_IMAGEN_ESCUELA_ALTA = 'infra-icono-escuela-alta'
export const ID_IMAGEN_ESCUELA_CRITICA = 'infra-icono-escuela-critica'
export const ID_IMAGEN_ESCUELA_SOLUCIONADA = 'infra-icono-escuela-solucionada'

const PATH_ESCUELA =
  '<path d="M14 21v-3a2 2 0 0 0-4 0v3" />' +
  '<path d="M18 4.933V21" />' +
  '<path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6" />' +
  '<path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11" />' +
  '<path d="M6 4.933V21" />' +
  '<circle cx="12" cy="9" r="2" />'

const PATH_CENTRO_EVACUADOS =
  '<path d="M3.5 21 14 3" /><path d="M20.5 21 10 3" /><path d="M15.5 21 12 15l-3.5 6" /><path d="M2 21h20" />'
const PATH_EVACUADO =
  '<path d="M11 20H2" /><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z" />' +
  '<path d="M11 4H8a2 2 0 0 0-2 2v14" /><path d="M14 12h.01" /><path d="M22 20h-3" />'
const PATH_CHECK = '<path d="M20 6 9 17l-5-5" />'

/**
 * Íconos de escuela y cluster para el tema pedido. El borde usa la tinta del
 * tema; el trazo de los afectados se elige por contraste contra la escala
 * tonal (oscuro sobre Baja/Media, blanco sobre Alta/Crítica).
 */
export function iconosClusterMapa(oscuro = false): ReadonlyArray<{ id: string; svg: string }> {
  const { tinta } = coloresMapa(oscuro)
  const escuela = (fondo: string, trazo: string) =>
    construirSvgIcono(PATH_ESCUELA, fondo, trazo, tinta, GROSOR_TRAZO_ICONO, TAMANO_ICONO_ESCUELA)
  const cluster = (path: string) =>
    construirSvgIcono(path, '#ffffff', COLORES_MAPA_CLARO.tinta, tinta, GROSOR_TRAZO_ICONO, TAMANO_ICONO_CLUSTER)
  return [
    // Tent (centro de evacuados): prioridad 1 del badge de estado.
    { id: ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS, svg: cluster(PATH_CENTRO_EVACUADOS) },
    // DoorOpen (establecimiento evacuado): prioridad 2 del badge de estado.
    { id: ID_IMAGEN_CLUSTER_EVACUADO, svg: cluster(PATH_EVACUADO) },
    { id: ID_IMAGEN_ESCUELA_BAJA, svg: escuela(SEVERIDAD_COLORES.Baja, '#1c1c1c') },
    { id: ID_IMAGEN_ESCUELA_MEDIA, svg: escuela(SEVERIDAD_COLORES.Media, '#1c1c1c') },
    { id: ID_IMAGEN_ESCUELA_ALTA, svg: escuela(SEVERIDAD_COLORES.Alta, '#ffffff') },
    { id: ID_IMAGEN_ESCUELA_CRITICA, svg: escuela(SEVERIDAD_COLORES.Crítica, '#ffffff') },
    {
      id: ID_IMAGEN_ESCUELA_SOLUCIONADA,
      svg: construirSvgIcono(PATH_CHECK, COLOR_SIN_AFECTACION, '#ffffff', tinta, GROSOR_TRAZO_ICONO, TAMANO_ICONO_ESCUELA),
    },
  ]
}

/** Variante clara, para quien sólo necesita los ids o el SVG de referencia. */
export const ICONOS_CLUSTER_MAPA = iconosClusterMapa(false)
