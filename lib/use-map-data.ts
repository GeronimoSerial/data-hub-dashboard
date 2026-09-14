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

let cachedData: MapData | null = null
let pendingLoad: Promise<MapData> | null = null

async function fetchMapData(): Promise<MapData> {
  if (cachedData) return cachedData
  if (pendingLoad) return pendingLoad
  pendingLoad = Promise.all([
    fetch('/data/summary.json').then((r) => { if (!r.ok) throw new Error('No se pudo cargar el resumen del mapa'); return r.json() as Promise<Summary> }),
    fetch('/data/establishments.geojson').then((r) => { if (!r.ok) throw new Error('No se pudo cargar el dataset de establecimientos'); return r.json() as Promise<GeoJsonFeatureCollection<Point, EstablishmentProperties>> }),
    fetch('/data/zones.geojson').then((r) => { if (!r.ok) throw new Error('No se pudo cargar el dataset de zonas'); return r.json() as Promise<GeoJsonFeatureCollection<Polygon, ZoneProperties>> }),
    fetch('/data/localities.geojson').then((r) => { if (!r.ok) throw new Error('No se pudo cargar el dataset de localidades'); return r.json() as Promise<GeoJsonFeatureCollection<Point, LocalityProperties>> }),
    fetch('/data/api-cantidad-alumnos.json').then((r) => r.ok ? r.json() as Promise<ApiEnrollmentData> : null).catch(() => null),
    fetch('/data/sobreoferta.json').then((r) => r.ok ? r.json() as Promise<SobreofertaData> : null).catch(() => null),
  ]).then(([summary, establishments, zones, localities, apiEnrollment, sobreoferta]) => {
    cachedData = { summary, establishments, zones, localities, apiEnrollment, sobreoferta }
    return cachedData
  }).finally(() => { pendingLoad = null })
  return pendingLoad
}

export function clearMapDataCache() {
  cachedData = null
  pendingLoad = null
}

export function useMapData() {
  const [data, setData] = useState<MapData | null>(cachedData)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!cachedData)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const next = await fetchMapData()

        if (!cancelled) {
          setData(next)
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
  }, [attempt])

  return { data, error, loading, retry: () => { clearMapDataCache(); setAttempt((value) => value + 1) } }
}
