'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CabeceraRemitoView, ReceiptListing, SchoolLineView } from '@/lib/cuadernillos/remito-receipts'
import { loadJson } from '../cabecera/cabecera-api'

const FAILURE = 'No se pudieron cargar los recibidos.'

function isListing(value: unknown): value is ReceiptListing {
  if (!value || typeof value !== 'object') return false
  const row = value as { kind?: unknown; remitos?: unknown; lines?: unknown }
  return (row.kind === 'cabecera' && Array.isArray(row.remitos)) || (row.kind === 'school' && Array.isArray(row.lines))
}

/** Loads GET /api/cuadernillos/recepciones; `reload` refetches after a signature. */
export function useReceiptListing() {
  const [listing, setListing] = useState<ReceiptListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    const load = loadJson('/api/cuadernillos/recepciones', isListing, FAILURE)
    load.promise
      .then((data) => { if (active) { setListing(data); setError(null) } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : FAILURE) })
    return () => { active = false; load.cancel() }
  }, [tick])

  const reload = useCallback(() => setTick((value) => value + 1), [])
  const retry = useCallback(() => { setError(null); setTick((value) => value + 1) }, [])
  return { listing, error, reload, retry }
}

export type { CabeceraRemitoView, SchoolLineView }
