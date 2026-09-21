import { describe, expect, it } from 'vitest'
import { calcularEstadoServicioGeneral } from './servicio-educativo'
import type { SeccionEstablecimiento, ServicioAlcance } from './trayectoria-tipos'

// Prueba adversarial: dos filas VIGENTES (ya filtradas por el llamador) pueden
// competir por la misma sección con el mismo geSectionId. calcularEstadoServicioGeneral
// ahora desempata de forma DETERMINISTA (creadaEn más reciente, luego id mayor)
// en vez de "última fila del array gana". Estos tests confirman que el
// resultado ya NO depende del orden del array.

const FILA_NORMAL: ServicioAlcance = {
  id: 'a',
  parteId: 'p',
  tipo: 'seccion',
  referenciaId: '1',
  estado: 'normal',
  rigeDesde: '2026-09-18T09:00:00.000Z',
  creadaEn: '2026-09-18T09:00:00.000Z',
  retiradaEn: null,
}

const FILA_SUSPENDIDA: ServicioAlcance = {
  id: 'b',
  parteId: 'p',
  tipo: 'seccion',
  referenciaId: '1',
  estado: 'suspendido',
  rigeDesde: '2026-09-18T09:00:00.000Z',
  creadaEn: '2026-09-18T09:00:00.000Z',
  retiradaEn: null,
}

const secciones: SeccionEstablecimiento[] = [{ geSectionId: 1, turno: 'Mañana' }]

describe('calcularEstadoServicioGeneral - filas en conflicto para la misma seccion (desempate deterministico)', () => {
  it('con creadaEn empatado, el resultado es el mismo sin importar el orden del array (gana id mayor: b > a, suspendido)', () => {
    const alcanceOrdenA: ServicioAlcance[] = [FILA_NORMAL, FILA_SUSPENDIDA]
    const alcanceOrdenB: ServicioAlcance[] = [FILA_SUSPENDIDA, FILA_NORMAL]
    const resultadoOrdenA = calcularEstadoServicioGeneral(alcanceOrdenA, secciones)
    const resultadoOrdenB = calcularEstadoServicioGeneral(alcanceOrdenB, secciones)
    expect(resultadoOrdenA).toBe('suspendido')
    expect(resultadoOrdenB).toBe('suspendido')
    expect(resultadoOrdenA).toBe(resultadoOrdenB)
  })

  it('con creadaEn distinto, gana la fila mas reciente sin importar el orden del array', () => {
    const filaVieja: ServicioAlcance = { ...FILA_SUSPENDIDA, id: 'z', creadaEn: '2026-09-18T09:00:00.000Z' }
    const filaNueva: ServicioAlcance = { ...FILA_NORMAL, id: 'a', creadaEn: '2026-09-18T10:00:00.000Z' }
    const resultadoOrdenA = calcularEstadoServicioGeneral([filaVieja, filaNueva], secciones)
    const resultadoOrdenB = calcularEstadoServicioGeneral([filaNueva, filaVieja], secciones)
    expect(resultadoOrdenA).toBe('normal')
    expect(resultadoOrdenB).toBe('normal')
    expect(resultadoOrdenA).toBe(resultadoOrdenB)
  })
})