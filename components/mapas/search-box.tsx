'use client'

import { useMemo, useState } from 'react'
import { Button, Input } from '@fluentui/react-components'
import type { EstablishmentProperties } from '@/lib/map-types'
import type { MapData } from '@/lib/use-map-data'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

type Hit = {
  cue: string
  name: string
  coordinates: [number, number]
  properties: EstablishmentProperties
}

type Props = {
  data: MapData
  onSelect: (hit: Hit) => void
}

export function SearchBox({ data, onSelect }: Props) {
  const styles = useOverlayStyles()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []

    const hits: Hit[] = []
    for (const feature of data.establishments.features) {
      const p = feature.properties
      const geom = feature.geometry
      if (!p || geom.type !== 'Point') continue
      const name = (p.name ?? '').toLowerCase()
      const cue = (p.cue ?? '').toLowerCase()
      if (!name.includes(q) && !cue.includes(q)) continue
      const coordinates = geom.coordinates as [number, number]
      hits.push({
        cue: p.cue ?? '',
        name: p.name ?? 'Establecimiento',
        coordinates,
        properties: p,
      })
      if (hits.length >= 12) break
    }
    return hits
  }, [data.establishments, query])

  return (
    <div className={styles.controlCard}>
      <h2 className={styles.controlHeading}>Buscar</h2>
      <Input
        type="search"
        placeholder="Nombre o CUE…"
        value={query}
        onChange={(_e, d) => setQuery(d.value)}
        aria-label="Buscar establecimiento"
      />
      {results.length > 0 && (
        <ul className={styles.searchResults}>
          {results.map((hit) => (
            <li key={hit.cue}>
              <Button
                appearance="subtle"
                className={styles.searchHit}
                onClick={() => {
                  onSelect(hit)
                  setQuery('')
                }}
              >
                <span>
                  <div>{hit.name}</div>
                  <div className={styles.popupMuted}>{hit.cue}</div>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
