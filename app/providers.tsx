'use client'

import * as React from 'react'

type ThemeMode = 'light' | 'dark'

const ThemeModeContext = React.createContext<{
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}>({ mode: 'light', setMode: () => {} })

export function useThemeMode() {
  return React.useContext(ThemeModeContext)
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<ThemeMode>('light')

  React.useEffect(() => {
    // A theme flip repaints colour, background, border and shadow on nearly
    // every element at once. Without this, every one of those transitions
    // fires together and the switch smears instead of snapping.
    const style = document.createElement('style')
    style.append(
      document.createTextNode(
        '*,*::before,*::after{transition:none !important}',
      ),
    )
    document.head.append(style)

    document.documentElement.dataset.theme = mode

    // Force a reflow so the un-transitioned paint lands before we restore.
    void document.body.offsetHeight
    const frame = requestAnimationFrame(() => style.remove())

    return () => {
      cancelAnimationFrame(frame)
      style.remove()
    }
  }, [mode])

  return (
    <ThemeModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeModeContext.Provider>
  )
}