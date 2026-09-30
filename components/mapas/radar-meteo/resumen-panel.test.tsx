// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ResumenPanel, ordenarDepartamentos, type DepartamentoResumen } from './resumen-panel'

const departamentos: DepartamentoResumen[] = [
  {
    id: 'b',
    nombre: 'Bella Vista',
    dias: [{
      fecha: '2026-10-01', lluvia24h: 25, lluviaLocalMax: 50, rafagaMaxKmh: 60,
      picoHora: '2026-10-01T18:00:00Z', tormenta: true, granizoMax: null,
      cobertura: 95, resaltado: { lluvia: 'atencion', rafaga: 'atencion' },
    }],
    proximas48h: [],
  },
  {
    id: 'a',
    nombre: 'Capital',
    dias: [{
      fecha: '2026-10-01', lluvia24h: 5, lluviaLocalMax: 6, rafagaMaxKmh: 20,
      picoHora: null, tormenta: false, granizoMax: null, cobertura: 100,
      resaltado: { lluvia: null, rafaga: null },
    }],
    proximas48h: [],
  },
]

describe('panel de resumen radar', () => {
  afterEach(cleanup)

  it('ordena por máximo de lluvia de los próximos tres días', () => {
    expect(ordenarDepartamentos(departamentos).map((depto) => depto.id)).toEqual(['b', 'a'])
  })

  it('muestra precisión reciente con sesgo, POD, FAR y ventana cuando la muestra es válida', () => {
    render(<ResumenPanel departamentos={departamentos} dias={[]} actualizadoHace={4} verificacion={{ estado: 'ok', sesgoMm: -2, pod: 0.8, far: 0.25, nPares: 14, nEventos: 5, desde: '2026-09-16', hasta: '2026-09-29' }} />)
    expect(screen.getByText(/subestima 2 mm\/día/)).toBeInTheDocument()
    expect(screen.getByText(/detecta 80%/)).toBeInTheDocument()
    expect(screen.getByText(/25% de falsas alarmas/)).toBeInTheDocument()
    expect(screen.getByText(/2026-09-16–2026-09-29/)).toBeInTheDocument()
  })

  it('muestra conteos y explicación sin un porcentaje único cuando falta muestra', () => {
    render(<ResumenPanel departamentos={departamentos} dias={[]} actualizadoHace={4} verificacion={{ estado: 'muestra_insuficiente', sesgoMm: null, pod: null, far: null, nPares: 8, nEventos: 2, desde: '2026-09-16', hasta: '2026-09-29' }} />)
    expect(screen.getByText('Aún sin muestra suficiente (8 de 14 días, 2 de 5 eventos).')).toBeInTheDocument()
    expect(screen.getByText('Aún sin muestra suficiente (8 de 14 días, 2 de 5 eventos).').closest('span')).toHaveAttribute('title', expect.stringContaining('IMERG es una estimación'))
  })

  it('resalta umbrales en negrita sin llamar alerta al valor', () => {
    const { container } = render(<ResumenPanel departamentos={departamentos} dias={['2026-10-01']} actualizadoHace={4} />)
    const threshold = container.querySelector('.radar-dia-cell .threshold') as HTMLElement
    expect(threshold.className).toContain('threshold')
    expect(threshold.closest('button')).toHaveClass('is-highlighted')
    expect(threshold.closest('button')?.textContent).not.toMatch(/alerta/i)
  })

  it('muestra dos departamentos principales en el resumen móvil colapsado', () => {
    const { container } = render(<ResumenPanel departamentos={departamentos} dias={['2026-10-01']} actualizadoHace={4} />)
    const peek = container.querySelector('.radar-resumen-peek') as HTMLElement
    expect(peek.textContent).toContain('Bella Vista 25,0 mm')
    expect(peek.textContent).toContain('Capital 5,0 mm')
    expect((container.querySelector('.radar-resumen-toggle') as HTMLButtonElement).getAttribute('aria-expanded')).toBe('false')
  })

  it('indica que no se prevé lluvia en 48 h cuando la serie queda bajo 0,1 mm', () => {
    const { container } = render(<ResumenPanel
      departamentos={[{
        ...departamentos[0],
        proximas48h: [{ hora: '2026-10-01T12:00:00Z', lluviaMm: 0.04, rafagaMaxKmh: null, probabilidadMax: null, cobertura: 100 }],
      }]}
      dias={[]}
      actualizadoHace={4}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Próximas 48 h' }))
    expect(screen.getByText('Sin lluvia prevista en 48 h')).toBeInTheDocument()
    expect(container.querySelector('.radar-hour-row')).toBeNull()
    expect(screen.queryByText(/Pico:/)).toBeNull()
  })

  it('escala lluvia pequeña contra un mínimo de 1 mm y ordena por total de 48 h', () => {
    const series = (nombre: string, valores: number[]): DepartamentoResumen => ({
      ...departamentos[1],
      id: nombre,
      nombre,
      proximas48h: valores.map((lluviaMm, index) => ({
        hora: `2026-10-01T${String(index).padStart(2, '0')}:00:00Z`,
        lluviaMm,
        rafagaMaxKmh: null,
        probabilidadMax: null,
        cobertura: 100,
      })),
    })
    const { container } = render(<ResumenPanel
      departamentos={[series('B', [1, 0]), series('A', [0.9, 0.9])]}
      dias={[]}
      actualizadoHace={4}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Próximas 48 h' }))
    const filas = [...container.querySelectorAll('tbody tr')]
    expect(filas.map((fila) => fila.querySelector('th')?.textContent)).toEqual(['A', 'B'])
    const barra = filas[0].querySelector('.radar-hour-row i') as HTMLElement
    expect(Number.parseFloat(barra.style.height)).toBeGreaterThan(2)
  })
})
