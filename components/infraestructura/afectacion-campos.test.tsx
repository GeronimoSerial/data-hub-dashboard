// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CamposQuePaso, crearAfectacionVacia } from './afectacion-campos'
import { SEVERIDAD_CRITERIOS } from '@/lib/infraestructura/severidad'
import type { MotivoRow } from '@/lib/infraestructura/motivos'

const motivos: MotivoRow[] = [
  { id: 'inundacion', nombre: 'Inundación', categoria: 'establecimiento', orden: 10 },
  { id: 'anegamiento', nombre: 'Anegamiento', categoria: 'alumnos', orden: 10 },
]

function renderCampos() {
  return render(
    <CamposQuePaso
      borrador={crearAfectacionVacia('a1')}
      idPrefijo="reporte"
      motivos={motivos}
      otrasAfectaciones={[]}
      onChange={vi.fn()}
    />,
  )
}

afterEach(() => {
  document.body.innerHTML = ''
})

/*
  La especificación funcional define que la severidad es por afectación pero
  NO define sus criterios. Sin ellos, "Alta" y "Crítica" quedaban a
  interpretación de cada director y el dato dejaba de ser comparable entre
  escuelas. Los cuatro criterios se acordaron con el dueño de producto.
*/
describe('CamposQuePaso — criterios de severidad', () => {
  it('muestra escrito qué distingue cada nivel', () => {
    renderCampos()

    for (const criterio of Object.values(SEVERIDAD_CRITERIOS)) {
      expect(screen.getByText(criterio)).toBeInTheDocument()
    }
  })

  // El contrato de UX de este recorrido prohíbe poner algo necesario detrás
  // de hover: lo llena un director desde el celular, donde no existe.
  it('el criterio está a la vista, no detrás de un gesto', () => {
    renderCampos()

    const criterio = screen.getByText(SEVERIDAD_CRITERIOS['Crítica'])

    expect(criterio).toBeVisible()
    expect(criterio.closest('[hidden]')).toBeNull()
    expect(criterio.getAttribute('title')).toBeNull()
  })

  /*
    El criterio viaja por aria-describedby, no dentro de la etiqueta: si
    formara parte del nombre accesible, un lector de pantalla anunciaría la
    frase entera cada vez que el director mueve la selección entre niveles.
  */
  it('el nombre accesible de la opción sigue siendo el nivel, y el criterio es su descripción', () => {
    renderCampos()

    const alta = screen.getByRole('radio', { name: 'Alta' })
    const descripcionId = alta.getAttribute('aria-describedby')

    expect(descripcionId).not.toBeNull()
    expect(document.getElementById(descripcionId as string)).toHaveTextContent(
      SEVERIDAD_CRITERIOS['Alta'],
    )
  })

  it('los cuatro niveles siguen siendo elegibles por su nombre exacto', () => {
    renderCampos()

    for (const nivel of ['Baja', 'Media', 'Alta', 'Crítica']) {
      expect(screen.getByRole('radio', { name: nivel })).toBeInTheDocument()
    }
  })
})
