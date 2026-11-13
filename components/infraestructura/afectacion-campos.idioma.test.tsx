// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { CamposQuePaso, crearAfectacionVacia } from './afectacion-campos'

afterEach(() => cleanup())

function renderQuePaso(idioma: 'es' | 'pt') {
  return render(
    <IdiomaProvider idioma={idioma}>
      <CamposQuePaso
        borrador={crearAfectacionVacia('a1')}
        idPrefijo="reporte"
        motivos={[]}
        otrasAfectaciones={[]}
        onChange={() => {}}
      />
    </IdiomaProvider>,
  )
}

describe('CamposQuePaso · idioma', () => {
  it('muestra las categorías en portugués cuando el idioma es pt', () => {
    renderQuePaso('pt')
    expect(screen.getByRole('radio', { name: /Afeta o estabelecimento/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Inacessibilidade de alunos/ })).toBeInTheDocument()
    expect(screen.getByText('A escola, ou parte dela, deixa de funcionar normalmente.')).toBeInTheDocument()
    expect(screen.queryByText(/Inaccesibilidad de alumnos/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Afecta al establecimiento/)).not.toBeInTheDocument()
  })

  it('mantiene las categorías en español cuando el idioma es es', () => {
    renderQuePaso('es')
    expect(screen.getByRole('radio', { name: /Afecta al establecimiento/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Inaccesibilidad de alumnos/ })).toBeInTheDocument()
    expect(screen.getByText('La escuela o parte de ella deja de funcionar con normalidad.')).toBeInTheDocument()
  })
})
