'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTextos } from '@/lib/i18n/idioma-provider'
import type { Idioma } from '@/lib/i18n/idioma'
import styles from '@/app/(hub)/mapas/infraestructura/map-header.module.css'

// Each language is named in its own language, so these are not dictionary entries.
const NOMBRE_IDIOMA: Record<Idioma, string> = { es: 'Español', pt: 'Português' }

// Language switch for regions with more than one language. Saves the user's
// preference, then refreshes the route so the server re-renders in that language.
export function SelectorIdioma({
  idioma,
  idiomas,
}: {
  idioma: Idioma
  idiomas: readonly Idioma[]
}) {
  const router = useRouter()
  const textos = useTextos()
  const [guardando, setGuardando] = useState(false)

  async function elegir(nuevo: Idioma) {
    if (nuevo === idioma || guardando) return
    setGuardando(true)
    try {
      const res = await fetch('/api/usuario/idioma', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idioma: nuevo }),
      })
      if (res.ok) router.refresh()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      role="group"
      aria-label={textos.selectorIdioma.label}
      data-testid="selector-idioma"
      className={styles.idiomaSegmentado}
    >
      {idiomas.map((opcion) => (
        <button
          key={opcion}
          type="button"
          className={styles.idiomaBoton}
          aria-pressed={opcion === idioma}
          disabled={guardando}
          onClick={() => elegir(opcion)}
        >
          {NOMBRE_IDIOMA[opcion]}
        </button>
      ))}
    </div>
  )
}
