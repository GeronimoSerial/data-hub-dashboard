'use client'

import { Opcion } from '@/components/ui/opcion'

export function SelectorCarreras({ carreras, seleccionadas, onCambiar, disabled = false }: {
  carreras: readonly string[]
  seleccionadas: string[]
  onCambiar: (carreras: string[]) => void
  disabled?: boolean
}) {
  const obsoletas = seleccionadas.filter((carrera) => !carreras.includes(carrera))

  return (
    <fieldset className="afectacion-campos__grupo" disabled={disabled}>
      <legend className="afectacion-campos__legend">Carreras afectadas</legend>
      <p>Seleccione una o más carreras del establecimiento.</p>
      {obsoletas.length > 0 ? (
        <div role="alert" className="reporte-inicial__error">
          <p>Hay carreras guardadas que ya no figuran en el catálogo. Quite las opciones obsoletas y seleccione las vigentes para continuar.</p>
          <div className="afectacion-campos__opciones">
            {obsoletas.map((carrera) => (
              <Opcion key={carrera} tipo="checkbox" label={`${carrera} (ya no disponible)`} checked
                onChange={() => onCambiar(seleccionadas.filter((valor) => valor !== carrera))} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="afectacion-campos__opciones">
        {carreras.map((carrera) => (
          <Opcion key={carrera} tipo="checkbox" label={carrera} checked={seleccionadas.includes(carrera)}
            onChange={(event) => onCambiar(event.currentTarget.checked ? [...seleccionadas, carrera] : seleccionadas.filter((valor) => valor !== carrera))} />
        ))}
      </div>
      <p className="afectacion-borrador__resumen" aria-live="polite">{seleccionadas.length === 1 ? '1 carrera seleccionada' : `${seleccionadas.length} carreras seleccionadas`}</p>
    </fieldset>
  )
}
