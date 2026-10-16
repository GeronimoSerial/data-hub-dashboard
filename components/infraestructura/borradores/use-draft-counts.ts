'use client'

import { useEffect, useState } from 'react'
import { fetchDraftCounts, type DraftCount } from '@/lib/infraestructura/borradores/mapa-client'

type State = { counts: Map<string, number>; loading: boolean; error: boolean }
let countsRequest: Promise<DraftCount[]> | null = null

function loadCounts(): Promise<DraftCount[]> {
  countsRequest ??= fetchDraftCounts().finally(() => {
    countsRequest = null
  })
  return countsRequest
}

export function useDraftCounts(): State {
  const [state, setState] = useState<State>({ counts: new Map(), loading: true, error: false })

  useEffect(() => {
    let active = true
    loadCounts().then((items) => {
      if (active) setState({ counts: new Map(items.map(({ cue, count }) => [cue, count])), loading: false, error: false })
    }).catch(() => {
      if (active) setState({ counts: new Map(), loading: false, error: true })
    })
    return () => { active = false }
  }, [])

  return state
}
