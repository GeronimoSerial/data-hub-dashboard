'use client'

import { useSyncExternalStore, type RefObject } from 'react'

function subscribe(notify: () => void) {
  document.addEventListener('fullscreenchange', notify)
  return () => document.removeEventListener('fullscreenchange', notify)
}

function getSnapshot(): HTMLElement | null {
  return document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : null
}

export function useFullscreenElement(): HTMLElement | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}

export function useFullscreenTarget(targetRef: RefObject<HTMLElement | null>): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot() !== null && getSnapshot() === targetRef.current,
    () => false,
  )
}
