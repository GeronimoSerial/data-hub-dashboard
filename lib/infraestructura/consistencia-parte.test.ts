import { describe, expect, it } from 'vitest'
import { MOTIVOS_SEED } from './motivos'
import {
  alcanceDeSecciones,
  bloqueoOpcion,
  evaluarConsistenciaParte,
  severidadSugeridaPorAlcance,
  type CampoConsistencia,
  type RespuestasConsistencia,
} from './consistencia-parte'

const AHORA = new Date(2026, 9, 17, 12, 0, 0)

const base: RespuestasConsistencia = {
  categoria: 'establecimiento',
  motivoId: 'tormenta-severa',
  severidad: 'Media',
  justificacionCritica: null,
  descripcion: '',
  alcance: { tipo: 'toda' },
  clases: 'normal',
  edificio: 'habitual',
  asistenciaBrinda: false,
  vigencia: { modo: 'ahora' },
}

function evaluar(cambios: Partial<RespuestasConsistencia>) {
  return evaluarConsistenciaParte({ ...base, ...cambios }, AHORA)
}

function codigos(reglas: { codigo: string }[]): string[] {
  return reglas.map((r) => r.codigo)
}

describe('evaluarConsistenciaParte: bloqueos', () => {
  const casosBloqueo: [string, Partial<RespuestasConsistencia>, string][] = [
    ['evacuación preventiva + edificio habitual', { motivoId: 'evacuacion-preventiva', edificio: 'habitual' }, 'evacuacion-preventiva-habitual'],
    ['evacuación preventiva + centro de evacuados', { motivoId: 'evacuacion-preventiva', edificio: 'centro_evacuados' }, 'evacuacion-preventiva-centro-evacuados'],
    ['inundación + centro de evacuados', { motivoId: 'inundacion', edificio: 'centro_evacuados' }, 'inundacion-centro-evacuados'],
    ['inaccesibilidad de docentes + evacuado', { motivoId: 'inaccesibilidad-docentes', edificio: 'evacuado' }, 'inaccesibilidad-docentes-evacuado'],
    ['edificio evacuado + clases normales', { edificio: 'evacuado', clases: 'normal' }, 'evacuado-clases-normales'],
  ]
  it.each(casosBloqueo)('bloquea %s', (_nombre, cambios, codigo) => {
    const r = evaluar(cambios)
    expect(codigos(r.bloqueos)).toContain(codigo)
  })

  it('bloquea "Otro" sin descripción en ambas categorías y lo señala en descripcion', () => {
    for (const motivoId of ['otro-establecimiento', 'otro-alumnos']) {
      const r = evaluar({ motivoId, descripcion: '   ' })
      expect(r.bloqueos).toEqual([
        expect.objectContaining({ codigo: 'otro-sin-descripcion', campo: 'descripcion' }),
      ])
    }
  })

  it('"Otro" con descripción no bloquea', () => {
    expect(evaluar({ motivoId: 'otro-alumnos', descripcion: 'Acceso cortado por obra' }).bloqueos).toEqual([])
  })

  it('no bloquea un motivo que no es Otro si la descripción está vacía', () => {
    expect(evaluar({ motivoId: 'inundacion', edificio: 'parcial', descripcion: '' }).bloqueos).toEqual([])
  })
})

