import { beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from '@/lib/http/log'
import type { EjecutorSql } from '@/lib/infraestructura/ge-db'
import { cargarCarrerasInstituto } from './instituto-ui-carga'

vi.mock('@/lib/http/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const CUE = '99887766'

interface Escenario {
  nivel?: string | null
  falla?: 'nivel' | 'corte' | 'carreras'
  corte?: number | null
}

// Cliente SQL de prueba: responde por fragmento de consulta, como las lecturas reales.
function clienteFalso({ nivel = 'Superior', falla, corte = 7 }: Escenario = {}): EjecutorSql {
  return {
    execute: async (consulta: unknown) => {
      const sql = typeof consulta === 'string' ? consulta : (consulta as { sql: string }).sql
      if (sql.includes('ge_escuela_nivel_jur')) {
        if (falla === 'nivel') throw new Error('nivel caído')
        return { rows: nivel === null ? [] : [{ id: 1, nombre: nivel, ciclo_lectivo: 2026 }] }
      }
      if (sql.includes('matricula_corte')) {
        if (falla === 'corte') throw new Error('corte caído')
        return { rows: corte === null ? [] : [{ id: corte }] }
      }
      if (sql.includes('matricula_carrera')) {
        if (falla === 'carreras') throw new Error('carreras caídas')
        return { rows: [{ id: 3, nombre: 'Enfermería', tipo: 'Tecnicatura', total: 40 }] }
      }
      throw new Error(`consulta inesperada: ${sql}`)
    },
  } as unknown as EjecutorSql
}

beforeEach(() => {
  vi.mocked(log.error).mockClear()
})

describe('cargarCarrerasInstituto', () => {
  it('usa el camino GE cuando el nivel no es Superior', async () => {
    const cliente = clienteFalso({ nivel: 'Primario' })
    expect(await cargarCarrerasInstituto(cliente, CUE)).toEqual({ tipo: 'ge' })
    expect(log.error).not.toHaveBeenCalled()
  })

  it('usa el camino GE cuando el CUE no tiene nivel cargado', async () => {
    expect(await cargarCarrerasInstituto(clienteFalso({ nivel: null }), CUE)).toEqual({ tipo: 'ge' })
  })

  it('usa el camino GE cuando no hay matrícula vigente', async () => {
    expect(await cargarCarrerasInstituto(clienteFalso({ corte: null }), CUE)).toEqual({ tipo: 'ge' })
  })

  it('devuelve las carreras del instituto con su total de alumnos', async () => {
    expect(await cargarCarrerasInstituto(clienteFalso(), CUE)).toEqual({
      tipo: 'instituto',
      carreras: [{ id: 3, nombre: 'Enfermería', tipo: 'Tecnicatura', totalAlumnos: 40 }],
    })
  })

  it('si falla la lectura del nivel, devuelve desconocido y registra sin el CUE', async () => {
    expect(await cargarCarrerasInstituto(clienteFalso({ falla: 'nivel' }), CUE)).toEqual({ tipo: 'desconocido' })
    expect(log.error).toHaveBeenCalledWith('parte.instituto.nivel_fallo', expect.any(Object))
    expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain(CUE)
  })

  it('si el nivel es Superior y la matrícula falla, devuelve error (no cae al padrón GE)', async () => {
    expect(await cargarCarrerasInstituto(clienteFalso({ falla: 'carreras' }), CUE)).toEqual({ tipo: 'error' })
    expect(log.error).toHaveBeenCalledWith('parte.instituto.carreras_fallo', expect.any(Object))
    expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain(CUE)
  })

  it('si falla la consulta del corte de matrícula con nivel Superior, devuelve error', async () => {
    expect(await cargarCarrerasInstituto(clienteFalso({ falla: 'corte' }), CUE)).toEqual({ tipo: 'error' })
  })
})
