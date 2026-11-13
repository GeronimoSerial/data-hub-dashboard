// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { MultiSelect } from '@/components/ui/multi-select'
import { formatearCargaCorta, formatearMomentoHistorial, formatearRigeDesde } from './historial-formato'
import { LineaDeTiempo } from './linea-de-tiempo'
import type { MovimientoHistorial } from './historial-movimiento'

const opciones = [
  { value: 'a', label: 'Carrera A' },
  { value: 'b', label: 'Carrera B' },
]

const movimiento: MovimientoHistorial = {
  id: 'm1',
  tipo: 'actualizacion',
  rol: 'director',
  creadaEn: '2026-09-18T13:35:00.000Z',
  rigeDesde: '2026-09-18T13:35:00.000Z',
  titulo: 'Alta de situación',
  cambios: ['Se agregó una línea'],
}

const otro: MovimientoHistorial = { ...movimiento, id: 'm2', creadaEn: '2026-09-17T13:35:00.000Z', rigeDesde: '2026-09-17T13:35:00.000Z' }

// El cierre X del panel (components/ui/sheet.tsx) también se llama "Cerrar";
// las aserciones apuntan a la barra de acciones para no confundirlo.
function acciones(): HTMLElement {
  return document.querySelector('.bottom-sheet__acciones') as HTMLElement
}

describe('controles compartidos · idioma', () => {
  afterEach(cleanup)

  it('mantiene los textos por defecto en español', () => {
    render(
      <IdiomaProvider idioma="es">
        <MultiSelect<string> value={[]} onChange={() => {}} options={opciones} ariaLabel="Carreras" />
      </IdiomaProvider>,
    )
    expect(screen.getByRole('combobox', { name: 'Carreras' })).toHaveTextContent('Seleccionar…')
  })

  it('mantiene el cierre por defecto en español', () => {
    render(
      <IdiomaProvider idioma="es">
        <BottomSheet open titulo="Ver" onCerrar={() => {}}>
          <p>Cuerpo</p>
        </BottomSheet>
      </IdiomaProvider>,
    )
    expect(within(acciones()).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })

  it('traduce el resumen al portugués de Brasil', () => {
    render(
      <IdiomaProvider idioma="pt">
        <MultiSelect<string> value={['a', 'b']} onChange={() => {}} options={opciones} ariaLabel="Carreras" />
      </IdiomaProvider>,
    )
    expect(screen.getByRole('combobox', { name: 'Carreras' })).toHaveTextContent('2 selecionadas')
  })

  it('traduce el cierre del panel al portugués de Brasil', () => {
    render(
      <IdiomaProvider idioma="pt">
        <BottomSheet open titulo="Ver" onCerrar={() => {}}>
          <p>Cuerpo</p>
        </BottomSheet>
      </IdiomaProvider>,
    )
    expect(within(acciones()).getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
  })

  it('muestra el placeholder portugués sin elegidos', () => {
    render(
      <IdiomaProvider idioma="pt">
        <MultiSelect<string> value={[]} onChange={() => {}} options={opciones} ariaLabel="Carreras" />
      </IdiomaProvider>,
    )
    expect(screen.getByRole('combobox', { name: 'Carreras' })).toHaveTextContent('Selecionar…')
  })

  it('respeta el placeholder y el cierre que pasa el llamador', () => {
    render(
      <IdiomaProvider idioma="pt">
        <MultiSelect<string> value={[]} onChange={() => {}} options={opciones} ariaLabel="Carreras" placeholder="Elija" />
      </IdiomaProvider>,
    )
    expect(screen.getByRole('combobox', { name: 'Carreras' })).toHaveTextContent('Elija')
  })

  it('respeta el texto de cierre que pasa el llamador', () => {
    render(
      <IdiomaProvider idioma="pt">
        <BottomSheet open titulo="Ver" cerrarLabel="Salir" onCerrar={() => {}}>
          <p>Cuerpo</p>
        </BottomSheet>
      </IdiomaProvider>,
    )
    expect(within(acciones()).getByRole('button', { name: 'Salir' })).toBeInTheDocument()
  })

  it('confirma con el texto del llamador y deja el cancelar en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <ConfirmSheet open titulo="¿Seguro?" confirmarLabel="Confirmar" onConfirmar={() => {}} onCancelar={() => {}} />
      </IdiomaProvider>,
    )
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })
})

describe('historial · formato de fechas por idioma', () => {
  it('abrevia el mes en español por defecto y en portugués cuando se pide', () => {
    expect(formatearCargaCorta(movimiento.creadaEn)).toBe('18 sep · 10:35')
    expect(formatearCargaCorta(movimiento.creadaEn, 'pt')).toBe('18 set · 10:35')
  })

  it('escribe el mes completo y la fecha en portugués', () => {
    const ahora = new Date('2026-11-12T12:00:00.000Z')
    expect(formatearMomentoHistorial(movimiento.creadaEn, ahora, 'pt')).toBe('18 de setembro, 10:35')
    expect(formatearMomentoHistorial('2026-11-12T13:35:00.000Z', ahora, 'pt')).toBe('Hoje, 10:35')
    expect(formatearRigeDesde(movimiento.rigeDesde, 'pt')).toBe('Vigente desde o dia 18 de setembro às 10:35')
  })

  it('la línea de tiempo muestra el botón de anteriores en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <LineaDeTiempo movimientos={[movimiento, otro]} limite={1} />
      </IdiomaProvider>,
    )
    expect(screen.getByRole('button', { name: 'Ver movimentações anteriores (1)' })).toBeInTheDocument()
  })
})
