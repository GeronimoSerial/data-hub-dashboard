'use client'

import type { JSX } from 'react'
import { SheetContent, SheetRoot, SheetTitle } from '@/components/ui/sheet'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { HistorialParte } from './historial-parte'

/**
 * Historial completo de un parte, para el mapa (F3.4).
 *
 * `Sheet` lateral en vez de `Dialog` centrado: a diferencia de la ficha (un
 * puñado de bloques que caben en un modal), el historial es una lista que
 * puede crecer sin techo — un movimiento por carga del parte — y en
 * `MobileFilters` (components/explore-filters-sheet.tsx) ya es el precedente
 * para "panel largo al costado del contenido principal", no un modal que tapa
 * el mapa entero.
 *
 * `HistorialParte` ya está parametrizado (F3.4) para aceptar cualquier
 * endpoint: acá se le pasa la ruta del mapa
 * (`/api/mapas/infraestructura/historial`, auth de sesión del hub) en vez de
 * la del director, y se apaga `mostrarReingresoCookie` — un 401 en el mapa no
 * se resuelve reingresando una contraseña de cookie que el mapa nunca usó.
 */
export function HistorialParteModal({
  cueAnexo,
  onOpenChange,
}: {
  cueAnexo: string | null
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  const open = cueAnexo !== null
  const t = useTextos().fichaHistorial.parte

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="map-historial-sheet">
        <SheetTitle>{t.titulo}</SheetTitle>
        <div className="historial-parte-modal__body">
          {/* Igual que RecursoDialog (components/admin-page.tsx): el
              contenido sólo se monta con el panel abierto, así el fetch de
              HistorialParte corre una vez por apertura y no antes. `key`
              fuerza un remontaje limpio si se reabre con OTRO cue sin pasar
              por un ciclo close→open completo. */}
          {cueAnexo ? (
            <HistorialParte
              key={cueAnexo}
              cue={cueAnexo}
              endpoint={`/api/mapas/infraestructura/historial?cue=${encodeURIComponent(cueAnexo)}`}
              mostrarReingresoCookie={false}
            />
          ) : null}
        </div>
      </SheetContent>
    </SheetRoot>
  )
}
