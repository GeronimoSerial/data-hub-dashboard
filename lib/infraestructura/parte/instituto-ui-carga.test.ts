import { beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from '@/lib/http/log'
import type { EjecutorSql } from '@/lib/infraestructura/ge-db'
import { cargarCarrerasInstituto } from './instituto-ui-carga'

vi.mock('@/lib/http/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const CUE = '99887766'

interface Escenario {
  carreras?: number
  falla?: 'deteccion' | 'carreras'
  corte?: number | null
}

// Cliente SQL de prueba: responde por fragmento de consulta, como las lecturas reales.
// La detección sólo mira el corte vigente y el conteo de carreras del CUE.
function clienteFalso({ carreras = 1, falla, corte = 7 }: Escenario = {}): EjecutorSql {
  return {
    execute: async (consulta: unknown) => {
      const sql = typeof consulta === 'string' ? consulta : (consulta as { sql: string }).sql
      if (sql.includes('matricula_corte')) {
        if (falla === 'deteccion') throw new Error('corte caído')
        return { rows: corte === null ? [] : [{ id: corte }] }
      }
      if (sql.includes('COUNT(*)')) {
        if (falla === 'deteccion') throw new Error('conteo caído')
        return { rows: [{ total: carreras }] }
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
  it('usa el camino GE cuando no hay matrícula vigente', async () => {
    expect(await cargarCarrerasInstituto(clienteFalso({ corte: null }), CUE)).toEqual({ tipo: 'ge' })
  })

  it('usa el camino GE cuando el CUE no tiene carreras en la matrícula vigente', async () => {
    expect(await cargarCarrerasInstituto(clienteFalso({ carreras: 0 }), CUE)).toEqual({ tipo: 'ge' })
    expect(log.error).not.toHaveBeenCalled()
  })

  it('usa el flujo de instituto para cualquier CUE con carreras vigentes, sin mirar su nivel', async () => {
    expect(await cargarCarrerasInstituto(clienteFalso({ carreras: 2 }), CUE)).toEqual({
      tipo: 'instituto',
      carreras: [{ id: 3, nombre: 'Enfermería', tipo: 'Tecnicatura', totalAlumnos: 40 }],
    })
  })

  it('si falla la detección por matrícula, devuelve desconocido (carga GE) y registra sin el CUE', async () => {
    expect(await cargarCarrerasInstituto(clienteFalso({ falla: 'deteccion' }), CUE)).toEqual({ tipo: 'desconocido' })
    expect(log.error).toHaveBeenCalledWith('parte.instituto.deteccion_fallo', expect.any(Object))
    expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain(CUE)
  })

  it('si el CUE tiene carreras y no se pueden listar, devuelve error', async () => {
    expect(await cargarCarrerasInstituto(clienteFalso({ falla: 'carreras' }), CUE)).toEqual({ tipo: 'error' })
    expect(log.error).toHaveBeenCalledWith('parte.instituto.carreras_fallo', expect.any(Object))
    expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain(CUE)
  })
})
