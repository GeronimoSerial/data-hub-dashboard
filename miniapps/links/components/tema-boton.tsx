'use client'

import { Moon, Sun } from 'lucide-react'
import { useThemeMode } from '@/app/providers'
import { Button } from '@/components/ui/button'

export function TemaBoton() {
  const { mode, setMode } = useThemeMode()
  const oscuro = mode === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={() => setMode(oscuro ? 'light' : 'dark')}
    >
      {oscuro ? <Sun size={19} aria-hidden /> : <Moon size={19} aria-hidden />}
    </Button>
  )
}
