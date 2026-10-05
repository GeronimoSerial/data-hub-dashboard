// Módulo puro del mapa de infraestructura: construye la FeatureCollection de
// TODAS las escuelas del padrón (afectadas y sin afectación reportada) para
// alimentar la misma fuente clusterizada y el mismo paint de puntos que ya usa
// la capa de partes. Sin React, sin red y sin base de datos: sólo transforma el
// array que ya le entrega el llamador.
//
// CONTRATO DE COMPATIBILIDAD: las propiedades alimentan las capas de punto,
// badges y los agregados `clusterProperties` (`severidadRango`,
// `sinActualizar`, `esEvacuado`). Las escuelas sin reporte no llevan icono:
// se dibujan como círculos neutros.

import type { FeatureCollection, Point } from 'geojson'
import type { EscuelaMapaPadron } from '@/lib/infraestructura/parte-mapa'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { rangoSeveridad } from '@/lib/mapas/severidad-visual'
import { iconoPunto, type IconoPunto } from '@/lib/infraestructura/mapa/punto'

// Mismo gris "sin dato" que COLOR_NIVEL_PELIGRO.sin_dato de peligro-capas.ts
// (token --ink-faint, globals.css). Se repite el literal EN VEZ de importarlo
// de peligro-capas para no crear una dependencia cruzada entre dos módulos que
// representan conceptos distintos: acá "sin afectación reportada" no es un
// nivel de peligro, sólo comparte el color de "acá no hay dato" por
// consistencia del sistema de diseño. Si el token cambia, HAY QUE actualizar
// ambos literales a mano.
export const COLOR_SIN_AFECTACION = '#8a8886'

// Etiqueta legible para la ficha/tooltip cuando la escuela no tiene parte.
export const ETIQUETA_SIN_AFECTACION = 'Sin afectación'

export interface PropiedadesEscuelaMapa {
  cueAnexo: string
  nombre: string
  color: string
  // 'normal' para escuelas sin afectación; el servicio real de ParteMapa
  // cuando la escuela SÍ está afectada.
  servicio: string
  alumnosAlcanzados: number
  // Etiqueta cruda para la ficha y rango numérico para el cluster.
  severidad: string
  gravedad: number
  icono: IconoPunto | null
  // 0 para sin afectación (mismo rango que 'Baja', para que el cluster no la
  // trate como "más grave" que nada).
  severidadRango: number
  // false siempre para 'sin_afectacion_reportada': no aplica el umbral de
  // "sin reportar" si no hay parte que reportar.
  sinActualizar: boolean
  // false siempre para 'sin_afectacion_reportada'.
  esEvacuado: boolean
  // true sólo para estadoEstablecimiento === 'centro_evacuados'. Permite que
  // el agregado de cluster distinga centro de evacuados (prioridad 1, Tent)
  // de evacuado (prioridad 2, DoorOpen) al elegir el ícono del cluster.
  esCentroEvacuados: boolean
  // Campo explícito para que la ficha/tooltip distinga sin adivinar por color.
  estado: 'afectada' | 'sin_afectacion_reportada'
}

/**
 * Un Feature/Point por escuela CON coordenadas. Las escuelas sin lat o lon se
 * filtran defensivamente aunque `EscuelasMapaResultado.escuelas` ya debería
 * venir sin ellas: el resultado debe coincidir con las escuelas válidas de
 * entrada, sin perder ni duplicar ninguna.
 */
export function construirEscuelasMapaFeatureCollection(
  escuelas: EscuelaMapaPadron[],
): FeatureCollection<Point, PropiedadesEscuelaMapa> {
  const features = escuelas
    .filter((escuela) => escuela.lat !== null && escuela.lon !== null)
    .map((escuela) => {
      const parte = escuela.estado === 'afectada' ? escuela.parte : undefined

      const properties: PropiedadesEscuelaMapa = parte
        ? {
            cueAnexo: escuela.cueAnexo,
            nombre: escuela.nombre,
            color: colorSeveridad(parte.peorSeveridad),
            servicio: parte.servicio,
            alumnosAlcanzados: parte.alumnosAlcanzados,
            severidad: parte.peorSeveridad,
            severidadRango: rangoSeveridad(parte.peorSeveridad),
            gravedad: escuela.gravedad,
            icono: iconoPunto(escuela),
            sinActualizar: escuela.sinActualizar,
            esEvacuado:
              parte.estadoEstablecimiento === 'evacuado' ||
              parte.estadoEstablecimiento === 'centro_evacuados',
            esCentroEvacuados: parte.estadoEstablecimiento === 'centro_evacuados',
            estado: 'afectada',
          }
        : {
            cueAnexo: escuela.cueAnexo,
            nombre: escuela.nombre,
            color: COLOR_SIN_AFECTACION,
            servicio: 'normal',
            alumnosAlcanzados: 0,
            severidad: ETIQUETA_SIN_AFECTACION,
            severidadRango: 0,
            gravedad: escuela.gravedad,
            icono: null,
            sinActualizar: false,
            esEvacuado: false,
            esCentroEvacuados: false,
            estado: 'sin_afectacion_reportada',
          }

      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [escuela.lon as number, escuela.lat as number] as [number, number],
        },
        properties,
      }
    })

  return { type: 'FeatureCollection', features }
}
