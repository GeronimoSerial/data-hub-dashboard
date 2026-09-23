import { describe, expect, it } from 'vitest'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import {
  calcularOpacidadPulso,
  DURACION_PULSO_MS,
  esSeveridadPulsante,
  RADIO_DOT_BASE,
  radioMaximoPulso,
  rangoSeveridad,
} from './severidad-visual'

describe('esSeveridadPulsante', () => {
  it('sólo pulsa Alta y Crítica, en los nombres reales de SEVERIDADES', () => {
    expect(esSeveridadPulsante('Baja')).toBe(false)
    expect(esSeveridadPulsante('Media')).toBe(false)
    expect(esSeveridadPulsante('Alta')).toBe(true)
    expect(esSeveridadPulsante('Crítica')).toBe(true)
  })

  it('cubre las cuatro severidades del catálogo', () => {
    for (const severidad of SEVERIDADES) {
      expect(esSeveridadPulsante(severidad)).toBe(severidad === 'Alta' || severidad === 'Crítica')
    }
  })

  it('una severidad desconocida no pulsa', () => {
    // 'Critica' sin tilde no es el nombre real del catálogo (ver validacion.ts).
    expect(esSeveridadPulsante('Critica')).toBe(false)
    expect(esSeveridadPulsante('Desconocida')).toBe(false)
    expect(esSeveridadPulsante('')).toBe(false)
  })
})

describe('radioMaximoPulso', () => {
  it('Crítica pulsa más grande que Alta', () => {
    expect(radioMaximoPulso('Crítica')).toBeGreaterThan(radioMaximoPulso('Alta'))
  })

  it('Alta pulsa más grande que el radio base', () => {
    expect(radioMaximoPulso('Alta')).toBeGreaterThan(RADIO_DOT_BASE)
  })

  it('el resto queda en el radio base (sin pulso)', () => {
    for (const severidad of ['Baja', 'Media', 'Critica', 'Desconocida']) {
      expect(radioMaximoPulso(severidad)).toBe(RADIO_DOT_BASE)
    }
  })
})

describe('calcularOpacidadPulso', () => {
  it('va de ~0.5 en el punto recién pulsado a 0 en el máximo', () => {
    expect(calcularOpacidadPulso(0)).toBeCloseTo(0.5)
    expect(calcularOpacidadPulso(1)).toBe(0)
  })

  it('clampea progreso fuera de [0, 1]', () => {
    expect(calcularOpacidadPulso(-1)).toBeCloseTo(0.5)
    expect(calcularOpacidadPulso(2)).toBe(0)
  })
})

describe('DURACION_PULSO_MS', () => {
  it('es la constante de un ciclo usada por la animación', () => {
    expect(DURACION_PULSO_MS).toBe(1600)
  })
})

describe('rangoSeveridad', () => {
  it('mapea Baja a 0 y sube con el orden real de SEVERIDADES', () => {
    expect(rangoSeveridad('Baja')).toBe(0)
    expect(rangoSeveridad('Media')).toBe(1)
    expect(rangoSeveridad('Alta')).toBe(2)
  })

  it('mapea Crítica (con tilde, el nombre real del catálogo) a 3', () => {
    expect(rangoSeveridad('Crítica')).toBe(3)
  })

  it('una severidad desconocida cae a 0 (la más baja) en vez de fallar', () => {
    expect(rangoSeveridad('Desconocida')).toBe(0)
  })
})