describe('evaluarConsistenciaParte: advertencias', () => {
  const casosAdvertencia: [string, Partial<RespuestasConsistencia>, string, CampoConsistencia][] = [
    ['inundación + edificio habitual', { motivoId: 'inundacion', edificio: 'habitual' }, 'inundacion-habitual', 'edificio'],
    ['tormenta severa + centro de evacuados', { motivoId: 'tormenta-severa', edificio: 'centro_evacuados' }, 'tormenta-centro-evacuados', 'edificio'],
    ['sin energía o agua + evacuado', { motivoId: 'sin-energia-o-agua', edificio: 'evacuado', clases: 'suspendido' }, 'sin-energia-evacuado', 'edificio'],
    ['sin energía o agua + centro de evacuados', { motivoId: 'sin-energia-o-agua', edificio: 'centro_evacuados' }, 'sin-energia-centro-evacuados', 'edificio'],
    ['inaccesibilidad de docentes + parcial', { motivoId: 'inaccesibilidad-docentes', edificio: 'parcial' }, 'inaccesibilidad-docentes-parcial', 'edificio'],
    ['inaccesibilidad de docentes + centro de evacuados', { motivoId: 'inaccesibilidad-docentes', edificio: 'centro_evacuados' }, 'inaccesibilidad-docentes-centro-evacuados', 'edificio'],
    ['edificio habitual + clases suspendidas', { edificio: 'habitual', clases: 'suspendido' }, 'habitual-clases-suspendidas', 'clases'],
    ['centro de evacuados + clases normales', { edificio: 'centro_evacuados', clases: 'normal' }, 'centro-clases-normales', 'clases'],
    ['clases normales + asistencia pedagógica sí', { clases: 'normal', asistenciaBrinda: true }, 'clases-normales-con-asistencia', 'asistencia'],
    ['evacuación preventiva + severidad Baja', { motivoId: 'evacuacion-preventiva', edificio: 'parcial', severidad: 'Baja' }, 'evacuacion-severidad-baja', 'severidad'],
    ['inundación + edificio parcial + clases normales', { motivoId: 'inundacion', edificio: 'parcial', clases: 'normal' }, 'inundacion-parcial-clases-normales', 'clases'],
  ]
  it.each(casosAdvertencia)('advierte %s', (_nombre, cambios, codigo, campo) => {
    const r = evaluar(cambios)
    expect(r.bloqueos).toEqual([])
    expect(r.advertencias).toContainEqual(expect.objectContaining({ codigo, campo }))
  })

  it('advierte crítica con alcance de una sola sección', () => {
    const r = evaluar({ severidad: 'Crítica', justificacionCritica: 'riesgo_fisico', alcance: { tipo: 'algunas', secciones: 1 } })
    expect(codigos(r.advertencias)).toContain('critica-seccion-unica')
  })

  it('advierte justificación "más personas" con una sola sección', () => {
    const r = evaluar({ severidad: 'Crítica', justificacionCritica: 'mas_personas', alcance: { tipo: 'algunas', secciones: 1 } })
    expect(codigos(r.advertencias)).toContain('mas-personas-seccion-unica')
  })

  it('advierte "se prolonga" con vigencia "ahora"', () => {
    const r = evaluar({ severidad: 'Crítica', justificacionCritica: 'se_prolonga', vigencia: { modo: 'ahora' } })
    expect(codigos(r.advertencias)).toContain('se-prolonga-ahora')
  })

  it('advierte evacuación preventiva con inicio de más de 7 días', () => {
    const r = evaluar({
      motivoId: 'evacuacion-preventiva',
      edificio: 'parcial',
      vigencia: { modo: 'otro', fecha: '2026-10-08', hora: '10:00' },
    })
    expect(codigos(r.advertencias)).toContain('evacuacion-vigencia-antigua')
  })

  it('no advierte evacuación preventiva con inicio dentro de los 7 días', () => {
    const r = evaluar({
      motivoId: 'evacuacion-preventiva',
      edificio: 'parcial',
      vigencia: { modo: 'otro', fecha: '2026-10-11', hora: '10:00' },
    })
    expect(codigos(r.advertencias)).not.toContain('evacuacion-vigencia-antigua')
  })
})

describe('evaluarConsistenciaParte: combinaciones explícitamente permitidas', () => {
  it('evacuación preventiva + edificio parcial no genera bloqueos ni advertencias de estado', () => {
    const r = evaluar({ motivoId: 'evacuacion-preventiva', edificio: 'parcial', clases: 'suspendido', severidad: 'Crítica', justificacionCritica: null })
    expect(r.bloqueos).toEqual([])
    expect(codigos(r.advertencias)).not.toContain('evacuacion-severidad-baja')
    expect(codigos(r.advertencias)).not.toContain('habitual-clases-suspendidas')
  })

  it('sin energía o agua + clases suspendidas con asistencia (clase virtual) no advierte', () => {
    const r = evaluar({ motivoId: 'sin-energia-o-agua', edificio: 'parcial', clases: 'suspendido', asistenciaBrinda: true })
    expect(r.bloqueos).toEqual([])
    expect(r.advertencias).toEqual([])
  })

  it('combinación sin reglas aplicables no produce nada', () => {
    expect(evaluar({})).toEqual({ bloqueos: [], advertencias: [] })
  })
})

