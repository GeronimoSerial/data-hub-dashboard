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
    document.documentElement.dataset.theme = mode
  }, [mode])

  return (
    <ThemeModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeModeContext.Provider>
  )
}