// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HistorialMovimiento, type MovimientoHistorial } from './historial-movimiento'

afterEach(() => {
  document.body.innerHTML = ''
})

// Hora local, no UTC: el componente formatea en la zona del navegador.
function iso(anio: number, mes: number, dia: number, hora: number, minuto: number): string {
  return new Date(anio, mes - 1, dia, hora, minuto, 0, 0).toISOString()
}

function movimiento(parcial: Partial<MovimientoHistorial> = {}): MovimientoHistorial {
  const carga = iso(2026, 9, 18, 10, 35)
  return {
    id: 'mov-1',
    tipo: 'actualizacion',
    rol: 'director',
    creadaEn: carga,
    rigeDesde: carga,
    cambios: ['Clases normales → Clases suspendidas en 2.º A'],
    ...parcial,
  }
}

function renderEnLista(datos: MovimientoHistorial) {
  return render(
    <ol>
      <HistorialMovimiento movimiento={datos} />
    </ol>,
  )
}

describe('HistorialMovimiento', () => {
  it('muestra la fecha y hora de carga y el rol', () => {
    renderEnLista(movimiento())

    expect(screen.getByText('18 sep · 10:35')).toBeInTheDocument()
    expect(screen.getByText('Director')).toBeInTheDocument()
  })

  it('muestra las líneas de cambios tal como las redactó el servidor', () => {
    renderEnLista(
      movimiento({
        cambios: [
          'Clases normales → Clases suspendidas en 2.º A',
          'Se agregó "Inaccesibilidad de alumnos" · Severidad Media',
          '12 alumnos incorporados',
        ],
      }),
    )

    const lineas = screen.getAllByRole('listitem').filter((el) => el.className.includes('__cambio'))
    expect(lineas.map((el) => el.textContent)).toEqual([
      'Clases normales → Clases suspendidas en 2.º A',
      'Se agregó "Inaccesibilidad de alumnos" · Severidad Media',
      '12 alumnos incorporados',
    ])
  })

  it('no muestra "Rige desde" cuando coincide con la carga', () => {
    const carga = iso(2026, 9, 18, 10, 35)
    renderEnLista(movimiento({ creadaEn: carga, rigeDesde: carga }))

    expect(screen.queryByText(/Rige desde/)).not.toBeInTheDocument()
  })

  it('muestra "Rige desde" cuando difiere de la carga, aunque sea el mismo día', () => {
    renderEnLista(
      movimiento({
        creadaEn: iso(2026, 9, 18, 10, 35),
        rigeDesde: iso(2026, 9, 18, 10, 30),
      }),
    )

    expect(screen.getByText('Rige desde el 18 de septiembre a las 10:30')).toBeInTheDocument()
  })

  it('traduce el rol de supervisor', () => {
    renderEnLista(movimiento({ rol: 'supervisor' }))

    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  it('no dibuja la lista de cambios cuando el movimiento no trae ninguno', () => {
    const { container } = renderEnLista(movimiento({ cambios: [] }))

    expect(container.querySelector('.historial-movimiento__cambios')).toBeNull()
  })

  it('no usa el vocabulario prohibido de la spec §5.4', () => {
    const { container } = renderEnLista(movimiento())
    const texto = container.textContent ?? ''

    for (const palabra of ['versión', 'entidad', 'registro histórico', 'persistencia']) {
      expect(texto.toLowerCase()).not.toContain(palabra)
    }
  })
})
