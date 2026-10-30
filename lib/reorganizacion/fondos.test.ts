import { describe, expect, it } from 'vitest'
import { BASEMAPS } from '@/lib/map-types'
import {
  FONDO_POR_DEFECTO,
  FONDOS_PENDIENTES,
  FONDOS_REORGANIZACION,
  estiloDeFondo,
} from './fondos'

describe('FONDOS_REORGANIZACION', () => {
  it('lista exactamente los ids de BASEMAPS, en su orden', () => {
    expect(FONDOS_REORGANIZACION.map((fondo) => fondo.id)).toEqual(Object.keys(BASEMAPS))
  })

  it('reutiliza las etiquetas de BASEMAPS y tiene descripción no vacía', () => {
    for (const fondo of FONDOS_REORGANIZACION) {
      expect(fondo.etiqueta).toBe(BASEMAPS[fondo.id].label)
      expect(fondo.descripcion.trim().length).toBeGreaterThan(0)
    }
  })

  it('no incluye fondos pendientes', () => {
    const ids = FONDOS_REORGANIZACION.map((fondo) => fondo.id as string)
    for (const pendiente of FONDOS_PENDIENTES) {
      expect(ids).not.toContain(pendiente.id)
    }
  })
})

describe('FONDO_POR_DEFECTO', () => {
  it('es un fondo disponible y es el de natalidad', () => {
    expect(FONDOS_REORGANIZACION.map((fondo) => fondo.id)).toContain(FONDO_POR_DEFECTO)
    expect(FONDO_POR_DEFECTO).toBe('voyager')
  })
})

describe('FONDOS_PENDIENTES', () => {
  it('declara topográfico y satelital con motivo', () => {
    expect(FONDOS_PENDIENTES.map((pendiente) => pendiente.id)).toEqual(['topografico', 'satelital'])
    for (const pendiente of FONDOS_PENDIENTES) {
      expect(pendiente.motivo.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('estiloDeFondo', () => {
  it('devuelve la URL de estilo de BASEMAPS para un id disponible', () => {
    for (const fondo of FONDOS_REORGANIZACION) {
      expect(estiloDeFondo(fondo.id)).toBe(BASEMAPS[fondo.id].styleUrl)
    }
  })

  it('cae al fondo por defecto para ids pendientes o desconocidos', () => {
    const porDefecto = BASEMAPS[FONDO_POR_DEFECTO].styleUrl
    expect(estiloDeFondo('satelital')).toBe(porDefecto)
    expect(estiloDeFondo('topografico')).toBe(porDefecto)
    expect(estiloDeFondo('constructor')).toBe(porDefecto)
    expect(estiloDeFondo('')).toBe(porDefecto)
  })
})
