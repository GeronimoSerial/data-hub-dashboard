import * as React from 'react'

/** Serializes one UI mutation, including clicks dispatched before a rerender. */
export function useAdminPendingAction() {
  const pendingRef = React.useRef(false)
  const [pending, setPending] = React.useState(false)

  const run = React.useCallback(async <T,>(action: () => Promise<T> | T) => {
    if (pendingRef.current) return undefined
    pendingRef.current = true
    setPending(true)
    try {
      return await action()
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }, [])

  return { pending, run }
}
