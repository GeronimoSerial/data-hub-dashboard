import { describe, it, expect } from 'vitest'
import { textos } from '@/lib/i18n'
import { armarResumen, describirAlcanceServicio } from './reporte-inicial-resumen'

const base = {
  afectacion: {
    motivo: 'Inundación',
    severidad: 'Alta',
    secciones: 2,
    alumnos: 53,
    descripcion: '',
  },
  servicio: { estado: 'suspendido' as const, alcanceTipo: 'seccion' as const, turnos: [], secciones: 2 },
  estadoEstablecimiento: 'evacuado' as const,
  rigeDesde: '2026-09-18T13:30:00.000Z',
}

describe('armarResumen · idioma', () => {
  it('rotula el resumen en portugués de Brasil', () => {
    const lineas = armarResumen(base, textos('pt'))

    expect(lineas.map((fila) => fila.etiqueta)).toEqual(['Situação', 'Afeta', 'Aulas', 'Edifício', 'Desde'])
    expect(lineas.find((fila) => fila.etiqueta === 'Aulas')?.valor).toBe('Suspensas em 2 seções')
  })

  it('mantiene el resumen en español de Corrientes', () => {
    const lineas = armarResumen(base, textos('es'))

    expect(lineas.map((fila) => fila.etiqueta)).toEqual(['Situación', 'Afecta a', 'Clases', 'Edificio', 'Desde'])
    expect(lineas.find((fila) => fila.etiqueta === 'Clases')?.valor).toBe('Suspendidas en 2 secciones')
  })

  it('describe el alcance de un servicio interrumpido sin alcance en portugués', () => {
    expect(
      describirAlcanceServicio({ estado: 'suspendido', alcanceTipo: 'turno', turnos: [], secciones: 0 }, textos('pt')),
    ).toBe('Funcionamento interrompido, sem alcance indicado')
  })
})
