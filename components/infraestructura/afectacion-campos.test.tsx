// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CamposAQuienAfecta, CamposQuePaso, crearAfectacionVacia, TEXTO_CONFIRMAR_CATEGORIA, type AfectacionBorrador } from './afectacion-campos'
import { SEVERIDAD_CRITERIOS } from '@/lib/infraestructura/severidad'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import { TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'

const motivos: MotivoRow[] = [
  { id: 'inundacion', nombre: 'Inundación', categoria: 'establecimiento', orden: 10 },
  { id: 'anegamiento', nombre: 'Anegamiento', categoria: 'alumnos', orden: 10 },
]

function renderCamposQuePaso({
  onChange = vi.fn(),
  borrador = crearAfectacionVacia('a1'),
}: {
  onChange?: (siguiente: AfectacionBorrador) => void
  borrador?: AfectacionBorrador
} = {}) {
  return render(
    <CamposQuePaso
      borrador={borrador}
      idPrefijo="reporte"
      motivos={motivos}
      otrasAfectaciones={[]}
      onChange={onChange}
    />,
  )
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('CamposAQuienAfecta — selector legado', () => {
  it('no ofrece desplegar alumnos para categoría establecimiento', () => {
    const borrador = { ...crearAfectacionVacia('a1'), categoria: 'establecimiento' as const }
    const turnos = [
      {
        turno: 'Mañana',
        niveles: [
          {
            nivel: 'Primaria',
            secciones: [
              {
                geSectionId: 10,
                curso: '1°',
                division: 'A',
                nivel: 'Primaria',
                turno: 'Mañana',
                matricula: 1,
                alumnos: [{ gePersonId: 1, nombre: 'Ana', apellido: 'Gómez' }],
              },
            ],
          },
        ],
      },
    ]

    render(
      <CamposAQuienAfecta
        borrador={borrador}
        idPrefijo="reporte"
        turnos={turnos}
        onChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /elegir alumnos/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Gómez, Ana/ })).not.toBeInTheDocument()
  })

  it('muestra el aviso de todas las secciones antes de la lista larga', () => {
    const secciones = TURNOS_FIXTURE.flatMap((turno) => turno.niveles.flatMap((nivel) => nivel.secciones))
    const borrador = {
      ...crearAfectacionVacia('a1'),
      categoria: 'establecimiento' as const,
      alcanceEstablecimiento: 'algunas' as const,
      secciones: secciones.map((seccion) => seccion.geSectionId),
    }
    const { container } = render(
      <CamposAQuienAfecta
        borrador={borrador}
        idPrefijo="reporte"
        turnos={TURNOS_FIXTURE}
        usaSelectorEstablecimiento
        onChange={vi.fn()}
      />,
    )

    const aviso = screen.getByRole('status')
    const grupo = container.querySelector('.afectacion-campos__grupo')!
    expect(aviso).toHaveTextContent('Marcó todas las secciones')
    expect(grupo.children[1]).toBe(aviso)
    expect(grupo.children[2]).toHaveClass('selector-establecimiento')
  })
})

describe('confirmación de categoría', () => {
  it('elige la primera categoría sin abrir la confirmación', () => {
    const onChange = vi.fn()
    renderCamposQuePaso({ onChange })

    fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categoria: 'establecimiento' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('confirma cuando cambia una categoría elegida', () => {
    const borrador = { ...crearAfectacionVacia('a1'), categoria: 'establecimiento' as const }
    renderCamposQuePaso({ borrador })

    fireEvent.click(screen.getByRole('radio', { name: /Inaccesibilidad de alumnos/ }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

/*
  La especificación funcional define que la severidad es por afectación pero
  NO define sus criterios. Sin ellos, "Alta" y "Crítica" quedaban a
  interpretación de cada director y el dato dejaba de ser comparable entre
  escuelas. Los cuatro criterios se acordaron con el dueño de producto.
*/
describe('CamposQuePaso — criterios de severidad', () => {
  it('muestra escrito qué distingue cada nivel', () => {
    renderCamposQuePaso()

    for (const criterio of Object.values(SEVERIDAD_CRITERIOS)) {
      expect(screen.getByText(criterio)).toBeInTheDocument()
    }
  })

  // El contrato de UX de este recorrido prohíbe poner algo necesario detrás
  // de hover: lo llena un director desde el celular, donde no existe.
  it('el criterio está a la vista, no detrás de un gesto', () => {
    renderCamposQuePaso()

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
    renderCamposQuePaso()

    const alta = screen.getByRole('radio', { name: 'Alta' })
    const descripcionId = alta.getAttribute('aria-describedby')

    expect(descripcionId).not.toBeNull()
    expect(document.getElementById(descripcionId as string)).toHaveTextContent(
      SEVERIDAD_CRITERIOS['Alta'],
    )
  })

  it('los cuatro niveles siguen siendo elegibles por su nombre exacto', () => {
    renderCamposQuePaso()

    for (const nivel of ['Baja', 'Media', 'Alta', 'Crítica']) {
      expect(screen.getByRole('radio', { name: nivel })).toBeInTheDocument()
    }
  })

  it('elegir una categoría pide confirmación y cancelar no la aplica', () => {
    const onChange = vi.fn()
    renderCamposQuePaso({ onChange, borrador: { ...crearAfectacionVacia('a1'), categoria: 'establecimiento' } })

    const categoriaAlumnos = screen.getByRole('radio', { name: /Inaccesibilidad de alumnos/ })
    fireEvent.click(categoriaAlumnos)

    expect(categoriaAlumnos).not.toBeChecked()
    expect(screen.getByText(TEXTO_CONFIRMAR_CATEGORIA.alumnos)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir otra' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('confirmar aplica la categoría y limpia los datos dependientes', () => {
    const onChange = vi.fn()
    const borrador = {
      ...crearAfectacionVacia('a1'),
      categoria: 'alumnos' as const,
      motivo: 'Anegamiento',
      severidad: 'Alta' as const,
      justificacionCritica: 'riesgo_fisico' as const,
      justificacionCriticaDetalle: 'detalle',
      alcanceEstablecimiento: 'algunas' as const,
      secciones: [1],
      alumnos: [11],
    }
    renderCamposQuePaso({ onChange, borrador })

    fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      categoria: 'establecimiento',
      motivo: '',
      severidad: '',
      justificacionCritica: '',
      justificacionCriticaDetalle: '',
      alcanceEstablecimiento: '',
      secciones: [],
      alumnos: [],
    }))
  })
})
