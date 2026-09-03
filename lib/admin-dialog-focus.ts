import * as React from 'react'

/** Remembers the control that opened a dialog and restores keyboard focus on close. */
export function useAdminDialogFocus(open: boolean) {
  const triggerRef = React.useRef<HTMLElement | null>(null)

  const rememberTrigger = React.useCallback(() => {
    const active = document.activeElement
    triggerRef.current = active instanceof HTMLElement ? active : null
  }, [])

  React.useEffect(() => {
    if (open) return
    const trigger = triggerRef.current
    triggerRef.current = null
    if (trigger?.isConnected) trigger.focus({ preventScroll: true })
  }, [open])

  return rememberTrigger
}
