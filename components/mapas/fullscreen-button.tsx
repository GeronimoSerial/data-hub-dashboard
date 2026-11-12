'use client'

import { useCallback, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { useFullscreenTarget } from '@/components/ui/use-fullscreen-element'
import { useTextos } from '@/lib/i18n/idioma-provider'

type Props = {
  targetRef: RefObject<HTMLElement | null>
}

export function FullscreenButton({ targetRef }: Props) {
  const styles = useOverlayStyles()
  const active = useFullscreenTarget(targetRef)
  const t = useTextos().controles.pantalla

  const toggle = useCallback(async () => {
    const el = targetRef.current
    if (!el) return
    if (document.fullscreenElement === el) {
      await document.exitFullscreen()
    } else {
      await el.requestFullscreen()
    }
  }, [targetRef])

  return (
    <Button
      variant="secondary"
      size="sm"
      className={`${styles.fullscreenBtn} ${active ? 'ui-button--active' : ''}`}
      onClick={() => void toggle()}
    >
      {active ? t.salir : t.entrar}
    </Button>
  )
}
