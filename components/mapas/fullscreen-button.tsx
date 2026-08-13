'use client'

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { Button } from '@fluentui/react-components'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

type Props = {
  targetRef: RefObject<HTMLElement | null>
}

export function FullscreenButton({ targetRef }: Props) {
  const styles = useOverlayStyles()
  const [active, setActive] = useState(false)

  useEffect(() => {
    const onChange = () => {
      setActive(document.fullscreenElement === targetRef.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [targetRef])

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
      appearance="outline"
      className={styles.fullscreenBtn}
      onClick={() => void toggle()}
    >
      {active ? 'Salir de pantalla completa' : 'Pantalla completa'}
    </Button>
  )
}
