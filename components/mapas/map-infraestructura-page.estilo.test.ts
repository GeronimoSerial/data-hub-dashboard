import { describe, expect, it } from 'vitest'
import { validateStyleMin, type StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import {
  circlePaintCluster,
  circlePaintEscuelasSinReporte,
  circlePaintPartes,
  colorTextoCluster,
  expresionConteoCluster,
  filtroIconoEscuelaAfectada,
} from './map-infraestructura-page'

describe('estilo del mapa de infraestructura', () => {
  it('valida las expresiones de las capas de infraestructura con MapLibre', () => {
    const estilo: StyleSpecification = {
      version: 8,
      sources: {
        infra: {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [],
          },
        },
      },
      layers: [
        {
          id: 'infra-partes-claro',
          type: 'circle',
          source: 'infra',
          paint: circlePaintPartes(false),
        },
        {
          id: 'infra-partes-oscuro',
          type: 'circle',
          source: 'infra',
          paint: circlePaintPartes(true),
        },
        {
          id: 'infra-clusters',
          type: 'circle',
          source: 'infra',
          paint: circlePaintCluster(false),
        },
        {
          id: 'infra-sin-reporte',
          type: 'circle',
          source: 'infra',
          paint: circlePaintEscuelasSinReporte(false),
        },
        {
          id: 'infra-icono-escuela-afectada',
          type: 'symbol',
          source: 'infra',
          filter: filtroIconoEscuelaAfectada(),
          layout: {},
        },
        {
          id: 'infra-cluster-conteo',
          type: 'symbol',
          source: 'infra',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': expresionConteoCluster(),
            'text-size': 12,
            'text-font': ['Noto Sans Regular'],
          },
          paint: {
            'text-color': colorTextoCluster(false),
          },
        },
      ],
    }

    const errores = validateStyleMin(estilo)
    expect(errores, errores.map((error) => error.message).join('\n')).toHaveLength(0)
  })
})