describe('bloqueoOpcion', () => {
  it('bloquea la opción de edificio que produce un bloqueo con las respuestas actuales', () => {
    const respuestas = { ...base, motivoId: 'evacuacion-preventiva', edificio: null }
    expect(bloqueoOpcion(respuestas, 'edificio', 'habitual', AHORA)?.codigo).toBe('evacuacion-preventiva-habitual')
    expect(bloqueoOpcion(respuestas, 'edificio', 'centro_evacuados', AHORA)?.codigo).toBe('evacuacion-preventiva-centro-evacuados')
    expect(bloqueoOpcion(respuestas, 'edificio', 'parcial', AHORA)).toBeNull()
  })

  it('bloquea la opción de motivo que produce un bloqueo con el edificio actual', () => {
    const respuestas = { ...base, motivoId: null, edificio: 'evacuado' as const }
    expect(bloqueoOpcion(respuestas, 'motivo', 'inaccesibilidad-docentes', AHORA)?.codigo).toBe('inaccesibilidad-docentes-evacuado')
    expect(bloqueoOpcion(respuestas, 'motivo', 'tormenta-severa', AHORA)).toBeNull()
  })

  it('bloquea la opción de clases normales con edificio evacuado', () => {
    const respuestas = { ...base, edificio: 'evacuado' as const, clases: null }
    expect(bloqueoOpcion(respuestas, 'clases', 'normal', AHORA)?.codigo).toBe('evacuado-clases-normales')
    expect(bloqueoOpcion(respuestas, 'clases', 'suspendido', AHORA)).toBeNull()
  })

  it('"Otro" nunca queda bloqueado por falta de descripción', () => {
    const respuestas = { ...base, motivoId: null, descripcion: '' }
    expect(bloqueoOpcion(respuestas, 'motivo', 'otro-alumnos', AHORA)).toBeNull()
  })

  it('no reporta como bloqueo de la opción un bloqueo que ya existía con las respuestas actuales', () => {
    const respuestas = { ...base, edificio: 'evacuado' as const, clases: 'normal' as const }
    expect(bloqueoOpcion(respuestas, 'motivo', 'tormenta-severa', AHORA)).toBeNull()
  })
})

describe('alcanceDeSecciones', () => {
  it('es toda la escuela sólo cuando las secciones elegidas cubren todas las del CUE', () => {
    expect(alcanceDeSecciones([10, 20], [10, 20])).toEqual({ tipo: 'toda' })
    expect(alcanceDeSecciones([20, 10], [10, 20])).toEqual({ tipo: 'toda' })
    expect(alcanceDeSecciones([10], [10, 20])).toEqual({ tipo: 'algunas', secciones: 1 })
  })

  it('sin secciones elegidas no hay alcance', () => {
    expect(alcanceDeSecciones([], [10, 20])).toBeNull()
  })
})

describe('severidadSugeridaPorAlcance', () => {
  it('sube un nivel cuando el alcance es toda la escuela, sin pasar de Crítica', () => {
    expect(severidadSugeridaPorAlcance('sin-energia-o-agua', { tipo: 'toda' })).toBe('Alta')
    expect(severidadSugeridaPorAlcance('acceso-interrumpido', { tipo: 'toda' })).toBe('Crítica')
    expect(severidadSugeridaPorAlcance('inundacion', { tipo: 'toda' })).toBe('Crítica')
  })

  it('devuelve la sugerida sin subir cuando el alcance son algunas secciones', () => {
    expect(severidadSugeridaPorAlcance('sin-energia-o-agua', { tipo: 'algunas', secciones: 2 })).toBe('Media')
    expect(severidadSugeridaPorAlcance('acceso-interrumpido', null)).toBe('Alta')
  })

  it('devuelve null cuando el motivo no tiene sugerencia o es Otro', () => {
    expect(severidadSugeridaPorAlcance('otro-establecimiento', { tipo: 'toda' })).toBeNull()
    expect(severidadSugeridaPorAlcance('otro-alumnos', null)).toBeNull()
    expect(severidadSugeridaPorAlcance(null, { tipo: 'toda' })).toBeNull()
  })

  it('coincide con las severidades sugeridas de la semilla de motivos', () => {
    for (const motivo of MOTIVOS_SEED) {
      expect(severidadSugeridaPorAlcance(motivo.id, null)).toBe(motivo.severidadSugerida ?? null)
    }
  })
})

