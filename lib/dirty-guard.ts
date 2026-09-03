import * as React from 'react'

const DIRTY_MESSAGE = 'Hay cambios sin guardar. ¿Querés descartarlos?'

export function useDirtyGuard(dirty: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  return React.useCallback(() => {
    if (!dirty || window.confirm(DIRTY_MESSAGE)) onClose()
  }, [dirty, onClose])
}
