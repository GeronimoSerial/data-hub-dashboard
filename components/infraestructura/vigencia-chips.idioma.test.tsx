// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { VigenciaChips } from './vigencia-chips'

afterEach(() => cleanup())

describe('VigenciaChips · idioma', () => {
  it('muestra los chips, la hora y el resumen en portugués cuando el idioma es pt', () => {
    render(
      <IdiomaProvider idioma="pt">
        <VigenciaChips value={{ modo: 'otro', fecha: '', hora: '' }} onChange={() => {}} label="Quando" />
      </IdiomaProvider>,
    )
    const opciones = screen.getByRole('radiogroup', { name: 'Quando' })
    expect(within(opciones).getByText('Agora')).toBeInTheDocument()
    expect(within(opciones).getByText('Hoje, mais cedo')).toBeInTheDocument()
    expect(within(opciones).getByText('Outro dia')).toBeInTheDocument()
    expect(screen.getByLabelText('Data')).toBeInTheDocument()
    expect(screen.getByLabelText('Horário')).toBeInTheDocument()
    expect(screen.queryByLabelText('Hora')).not.toBeInTheDocument()
  })

  it('usa pt-BR en los campos nativos de fecha y hora cuando el idioma es pt', () => {
    render(
      <IdiomaProvider idioma="pt">
        <VigenciaChips value={{ modo: 'otro', fecha: '', hora: '' }} onChange={() => {}} label="Quando" />
      </IdiomaProvider>,
    )
    expect(screen.getByLabelText('Data')).toHaveAttribute('lang', 'pt-BR')
    expect(screen.getByLabelText('Horário')).toHaveAttribute('lang', 'pt-BR')
  })

  it('marca el resumen como solucionada por la bandera, no por el texto del momento', () => {
    const { container } = render(
      <IdiomaProvider idioma="pt">
        <VigenciaChips value={{ modo: 'hoy', hora: '05:14' }} onChange={() => {}} label="Solução" etiquetaMomento="Foi resolvida" solucionada />
      </IdiomaProvider>,
    )
    const resumen = container.querySelector('.vigencia-chips__resumen')
    expect(resumen).toHaveClass('vigencia-chips__resumen--solucionada')
    expect(resumen).toHaveTextContent('Foi resolvida hoje às 05:14')
  })

  it('mantiene el estilo solucionada y el español en es', () => {
    const { container } = render(
      <IdiomaProvider idioma="es">
        <VigenciaChips value={{ modo: 'hoy', hora: '05:14' }} onChange={() => {}} label="Solución" etiquetaMomento="Se solucionó" solucionada />
      </IdiomaProvider>,
    )
    const resumen = container.querySelector('.vigencia-chips__resumen')
    expect(resumen).toHaveClass('vigencia-chips__resumen--solucionada')
    expect(resumen).toHaveTextContent('Se solucionó hoy a las 05:14')
    expect(screen.queryByLabelText('Hora')).toBeInTheDocument()
  })
})
