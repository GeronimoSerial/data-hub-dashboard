// Íconos rasterizables para las capas `symbol` de MapLibre: escuelas
// afectadas, escuela solucionada, badges de estado por escuela y badges de
// evacuación del cluster. Se dibujan con el rasterizador único de
// `insignias-mapa` (forma rellena + halo + glifo Lucide real), el mismo que
// usa la leyenda, así no hay paths copiados a mano.
//
// Los SVG salen al doble de su tamaño CSS y se registran con `pixelRatio: 2`.
// El halo depende del tema; los ids no, así las capas no cambian.

import type { LucideIcon } from 'lucide-react'
import { BookMinus, BookX, Check, Clock, DoorOpen, House, School, Tent } from 'lucide-react'
import { SEVERIDAD_COLORES } from '@/lib/infraestructura/severidad'
import type { IconoPunto } from '@/lib/infraestructura/mapa/punto'
import { COLOR_SIN_AFECTACION } from './construir-escuelas-mapa-feature-collection'
import { COLORES_MAPA_CLARO, PIXEL_RATIO_ICONOS, coloresMapa } from './colores-mapa'
import { svgIconoMapa, type FormaInsignia, type GlifoIcono } from './insignias-mapa'

// Tamaños CSS finales (con `icon-size: 1`): la escuela individual se lee más
// grande que los badges de esquina (cluster y estado por escuela).
export const TAMANO_ICONO_BASE = 22
export const TAMANO_ICONO_ESCUELA = 26
export const TAMANO_ICONO_BADGE = 22

// Offset compartido por los badges de esquina: superior derecha del punto.
export const OFFSET_BADGE_ESQUINA: [number, number] = [13, -13]

// Badges de estado/evacuación: chip blanco con anillo y glifo en rojo profundo.
// Se leen sobre cualquier cluster (también sobre el rojo Crítica, gracias al
// blanco) y no se confunden con un punto negro.
const RELLENO_BADGE = '#ffffff'
const GLIFO_BADGE = '#991b1b'

type OpcionesIcono = {
  halo?: string
  anillo?: string
  tamano?: number
  forma?: FormaInsignia
}

/** Badge circular con glifo; el color del glifo se elige por contraste con el fondo. */
export const construirSvgIcono = (
  glifo: GlifoIcono,
  colorFondo: string,
  colorGlifo: string,
  { halo = COLORES_MAPA_CLARO.contornoIcono, anillo, tamano = TAMANO_ICONO_BASE, forma = 'circulo' }: OpcionesIcono = {},
) =>
  svgIconoMapa({ forma, relleno: colorFondo, icono: glifo, colorGlifo, halo, anillo, tamano, escala: PIXEL_RATIO_ICONOS })

export const ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS = 'infra-icono-centro-evacuados'
export const ID_IMAGEN_CLUSTER_EVACUADO = 'infra-icono-evacuado'

// Q13a/Q17: variantes para escuelas individuales afectadas, una por severidad.
export const ID_IMAGEN_ESCUELA_BAJA = 'infra-icono-escuela-baja'
export const ID_IMAGEN_ESCUELA_MEDIA = 'infra-icono-escuela-media'
export const ID_IMAGEN_ESCUELA_ALTA = 'infra-icono-escuela-alta'
export const ID_IMAGEN_ESCUELA_CRITICA = 'infra-icono-escuela-critica'
export const ID_IMAGEN_ESCUELA_SOLUCIONADA = 'infra-icono-escuela-solucionada'

// Badge de estado por escuela no agrupada (prioridad resuelta por `iconoPunto`).
export const GLIFO_BADGE_ESTADO: Record<IconoPunto, LucideIcon> = {
  sin: BookX,
  parcial: BookMinus,
  evacuado: DoorOpen,
  centro: House,
  reloj: Clock,
}

export const idImagenBadgeEstado = (icono: IconoPunto) => `infra-badge-estado-${icono}`

/** SVG del badge de estado/evacuación, al tamaño CSS pedido (leyenda) o al doble (mapa). */
export const svgBadgeEstado = (glifo: LucideIcon, oscuro = false, tamano = TAMANO_ICONO_BADGE, escala = PIXEL_RATIO_ICONOS) =>
  svgIconoMapa({
    forma: 'circulo',
    relleno: RELLENO_BADGE,
    anillo: GLIFO_BADGE,
    grosorAnillo: 1.75,
    icono: glifo,
    colorGlifo: GLIFO_BADGE,
    halo: coloresMapa(oscuro).contornoIcono,
    tamano,
    escala,
    radio: 13.5,
    tamanoGlifo: 17,
  })

/** SVG de escuela afectada o solucionada; glifo oscuro sobre Baja/Media y blanco sobre Alta/Crítica. */
export const svgIconoEscuela = (
  relleno: string,
  colorGlifo: string,
  glifo: LucideIcon = School,
  oscuro = false,
  tamano = TAMANO_ICONO_ESCUELA,
  escala = PIXEL_RATIO_ICONOS,
) =>
  svgIconoMapa({ forma: 'circulo', relleno, icono: glifo, colorGlifo, halo: coloresMapa(oscuro).contornoIcono, tamano, escala })

export const SVG_ICONO_ESCUELA_SOLUCIONADA_LEYENDA = svgIconoEscuela(COLOR_SIN_AFECTACION, '#ffffff', Check, false, 16, 1)

/** Íconos de escuela, badges y cluster para el tema pedido. Los ids no cambian entre temas. */
export function iconosClusterMapa(oscuro = false): ReadonlyArray<{ id: string; svg: string }> {
  const tinta = COLORES_MAPA_CLARO.tinta
  const escuela = (relleno: string, glifo: string) => svgIconoEscuela(relleno, glifo, School, oscuro)
  return [
    // Tent (centro de evacuados): prioridad 1 del badge de cluster.
    { id: ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS, svg: svgBadgeEstado(Tent, oscuro) },
    // DoorOpen (establecimiento evacuado): prioridad 2 del badge de cluster.
    { id: ID_IMAGEN_CLUSTER_EVACUADO, svg: svgBadgeEstado(DoorOpen, oscuro) },
    { id: ID_IMAGEN_ESCUELA_BAJA, svg: escuela(SEVERIDAD_COLORES.Baja, tinta) },
    { id: ID_IMAGEN_ESCUELA_MEDIA, svg: escuela(SEVERIDAD_COLORES.Media, tinta) },
    { id: ID_IMAGEN_ESCUELA_ALTA, svg: escuela(SEVERIDAD_COLORES.Alta, '#ffffff') },
    { id: ID_IMAGEN_ESCUELA_CRITICA, svg: escuela(SEVERIDAD_COLORES.Crítica, '#ffffff') },
    { id: ID_IMAGEN_ESCUELA_SOLUCIONADA, svg: svgIconoEscuela(COLOR_SIN_AFECTACION, '#ffffff', Check, oscuro) },
    ...(Object.keys(GLIFO_BADGE_ESTADO) as IconoPunto[]).map((icono) => ({
      id: idImagenBadgeEstado(icono),
      svg: svgBadgeEstado(GLIFO_BADGE_ESTADO[icono], oscuro),
    })),
  ]
}

/** Variante clara, para quien sólo necesita los ids o el SVG de referencia. */
export const ICONOS_CLUSTER_MAPA = iconosClusterMapa(false)
