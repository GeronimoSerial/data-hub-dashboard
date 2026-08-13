'use client'

import { useEffect, useState } from 'react'
import type { Point, Polygon } from 'geojson'
import type {
  ApiEnrollmentData,
  EstablishmentProperties,
  GeoJsonFeatureCollection,
  LocalityProperties,
  Summary,
  ZoneProperties,
} from '@/lib/map-types'
import type { SobreofertaData } from '@/lib/sobreoferta'

export type MapData = {
  summary: Summary
  establishments: GeoJsonFeatureCollection<Point, EstablishmentProperties>
  zones: GeoJsonFeatureCollection<Polygon, ZoneProperties>
  localities: GeoJsonFeatureCollection<Point, LocalityProperties>
  apiEnrollment: ApiEnrollmentData | null
  sobreoferta: SobreofertaData | null
}

export function useMapData() {
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [
          summary,
          establishments,
          zones,
          localities,
          apiEnrollment,
          sobreoferta,
        ] = await Promise.all([
          fetch('/data/summary.json').then((r) => {
            if (!r.ok) throw new Error('No se pudo cargar summary.json')
            return r.json() as Promise<Summary>
          }),
          fetch('/data/establishments.geojson').then((r) => {
            if (!r.ok)
              throw new Error('No se pudo cargar establishments.geojson')
            return r.json() as Promise<
              GeoJsonFeatureCollection<Point, EstablishmentProperties>
            >
          }),
          fetch('/data/zones.geojson').then((r) => {
            if (!r.ok) throw new Error('No se pudo cargar zones.geojson')
            return r.json() as Promise<
              GeoJsonFeatureCollection<Polygon, ZoneProperties>
            >
          }),
          fetch('/data/localities.geojson').then((r) => {
            if (!r.ok) throw new Error('No se pudo cargar localities.geojson')
            return r.json() as Promise<
              GeoJsonFeatureCollection<Point, LocalityProperties>
            >
          }),
          fetch('/data/api-cantidad-alumnos.json')
            .then((r) => (r.ok ? (r.json() as Promise<ApiEnrollmentData>) : null))
            .catch(() => null),
          fetch('/data/sobreoferta.json')
            .then((r) => (r.ok ? (r.json() as Promise<SobreofertaData>) : null))
            .catch(() => null),
        ])

        if (!cancelled) {
          setData({
            summary,
            establishments,
            zones,
            localities,
            apiEnrollment,
            sobreoferta,
          })
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Error cargando datos',
          )
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { data, error, loading }
}
