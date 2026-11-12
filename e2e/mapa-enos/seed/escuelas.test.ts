import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CUE_ANEXO_OPERADOR, NIVEL_CON_ESCUELAS } from '../cuentas-qa'
import { ESCUELAS, type EscuelaSembrada } from './escuelas'

const GEOREF_URL = new URL('../../../public/data/departamentos-corrientes-georef-2026-09-27.geojson', import.meta.url)

type Anillo = number[][]
type Feature = { properties: { nombre: string }; geometry: { type: string; coordinates: unknown } }

const georef = JSON.parse(readFileSync(GEOREF_URL, 'utf8')) as { features: Feature[] }

function poligonosDe(nombre: string): Anillo[][] {
  const feature = georef.features.find((f) => f.properties.nombre === nombre)
  if (!feature) throw new Error(`Departamento ausente en Georef: ${nombre}`)
  const { type, coordinates } = feature.geometry
  return type === 'MultiPolygon' ? (coordinates as Anillo[][]) : [coordinates as Anillo[]]
}

// Ray casting sobre todos los anillos: un punto dentro de un agujero cuenta como fuera.
function dentroDeAnillo(lon: number, lat: number, anillo: Anillo): boolean {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

function dentroDelDepartamento(nombre: string, lon: number, lat: number): boolean {
  let cruces = 0
  for (const poligono of poligonosDe(nombre)) {
    for (const anillo of poligono) if (dentroDeAnillo(lon, lat, anillo)) cruces++
  }
  return cruces % 2 === 1
}

const conCoordenadas = ESCUELAS.filter((e): e is EscuelaSembrada & { lat: number; lon: number } =>
  e.lat !== null && e.lon !== null)
const sinCoordenadas = ESCUELAS.filter((e) => e.lat === null || e.lon === null)

describe('roster de escuelas del seed e2e', () => {
  it('tiene 32 escuelas: 30 con coordenadas y 2 sin coordenadas', () => {
    expect(ESCUELAS).toHaveLength(32)
    expect(conCoordenadas).toHaveLength(30)
    expect(sinCoordenadas).toHaveLength(2)
  })

  it('no repite CUE-anexo y todos tienen el formato 7 dígitos, guion, 2 dígitos', () => {
    const cues = ESCUELAS.map((e) => e.cueAnexo)
    expect(new Set(cues).size).toBe(cues.length)
    for (const cue of cues) expect(cue).toMatch(/^18\d{5}-\d{2}$/)
  })

  it('cada coordenada cae dentro del polígono de su departamento', () => {
    for (const escuela of conCoordenadas) {
      expect(
        dentroDelDepartamento(escuela.departamento, escuela.lon, escuela.lat),
        `${escuela.cueAnexo} (${escuela.departamento}) fuera del polígono`,
      ).toBe(true)
    }
  })

  it('incluye la escuela del operador con coordenadas y nivel de director de nivel', () => {
    const operador = ESCUELAS.find((e) => e.cueAnexo === CUE_ANEXO_OPERADOR)
    expect(operador).toBeDefined()
    expect(operador?.lat).not.toBeNull()
    expect(operador?.lon).not.toBeNull()
    expect(operador?.nivelJurisdiccionalId).toBe(NIVEL_CON_ESCUELAS)
  })

  it('cuenta por departamento: con coordenadas y total', () => {
    const porDepartamento = (nombre: string) => ({
      total: ESCUELAS.filter((e) => e.departamento === nombre).length,
      conCoordenadas: conCoordenadas.filter((e) => e.departamento === nombre).length,
    })
    expect(porDepartamento('Capital')).toEqual({ total: 11, conCoordenadas: 10 })
    expect(porDepartamento('Goya')).toEqual({ total: 9, conCoordenadas: 8 })
    expect(porDepartamento('Paso de los Libres')).toEqual({ total: 6, conCoordenadas: 6 })
    expect(porDepartamento('Santo Tomé')).toEqual({ total: 6, conCoordenadas: 6 })
  })

  it('cuenta por nivel jurisdiccional', () => {
    const porNivel = (id: number) => ESCUELAS.filter((e) => e.nivelJurisdiccionalId === id).length
    expect(porNivel(1)).toBe(12)
    expect(porNivel(2)).toBe(8)
    expect(porNivel(4)).toBe(6)
    expect(porNivel(5)).toBe(6)
  })

  it('cuenta de nivel 1 por departamento (alcance de director de nivel)', () => {
    const nivel1 = (nombre: string) =>
      ESCUELAS.filter((e) => e.departamento === nombre && e.nivelJurisdiccionalId === NIVEL_CON_ESCUELAS).length
    expect(nivel1('Capital')).toBe(4)
    expect(nivel1('Goya')).toBe(3)
    expect(nivel1('Paso de los Libres')).toBe(3)
    expect(nivel1('Santo Tomé')).toBe(2)
  })
})
