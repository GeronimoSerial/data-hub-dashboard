import { describe, expect, it } from 'vitest'
import { construirMatriculaNatalidad } from './matricula-natalidad'
import { resumirMatricula } from './diagnostico-matricula-natalidad'

const datos = construirMatriculaNatalidad([
  { cueAnexo: '1800746-00', departamento: 'Capital', nivel: 'Inicial', curso: 'Sala de 4', anio: 2025, matricula: 20, secciones: 2 },
  { cueAnexo: '1800746-00', departamento: 'Capital', nivel: 'Primario', curso: '1', anio: 2025, matricula: 30, secciones: 3 },
  { cueAnexo: '1800747-00', departamento: 'Capital', nivel: 'Inicial', curso: 'Sala de 4', anio: 2025, matricula: 10, secciones: 0 },
])

describe('resumen de matrícula observada', () => {
  it('suma alumnos y secciones del mismo nivel, incluyendo escuelas sin ubicación', () => {
    expect(resumirMatricula(datos, 2025, { nivel: 'Inicial' })).toMatchObject({ matricula: 30, secciones: 2, alumnosPorSeccion: 15 })
  })
  it('distingue ausencia y división por cero de un valor cero', () => {
    expect(resumirMatricula(datos, 2024)).toBeNull()
    expect(resumirMatricula(datos, 2025, { cueAnexo: '1800747-00' })?.alumnosPorSeccion).toBeNull()
  })
  it('conserva los agregados administrativos departamentales completos', () => {
    expect(resumirMatricula(datos, 2025, { departamento: 'CAPITAL' })).toMatchObject({ matricula: 60, secciones: 5, alumnosPorSeccion: 12 })
  })
})
