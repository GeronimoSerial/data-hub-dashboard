'use client'

import { useCallback, useEffect, useState } from 'react'
import { loadReserve, type ReserveView } from './reserve-api'

/**
 * The cabecera's reserve. A failing overview hides the section (the receipt listing already explains
 * account problems); a failing reserve read shows a retryable message.
 */
export function useReserve(enabled: boolean) {
  const [view, setView] = useState<ReserveView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const signal = { cancelled: false }
    const cancels: Array<() => void> = []
    loadReserve(signal, cancels)
      .then((data) => { if (!signal.cancelled) { setView(data); setError(null) } })
      .catch((reason: unknown) => { if (!signal.cancelled) { setView(null); setError(reason instanceof Error ? reason.message : null) } })
    return () => { signal.cancelled = true; cancels.forEach((cancel) => cancel()) }
  }, [enabled, tick])

  const reload = useCallback(() => setTick((value) => value + 1), [])
  return { view, error, reload }
}
