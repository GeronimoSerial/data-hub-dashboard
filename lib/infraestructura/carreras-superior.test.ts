import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import catalogo from '@/data/carreras-superior-2026.json'
import {
  carrerasDelCue,
  esCueSuperior,
  validarAlcanceCarreras,
  validarCarrerasDeServicio,
} from './carreras-superior'

const entradas = Object.entries(catalogo)
const [cue, carreras] = entradas[0]
const cueAjeno = entradas.find(([otroCue]) => otroCue !== cue)?.[0] ?? ''

describe('catálogo de carreras Superior', () => {
  it('carga el catálogo desde Node sin el empaquetador de Next ni Vitest', () => {
    const script = `
      import { registerTsResolver } from './scripts/lib/register-ts-resolver.mjs'
      registerTsResolver(process.cwd())
      const { carrerasDelCue } = await import('./lib/infraestructura/carreras-superior.ts')
      process.stdout.write(JSON.stringify(carrerasDelCue(${JSON.stringify(cue)})))
    `
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
    expect(JSON.parse(result)).toEqual(carreras)
  })

  it('contiene las 82 instituciones y 409 relaciones CUE-carrera del workbook', () => {
    expect(entradas).toHaveLength(82)
    expect(entradas.reduce((total, [, opciones]) => total + opciones.length, 0)).toBe(409)
    expect(entradas.every(([clave]) => /^\d{7}-\d{2}$/.test(clave))).toBe(true)
    expect(entradas.every(([, opciones]) => opciones.length > 0)).toBe(true)
  })

  it('resuelve cada CUE del catálogo y sus carreras normalizadas', () => {
    for (const [clave, opciones] of entradas) {
      expect(esCueSuperior(clave)).toBe(true)
      expect(carrerasDelCue(clave)).toEqual(opciones)
    }
  })

  it('deja los CUE ausentes en el flujo preexistente', () => {
    expect(esCueSuperior('9999999-99')).toBe(false)
    expect(carrerasDelCue('9999999-99')).toEqual([])
    expect(validarAlcanceCarreras('9999999-99', 'alumnos', {}, true)).toBeNull()
  })
})

describe('validarAlcanceCarreras', () => {
  it('rechaza inaccesibilidad de alumnos para CUE Superior', () => {
    expect(validarAlcanceCarreras(cue, 'alumnos', {}, true)).toContain('no está disponible')
  })

  it('requiere una carrera en un alta y cuando se envía explícitamente una selección vacía', () => {
    expect(validarAlcanceCarreras(cue, 'establecimiento', {}, true)).toContain('al menos una carrera')
    expect(validarAlcanceCarreras(cue, 'establecimiento', { carreras: [] }, false)).toContain('al menos una carrera')
  })

  it('rechaza carreras de otro CUE y duplicados', () => {
    const carreraAjena = carrerasDelCue(cueAjeno)[0]
    expect(validarAlcanceCarreras(cue, 'establecimiento', { carreras: [carreraAjena] }, true)).toContain('no pertenece')
    expect(validarAlcanceCarreras(cue, 'establecimiento', { carreras: [carreras[0], carreras[0]] }, true)).toContain('No repita')
  })

  it('rechaza alcance por secciones o alumnos en Superior', () => {
    expect(validarAlcanceCarreras(cue, 'establecimiento', { carreras: [carreras[0]], secciones: [1] }, true)).toContain('no secciones')
    expect(validarAlcanceCarreras(cue, 'establecimiento', { carreras: [carreras[0]], alumnos: [1] }, true)).toContain('ni alumnos')
  })

  it('permite una selección perteneciente al CUE', () => {
    expect(validarAlcanceCarreras(cue, 'establecimiento', { carreras: [carreras[0]] }, true)).toBeNull()
  })
})

describe('validarCarrerasDeServicio', () => {
  it('requires a Superior CUE and non-empty, unique careers belonging to it', () => {
    expect(validarCarrerasDeServicio(cue, [])).toContain('al menos una carrera')
    expect(validarCarrerasDeServicio(cue, [carreras[0], carreras[0]])).toContain('No repita')
    expect(validarCarrerasDeServicio(cue, [carrerasDelCue(cueAjeno)[0]])).toContain('no pertenece')
    expect(validarCarrerasDeServicio('9999999-99', [carreras[0]])).toContain('no admite')
    expect(validarCarrerasDeServicio(cue, [carreras[0]])).toBeNull()
  })
})
