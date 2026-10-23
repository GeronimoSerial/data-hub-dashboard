// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  // Desmonta los árboles de React: vaciar el DOM deja trabajo pendiente del
  // scheduler que corre después de cerrar jsdom (window is not defined).
  cleanup()
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

describe('resumen de secciones', () => {
  it('espera a que se elijan algunas secciones para mostrar el contador', () => {
    const borrador = { ...crearAfectacionVacia('a1'), categoria: 'establecimiento' as const }
    const onChange = vi.fn()
    const { rerender } = render(
      <CamposAQuienAfecta
        borrador={borrador}
        idPrefijo="reporte"
        turnos={TURNOS_FIXTURE}
        usaSelectorEstablecimiento
        onChange={onChange}
      />,
    )

    expect(screen.queryByText(/Seleccionadas:/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Algunas secciones' }))
    rerender(
      <CamposAQuienAfecta
        borrador={{ ...borrador, alcanceEstablecimiento: 'algunas' }}
        idPrefijo="reporte"
        turnos={TURNOS_FIXTURE}
        usaSelectorEstablecimiento
        onChange={onChange}
      />,
    )
    expect(screen.getByText(/Seleccionadas: 0 de/)).toBeInTheDocument()
  })
})

describe('confirmación de categoría', () => {
  it('pide confirmar ya en la primera elección de categoría', () => {
    const onChange = vi.fn()
    renderCamposQuePaso({ onChange })

    fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categoria: 'establecimiento' }))
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

/*
  T4a: al pasar el alcance a "toda la escuela", si el motivo sugiere una
  gravedad mayor que la elegida, se recomienda subirla (una vez por cambio).
*/
describe('CamposAQuienAfecta — recomendación de gravedad por alcance (T4a)', () => {
  const motivosAlcance: MotivoRow[] = [
    { id: 'sin-energia-o-agua', nombre: 'Sin energía o agua', categoria: 'establecimiento', orden: 20 },
    { id: 'tormenta-severa', nombre: 'Tormenta severa', categoria: 'establecimiento', orden: 30 },
    { id: 'inundacion', nombre: 'Inundación', categoria: 'establecimiento', orden: 10 },
  ]

  function renderAlcance({
    motivo,
    severidad,
    secciones = [TURNOS_FIXTURE[0].niveles[0].secciones[0].geSectionId],
    onChange = vi.fn(),
  }: {
    motivo: string
    severidad: AfectacionBorrador['severidad']
    secciones?: number[]
    onChange?: (siguiente: AfectacionBorrador) => void
  }) {
    const borrador: AfectacionBorrador = {
      ...crearAfectacionVacia('a1'),
      categoria: 'establecimiento',
      motivo,
      severidad,
      alcanceEstablecimiento: 'algunas',
      secciones,
    }
    render(
      <CamposAQuienAfecta
        borrador={borrador}
        idPrefijo="reporte"
        turnos={TURNOS_FIXTURE}
        usaSelectorEstablecimiento
        motivos={motivosAlcance}
        onChange={onChange}
      />,
    )
    return { onChange }
  }

  it('abre la recomendación cuando el alcance pasa a toda y la sugerida es mayor', () => {
    renderAlcance({ motivo: 'Sin energía o agua', severidad: 'Media' })

    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent('Recomendamos subir la gravedad')
    expect(dialogo).toHaveTextContent('Sugerimos Alta en lugar de Media porque afecta a toda la escuela.')
    expect(screen.getByRole('button', { name: 'Cambiar a Alta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mantener Media' })).toBeInTheDocument()
  })

  it('compara la sugerida para toda la escuela con la del motivo, antes y después', () => {
    renderAlcance({ motivo: 'Tormenta severa', severidad: 'Media' })

    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Sugerimos Crítica en lugar de Alta porque afecta a toda la escuela.')
  })

  it('no abre la recomendación si la gravedad elegida ya es igual o mayor', () => {
    renderAlcance({ motivo: 'Sin energía o agua', severidad: 'Alta' })

    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('no abre la recomendación en Inundación: su sugerida ya es Crítica y el alcance no la sube', () => {
    renderAlcance({ motivo: 'Inundación', severidad: 'Media' })

    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Cambiar a" aplica la gravedad sugerida', () => {
    const { onChange } = renderAlcance({ motivo: 'Sin energía o agua', severidad: 'Media' })

    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a Alta' }))

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ severidad: 'Alta' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Mantener" conserva la gravedad elegida', () => {
    const { onChange } = renderAlcance({ motivo: 'Sin energía o agua', severidad: 'Media' })

    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mantener Media' }))

    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ severidad: 'Alta' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('subir a Crítica sugerida por el alcance no pide justificación', () => {
    // Con todas las secciones ya elegidas, "Toda la escuela" da el alcance que el servidor también usa.
    const todas = TURNOS_FIXTURE.flatMap((turno) => turno.niveles.flatMap((nivel) => nivel.secciones.map((s) => s.geSectionId)))
    const { onChange } = renderAlcance({ motivo: 'Tormenta severa', severidad: 'Media', secciones: todas })

    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a Crítica' }))

    expect(screen.queryByText('¿Por qué es crítica?')).not.toBeInTheDocument()
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ severidad: 'Crítica' }))
  })
})

describe('prioridad automática de alumnos', () => {
  it('no pide gravedad ni justificación al elegir inaccesibilidad', () => {
    renderCamposQuePaso({ borrador: { ...crearAfectacionVacia('a1'), categoria: 'alumnos', motivo: 'Anegamiento' } })
    expect(screen.queryByRole('radio', { name: /Baja/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Crítica/ })).not.toBeInTheDocument()
  })
  it('muestra porcentaje y prioridad sin sugerir cambiar de categoría por afectar a la mayoría', () => {
    const alumnos = TURNOS_FIXTURE.flatMap((t) => t.niveles.flatMap((n) => n.secciones.flatMap((s) => s.alumnos)))
    render(<CamposAQuienAfecta idPrefijo="auto" turnos={TURNOS_FIXTURE.map((t) => ({ ...t, niveles: t.niveles.map((n) => ({ ...n, secciones: n.secciones.map((s) => ({ ...s, alumnosMatriculados: s.alumnos.map((a) => a.gePersonId) })) })) }))} onChange={vi.fn()}
      borrador={{ ...crearAfectacionVacia('a'), categoria: 'alumnos', motivo: 'Anegamiento', alumnos: alumnos.map((a) => a.gePersonId) }} />)
    expect(screen.getByText(/100% · Prioridad/)).toBeInTheDocument()
    expect(screen.queryByText(/mayoría de los alumnos/)).not.toBeInTheDocument()
  })
})
