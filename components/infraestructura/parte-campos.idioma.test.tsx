// @vitest-environment jsdom
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { CampoVigente } from './campo-vigente'
import { CampoGravedad, type ValorGravedad } from './campo-gravedad'
import { CamposClasesEdificio } from './campos-clases-edificio'
import { InstitutoCamposAQuienAfecta } from './instituto-alcance-campos'
import { CamposAQuienAfecta, CamposQuePaso, crearAfectacionVacia } from './afectacion-campos'
import type { CarreraElegible } from '@/lib/infraestructura/parte/instituto-ui'

const valorGravedadVacio: ValorGravedad = { severidad: '', justificacionCritica: '', justificacionCriticaDetalle: '' }
const carreras: CarreraElegible[] = [{ id: 1, nombre: 'Enfermería', tipo: 'Tecnicatura', totalAlumnos: 40 }]

function enIdioma(idioma: 'es' | 'pt', ui: ReactElement) {
  return render(<IdiomaProvider idioma={idioma}>{ui}</IdiomaProvider>)
}

describe('partes de campos · idioma', () => {
  afterEach(cleanup)

  it('muestra el valor vigente con sus acciones en español', () => {
    enIdioma('es', <CampoVigente etiqueta="Estado" valorVigente="Normal" valorNuevo="Suspendido" onDejarComoEsta={() => {}}><p>hijo</p></CampoVigente>)
    expect(screen.getByText('Va a quedar: Suspendido')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeInTheDocument()
  })

  it('muestra el valor vigente con sus acciones en portugués de Brasil', () => {
    enIdioma('pt', <CampoVigente etiqueta="Estado" valorVigente="Normal" valorNuevo="Suspendido" onDejarComoEsta={() => {}}><p>hijo</p></CampoVigente>)
    expect(screen.getByText('Vai ficar: Suspendido')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alterar' })).toBeInTheDocument()
  })

  it('pregunta por la gravedad en español y en portugués', () => {
    const { unmount } = enIdioma('es', <CampoGravedad idPrefijo="g" categoria="establecimiento" sugerida={null} valor={valorGravedadVacio} onCambiar={() => {}} />)
    expect(screen.getByText('¿Qué tan grave es?')).toBeInTheDocument()
    unmount()
    enIdioma('pt', <CampoGravedad idPrefijo="g" categoria="establecimiento" sugerida={null} valor={valorGravedadVacio} onCambiar={() => {}} />)
    expect(screen.getByText('Quão grave é?')).toBeInTheDocument()
  })

  it('rotula el servicio y el edificio en español', () => {
    enIdioma('es', <CamposClasesEdificio valor={{ servicioEstado: '', estadoEstablecimiento: 'evacuado' }} onCambiar={() => {}} alcanceParcial={false} onInterrumpirTodaLaEscuela={() => {}} />)
    expect(screen.getByText('¿Hay clases?')).toBeInTheDocument()
    expect(screen.getByText('¿Cómo está el edificio?')).toBeInTheDocument()
    expect(screen.getByText('El edificio está evacuado')).toBeInTheDocument()
  })

  it('rotula el servicio y el edificio en portugués de Brasil', () => {
    enIdioma('pt', <CamposClasesEdificio valor={{ servicioEstado: '', estadoEstablecimiento: 'evacuado' }} onCambiar={() => {}} alcanceParcial={false} onInterrumpirTodaLaEscuela={() => {}} />)
    expect(screen.getByText('Há aulas?')).toBeInTheDocument()
    expect(screen.getByText('Como está o prédio?')).toBeInTheDocument()
    expect(screen.getByText('O prédio está evacuado')).toBeInTheDocument()
  })

  it('muestra el buscador de carreras e alumnos del instituto en español', () => {
    enIdioma('es', <InstitutoCamposAQuienAfecta cue="1" idPrefijo="i" borrador={crearAfectacionVacia('a')} carreras={carreras} onChange={() => {}} />)
    expect(screen.getByText('Carreras afectadas')).toBeInTheDocument()
    expect(screen.getByText('Ninguna carrera seleccionada')).toBeInTheDocument()
    expect(screen.getByText('Elija primero una carrera para buscar alumnos.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo')).toBeInTheDocument()
    expect(screen.getByText('Descripción (opcional)')).toBeInTheDocument()
  })

  it('muestra el buscador de carreras e alumnos del instituto en portugués de Brasil', () => {
    enIdioma('pt', <InstitutoCamposAQuienAfecta cue="1" idPrefijo="i" borrador={crearAfectacionVacia('a')} carreras={carreras} onChange={() => {}} />)
    expect(screen.getByText('Cursos afetados')).toBeInTheDocument()
    expect(screen.getByText('Nenhum curso selecionado')).toBeInTheDocument()
    expect(screen.getByText('Escolha primeiro um curso para buscar alunos.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Buscar por sobrenome, nome ou DNI completo')).toBeInTheDocument()
    expect(screen.getByText('Descrição (opcional)')).toBeInTheDocument()
  })

  it('pregunta el tipo de situación y el motivo en español y en portugués', () => {
    const { unmount } = enIdioma('es', <CamposQuePaso borrador={crearAfectacionVacia('a')} idPrefijo="q" motivos={[]} otrasAfectaciones={[]} onChange={() => {}} />)
    expect(screen.getByText('¿Qué tipo de situación es?')).toBeInTheDocument()
    expect(screen.getByText('¿Cuál es el motivo?')).toBeInTheDocument()
    expect(screen.getByText('Elija primero el tipo de situación.')).toBeInTheDocument()
    unmount()
    enIdioma('pt', <CamposQuePaso borrador={crearAfectacionVacia('a')} idPrefijo="q" motivos={[]} otrasAfectaciones={[]} onChange={() => {}} />)
    expect(screen.getByText('Qual é o tipo de situação?')).toBeInTheDocument()
    expect(screen.getByText('Qual é o motivo?')).toBeInTheDocument()
    expect(screen.getByText('Escolha primeiro o tipo de situação.')).toBeInTheDocument()
  })

  it('muestra el alcance de la escuela en español y en portugués de Brasil', () => {
    const { unmount } = enIdioma('es', <CamposAQuienAfecta borrador={{ ...crearAfectacionVacia('a'), categoria: 'establecimiento' }} idPrefijo="a" turnos={[]} onChange={() => {}} />)
    expect(screen.getByText('Secciones afectadas')).toBeInTheDocument()
    expect(screen.getByText('Ninguna sección seleccionada')).toBeInTheDocument()
    expect(screen.getByText('Descripción (opcional)')).toBeInTheDocument()
    unmount()
    enIdioma('pt', <CamposAQuienAfecta borrador={{ ...crearAfectacionVacia('a'), categoria: 'establecimiento' }} idPrefijo="a" turnos={[]} onChange={() => {}} />)
    expect(screen.getByText('Seções afetadas')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma seção selecionada')).toBeInTheDocument()
    expect(screen.getByText('Descrição (opcional)')).toBeInTheDocument()
  })
})