describe('advertencias accionables (T10)', () => {
  it('cada advertencia con un cambio claro ofrece el valor que la resuelve', () => {
    const inundacion = evaluar({ motivoId: 'inundacion', edificio: 'habitual', clases: 'normal' }).advertencias
    expect(inundacion.find((a) => a.codigo === 'inundacion-habitual')?.sugerencia).toEqual({
      campo: 'edificio',
      valor: 'parcial',
      etiqueta: 'Cambiar a Uso parcial',
    })
    const suspendidas = evaluar({ edificio: 'habitual', clases: 'suspendido', motivoId: 'inundacion' }).advertencias
    expect(suspendidas.find((a) => a.codigo === 'habitual-clases-suspendidas')?.sugerencia).toEqual({
      campo: 'clases',
      valor: 'normal',
      etiqueta: 'Cambiar a Clases normales',
    })
  })

  it('sin energía o agua con el edificio sin clases y clases suspendidas es consistente', () => {
    const r = evaluar({ motivoId: 'sin-energia-o-agua', edificio: 'sin_clases', clases: 'suspendido' })
    expect(r.bloqueos.filter((b) => b.campo === 'edificio' || b.campo === 'clases')).toEqual([])
    expect(r.advertencias.filter((a) => a.campo === 'edificio' || a.campo === 'clases')).toEqual([])
  })

  it('sin energía o agua con clases suspendidas sugiere el edificio sin clases', () => {
    const SIN_CLASES = { campo: 'edificio', valor: 'sin_clases', etiqueta: 'Cambiar a Sin clases' }
    const habitual = evaluar({ motivoId: 'sin-energia-o-agua', edificio: 'habitual', clases: 'suspendido' }).advertencias
    expect(habitual.find((a) => a.codigo === 'habitual-clases-suspendidas')?.sugerencia).toEqual(SIN_CLASES)
    const evacuado = evaluar({ motivoId: 'sin-energia-o-agua', edificio: 'evacuado', clases: 'suspendido' }).advertencias
    expect(evacuado.find((a) => a.codigo === 'sin-energia-evacuado')?.sugerencia).toEqual(SIN_CLASES)
  })

  it('el edificio sin clases con clases normales advierte y sugiere suspenderlas', () => {
    const r = evaluar({ edificio: 'sin_clases', clases: 'normal' }).advertencias
    expect(r.find((a) => a.codigo === 'sin-clases-clases-normales')?.sugerencia).toEqual({
      campo: 'clases',
      valor: 'suspendido',
      etiqueta: 'Cambiar a Clases suspendidas',
    })
  })

  it('una advertencia sin cambio claro no ofrece sugerencia', () => {
    const critica = evaluar({ severidad: 'Crítica', alcance: { tipo: 'algunas', secciones: 1 } }).advertencias
    expect(critica.find((a) => a.codigo === 'critica-seccion-unica')?.sugerencia).toBeUndefined()
  })

  it('la firma de una advertencia sólo cambia con las respuestas que la regla lee', () => {
    const firma = (cambios: Partial<RespuestasConsistencia>) =>
      evaluar({ motivoId: 'inundacion', edificio: 'habitual', ...cambios }).advertencias.find((r) => r.codigo === 'inundacion-habitual')?.firma

    const original = firma({})
    expect(original).toBeTruthy()
    expect(firma({ clases: 'suspendido' })).toBe(original)
    expect(firma({ asistenciaBrinda: true })).toBe(original)
    expect(firma({ vigencia: { modo: 'ahora' } })).toBe(original)
    expect(firma({ motivoId: 'tormenta-severa' })).toBeUndefined()
  })
})
