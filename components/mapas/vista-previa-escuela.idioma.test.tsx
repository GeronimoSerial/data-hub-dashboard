// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { VistaPreviaEscuela } from './vista-previa-escuela'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'

function escuelaSinUbicacion(): EscuelaMapaEnriquecida & { ubicacionDisponible: boolean } {
  return {
    cueAnexo: '1800123-00',
    nombre: 'Escuela N° 42 Belgrano',
    departamento: 'CAPITAL',
    localidad: 'Corrientes',
    lat: -27.47,
    lon: -58.83,
    niveles: ['Primaria'],
    alumnos: 310,
    gravedad: 0 as const,
    categoriaPrincipal: null,
    clases: 'normal' as const,
    apoyo: null,
    sinActualizar: false,
    ultimaNovedad: null,
    alumnosSinClases: 0,
    situacionesHistoricas: 0,
    solucionadasRecientes: 0,
    ubicacionDisponible: false,
  }
}

function renderizar(idioma: 'es' | 'pt') {
  return render(
    <IdiomaProvider idioma={idioma}>
      <VistaPreviaEscuela
        escuela={escuelaSinUbicacion()}
        urlFichaCompleta="/ficha"
        onCerrarVistaPrevia={vi.fn()}
        onQuitarSeleccion={vi.fn()}
      />
    </IdiomaProvider>,
  )
}

describe('VistaPreviaEscuela · idioma', () => {
  it('mantiene en español los textos de la tarjeta', () => {
    renderizar('es')

    expect(screen.getByRole('button', { name: 'Cerrar vista previa' })).toBeInTheDocument()
    expect(screen.getByText('Ubicación no disponible en el mapa')).toBeVisible()
    expect(screen.getByText('Sin reporte activo (la ausencia de reporte no confirma normalidad)')).toBeVisible()
    expect(screen.getByText('Sin situaciones históricas')).toBeVisible()
    expect(screen.getByText('Funcionamiento')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Abrir ficha completa' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Quitar selección' })).toBeVisible()
  })

  it('muestra los textos de la tarjeta en portugués de Brasil', () => {
    renderizar('pt')

    expect(screen.getByRole('button', { name: 'Fechar pré-visualização' })).toBeInTheDocument()
    expect(screen.getByText('Localização não disponível no mapa')).toBeVisible()
    expect(screen.getByText('Sem registro ativo (a ausência de registro não confirma normalidade)')).toBeVisible()
    expect(screen.getByText('Sem ocorrências históricas')).toBeVisible()
    expect(screen.getByText('Operação')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ver ficha completa' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Remover seleção' })).toBeVisible()
  })
})
