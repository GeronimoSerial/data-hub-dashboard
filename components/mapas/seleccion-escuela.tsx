import { Button } from '@/components/ui/button'

interface SeleccionEscuelaProps {
  nombre: string
  onVerFicha: () => void
  onQuitarSeleccion: () => void
}

export function SeleccionEscuela({ nombre, onVerFicha, onQuitarSeleccion }: SeleccionEscuelaProps) {
  return (
    <section className="map-sidebar-seleccion" role="group" aria-label="Escuela seleccionada">
      <div>
        <p className="map-sidebar-seleccion__rotulo">Escuela seleccionada:</p>
        <p className="map-sidebar-seleccion__nombre">{nombre}</p>
      </div>
      <div className="map-sidebar-seleccion__acciones">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="reabrir-ficha"
          aria-label={`Reabrir la ficha de ${nombre}`}
          onClick={onVerFicha}
        >
          Ver ficha
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="quitar-seleccion"
          onClick={onQuitarSeleccion}
        >
          Quitar selección
        </Button>
      </div>
    </section>
  )
}
