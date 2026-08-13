'use client'

import { setWorkerUrl } from 'maplibre-gl'

export function ensureMapWorker() {
  setWorkerUrl('/maplibre-gl-worker.js')
}
