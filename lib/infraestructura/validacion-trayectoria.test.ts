import { describe, expect, it } from 'vitest'
import {
  afectacionModificacionInputSchema,
  afectacionNuevaInputSchema,
  estadoEstablecimientoInputSchema,
  parseParteActualizacionInput,
  servicioAlcanceInputSchema,
  servicioEducativoInputSchema,
} from './validacion-trayectoria'

const RIGE_DESDE = '2026-09-18T10:30:00.000Z'

const baseAfectacionNueva = {
  motivo: 'Inundación',
  severidad: 'Alta',
  secciones: [10, 20],
}

const basePayload = {
  cue: '1801605-04',
  idempotencyKey: 'k-1',
  rigeDesde: RIGE_DESDE,
  afectacionesNuevas: [baseAfectacionNueva],
}

describe('afectacionNuevaInputSchema', () => {
  it('acepta un cuerpo válido sin categoria', () => {
    const result = afectacionNuevaInputSchema.safeParse(baseAfectacionNueva)
    expect(result.success).toBe(true)
  })

  it('rechaza un campo categoria enviado por el cliente (se ignora, no rompe, pero no se usa)', () => {
    // Zod por defecto elimina claves no declaradas al parsear un object() no
    // strict; lo relevante es que el tipo resultante NUNCA expone categoria.
    const result = afectacionNuevaInputSchema.safeParse({ ...baseAfectacionNueva, categoria: 'alumnos' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('categoria' in result.data).toBe(false)
    }
  })

  it('rechaza secciones vacías', () => {
    expect(afectacionNuevaInputSchema.safeParse({ ...baseAfectacionNueva, secciones: [] }).success).toBe(false)
  })

  it('rechaza severidad fuera de catálogo', () => {
    expect(
      afectacionNuevaInputSchema.safeParse({ ...baseAfectacionNueva, severidad: 'Extrema' }).success,
    ).toBe(false)
  })

  it('rechaza descripción con HTML', () => {
    expect(
      afectacionNuevaInputSchema.safeParse({ ...baseAfectacionNueva, descripcion: '<b>hola</b>' }).success,
    ).toBe(false)
  })
})

describe('afectacionModificacionInputSchema', () => {
  it('acepta sólo id (ningún otro campo obligatorio)', () => {
    expect(afectacionModificacionInputSchema.safeParse({ id: 'af-1' }).success).toBe(true)
  })

  it('acepta cambiar sólo la severidad', () => {
    const result = afectacionModificacionInputSchema.safeParse({ id: 'af-1', severidad: 'Crítica' })
    expect(result.success).toBe(true)
  })

  it('rechaza sin id', () => {
    expect(afectacionModificacionInputSchema.safeParse({ severidad: 'Alta' }).success).toBe(false)
  })
})

describe('servicioAlcanceInputSchema', () => {
  it('acepta establecimiento sin campos adicionales', () => {
    expect(servicioAlcanceInputSchema.safeParse({ tipo: 'establecimiento' }).success).toBe(true)
  })

  it('acepta turnos', () => {
    expect(servicioAlcanceInputSchema.safeParse({ tipo: 'turno', turnos: ['Mañana'] }).success).toBe(true)
  })

  it('rechaza turno sin turnos', () => {
    expect(servicioAlcanceInputSchema.safeParse({ tipo: 'turno', turnos: [] }).success).toBe(false)
  })

  it('acepta secciones', () => {
    expect(servicioAlcanceInputSchema.safeParse({ tipo: 'seccion', secciones: [1, 2] }).success).toBe(true)
  })

  it('rechaza un tipo desconocido', () => {
    expect(servicioAlcanceInputSchema.safeParse({ tipo: 'sucursal' }).success).toBe(false)
  })
})

describe('servicioEducativoInputSchema', () => {
  it('acepta clases suspendidas con alcance de sección', () => {
    const result = servicioEducativoInputSchema.safeParse({
      estado: 'suspendido',
      alcance: { tipo: 'seccion', secciones: [10] },
    })
    expect(result.success).toBe(true)
  })

  it('rechaza un estado fuera de las dos opciones de carga (spec §3.4)', () => {
    const result = servicioEducativoInputSchema.safeParse({
      estado: 'parcial',
      alcance: { tipo: 'establecimiento' },
    })
    expect(result.success).toBe(false)
  })
})

describe('estadoEstablecimientoInputSchema', () => {
  it('acepta los tres estados de la spec §11', () => {
    for (const estado of ['habitual', 'evacuado', 'centro_evacuados']) {
      expect(estadoEstablecimientoInputSchema.safeParse({ estado }).success).toBe(true)
    }
  })

  it('rechaza un estado fuera de catálogo', () => {
    expect(estadoEstablecimientoInputSchema.safeParse({ estado: 'clausurado' }).success).toBe(false)
  })
})

describe('parseParteActualizacionInput', () => {
  it('acepta un reporte inicial válido', () => {
    const result = parseParteActualizacionInput(basePayload)
    expect(result.ok).toBe(true)
  })

  it('rechaza un CUE inválido', () => {
    const result = parseParteActualizacionInput({ ...basePayload, cue: 'no-es-un-cue' })
    expect(result.ok).toBe(false)
  })

  it('rechaza sin idempotencyKey', () => {
    const { idempotencyKey: _idempotencyKey, ...rest } = basePayload
    const result = parseParteActualizacionInput(rest)
    expect(result.ok).toBe(false)
  })

  it('rechaza rigeDesde con formato inválido', () => {
    const result = parseParteActualizacionInput({ ...basePayload, rigeDesde: '18/09/2026' })
    expect(result.ok).toBe(false)
  })

  it('rechaza un envío sin ningún cambio (spec §17 "Todavía no realizó cambios")', () => {
    const result = parseParteActualizacionInput({
      cue: '1801605-04',
      idempotencyKey: 'k-1',
      rigeDesde: RIGE_DESDE,
    })
    expect(result.ok).toBe(false)
  })

  it('acepta un envío que sólo cambia el servicio educativo', () => {
    const result = parseParteActualizacionInput({
      cue: '1801605-04',
      idempotencyKey: 'k-1',
      rigeDesde: RIGE_DESDE,
      servicioEducativo: { estado: 'suspendido', alcance: { tipo: 'seccion', secciones: [10] } },
    })
    expect(result.ok).toBe(true)
  })

  it('acepta un envío que sólo retira una afectación existente', () => {
    const result = parseParteActualizacionInput({
      cue: '1801605-04',
      idempotencyKey: 'k-1',
      rigeDesde: RIGE_DESDE,
      afectacionesRetiradas: ['af-1'],
    })
    expect(result.ok).toBe(true)
  })

  it('acepta un envío que sólo modifica una afectación existente', () => {
    const result = parseParteActualizacionInput({
      cue: '1801605-04',
      idempotencyKey: 'k-1',
      rigeDesde: RIGE_DESDE,
      afectacionesModificadas: [{ id: 'af-1', severidad: 'Crítica' }],
    })
    expect(result.ok).toBe(true)
  })

  it('acepta un envío que sólo cambia la situación del establecimiento', () => {
    const result = parseParteActualizacionInput({
      cue: '1801605-04',
      idempotencyKey: 'k-1',
      rigeDesde: RIGE_DESDE,
      estadoEstablecimiento: { estado: 'evacuado' },
    })
    expect(result.ok).toBe(true)
  })
})
