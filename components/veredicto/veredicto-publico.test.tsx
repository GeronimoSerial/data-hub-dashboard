// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { VeredictoPublico } from './veredicto-publico'
import type { DtoVeredicto } from '@/lib/infraestructura/veredicto/dto'

afterEach(() => cleanup())

function dto(parcial: Partial<DtoVeredicto>): DtoVeredicto {
  return {
    id: 'ver',
    fecha: '2026-10-12',
    ambito: 'provincia',
    tipoDia: 'observado',
    nivel: 'sin_senal',
    texto: 'Sin señales de inundación en la provincia.',
    fuente: 'plantilla',
    enCalibracion: false,
    cerrado: false,
    generadoEn: '2026-10-13T09:00:00.000Z',
    version: null,
    frases: null,
    traza: [],
    metricas: [
      {
        id: 'lluvia.obs_24h.max_mm',
        valor: 12.5,
        unidad: 'mm',
        etiqueta: 'Lluvia máxima 24h',
        fuenteUrl: 'https://example.org/imerg',
      },
    ],
    fuentesAusentes: [],
    aguasArriba: [],
    ...parcial,
  }
}

const VERED = [
  dto({ id: 'a', fecha: '2026-10-13', tipoDia: 'pronostico', nivel: 'alerta', texto: 'Alerta por lluvias.' }),
  dto({ id: 'b', fecha: '2026-10-12', tipoDia: 'observado', nivel: 'sin_senal', enCalibracion: true }),
  dto({
    id: 'c',
    fecha: '2026-10-12',
    ambito: 'departamento:dep-1',
    tipoDia: 'observado',
    nivel: 'vigilancia',
    texto: 'Vigilancia en el departamento.',
  }),
]

describe('VeredictoPublico', () => {
  it('muestra el título y el aviso de no oficialidad', () => {
    render(<VeredictoPublico veredictos={VERED} />)
    expect(screen.getByText('Veredicto diario de inundaciones — Provincia de Corrientes')).toBeTruthy()
    expect(
      screen.getByText('No es un aviso oficial. Consulte al SMN, a Prefectura Naval y a Defensa Civil.'),
    ).toBeTruthy()
  })

  it('indica calibración cuando algún veredicto está en calibración', () => {
    render(<VeredictoPublico veredictos={VERED} />)
    expect(screen.getByText(/En calibración/)).toBeTruthy()
  })

  it('muestra las fechas en orden ascendente con su tipo de día', () => {
    const { container } = render(<VeredictoPublico veredictos={VERED} />)
    const texto = container.textContent ?? ''
    expect(texto.indexOf('12/10')).toBeLessThan(texto.indexOf('13/10'))
    expect(texto).toContain('12/10 — Observado')
    expect(texto).toContain('13/10 — Pronóstico')
  })

  it('muestra el texto del veredicto provincial y de los departamentos', () => {
    render(<VeredictoPublico veredictos={VERED} />)
    expect(screen.getByText('Alerta por lluvias.')).toBeTruthy()
    expect(screen.getByText('Vigilancia en el departamento.')).toBeTruthy()
  })

  it('no expone identificadores técnicos de métricas', () => {
    const { container } = render(<VeredictoPublico veredictos={VERED} />)
    expect(container.textContent ?? '').not.toContain('lluvia.obs')
  })

  it('muestra las aguas arriba como contexto en el día de la provincia', () => {
    const conAguas = dto({
      id: 'x',
      fecha: '2026-10-11',
      aguasArriba: [
        { estacionId: 'pna-iguazu', nombre: 'IGUAZU', rio: 'parana', estadoMax: 'alerta', alturaMaxM: 27.5, umbralM: 27.9 },
      ],
    })
    render(<VeredictoPublico veredictos={[conAguas]} />)
    expect(
      screen.getByText(
        'Aguas arriba (contexto, no modifica el nivel): Prefectura Iguazú (río Paraná): 27,50 m, sobre alerta 27,90 m',
      ),
    ).toBeTruthy()
  })

  it('muestra los eventos confirmados de cada día como contexto', () => {
    const eventos = [
      {
        id: 'EV-1',
        fecha: '2026-10-13',
        fechaTexto: '13/10',
        departamento: 'PASO DE LOS LIBRES',
        lugar: 'Ruta 14',
        titulo: 'Calles anegadas',
        tipo: 'Evento reportado' as const,
        confianza: 'alta' as const,
        confianzaTexto: 'Confianza alta' as const,
        fuente: { medio: 'Diario X', fecha: '13/10/2026', url: 'https://ex.com/nota' },
      },
    ]
    render(<VeredictoPublico veredictos={VERED} eventos={eventos} />)
    expect(screen.getAllByText('Confirmado en terreno (no modifica el nivel)')).toHaveLength(2)
    expect(screen.getByText('Calles anegadas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Diario X, 13/10/2026' })).toHaveAttribute('href', 'https://ex.com/nota')
    expect(screen.getAllByText('Sin eventos confirmados con fuente verificable para este día.')).toHaveLength(1)
  })

  it('lista las fuentes con enlace, sin duplicar URLs', () => {
    render(<VeredictoPublico veredictos={VERED} />)
    // URL fuera del catálogo: el nombre legible cae a la propia URL.
    const enlaces = screen.getAllByRole('link', { name: 'https://example.org/imerg' })
    expect(enlaces).toHaveLength(1)
    expect(enlaces[0]!.getAttribute('href')).toBe('https://example.org/imerg')
  })
})
