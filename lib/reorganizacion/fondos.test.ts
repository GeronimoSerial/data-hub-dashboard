import { describe, expect, it } from 'vitest'
import { BASEMAPS } from '@/lib/map-types'
import {
  FONDO_POR_DEFECTO,
  FONDOS_PENDIENTES,
  FONDOS_REORGANIZACION,
  ESTILO_SATELITAL,
  estiloDeFondo,
} from './fondos'

describe('FONDOS_REORGANIZACION', () => {
  it('lista los ids de BASEMAPS, en su orden, y después la vista satelital', () => {
    expect(FONDOS_REORGANIZACION.map((fondo) => fondo.id)).toEqual([...Object.keys(BASEMAPS), 'satelital'])
  })

  it('reutiliza las etiquetas de BASEMAPS y tiene descripción no vacía', () => {
    for (const fondo of FONDOS_REORGANIZACION) {
      if (fondo.id !== 'satelital') expect(fondo.etiqueta).toBe(BASEMAPS[fondo.id].label)
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
  it('declara solo el topográfico, con motivo', () => {
    expect(FONDOS_PENDIENTES.map((pendiente) => pendiente.id)).toEqual(['topografico'])
    for (const pendiente of FONDOS_PENDIENTES) {
      expect(pendiente.motivo.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('estiloDeFondo', () => {
  it('devuelve la URL de estilo de BASEMAPS para un id disponible', () => {
    for (const fondo of FONDOS_REORGANIZACION) {
      if (fondo.id !== 'satelital') expect(estiloDeFondo(fondo.id)).toBe(BASEMAPS[fondo.id].styleUrl)
    }
  })

  it('el satélite es un estilo raster de Esri con atribución y sin clave de API', () => {
    const estilo = estiloDeFondo('satelital')
    expect(typeof estilo).toBe('object')
    const fuente = (estilo as typeof ESTILO_SATELITAL).sources['esri-imagenes']
    expect(fuente).toMatchObject({ type: 'raster', maxzoom: 17 })
    expect(JSON.stringify(estilo)).toContain('World_Imagery')
    expect(JSON.stringify(estilo)).toMatch(/Esri/)
    expect(JSON.stringify(estilo)).not.toMatch(/key=|token=/i)
  })

  it('cae al fondo por defecto para ids pendientes o desconocidos', () => {
    const porDefecto = BASEMAPS[FONDO_POR_DEFECTO as keyof typeof BASEMAPS].styleUrl
    expect(estiloDeFondo('topografico')).toBe(porDefecto)
    expect(estiloDeFondo('constructor')).toBe(porDefecto)
    expect(estiloDeFondo('')).toBe(porDefecto)
  })
})
