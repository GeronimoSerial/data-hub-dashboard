import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { RegionConfigSchema } from './esquema'
import { REGIONES_CONOCIDAS } from './registro'
import { PROVEEDORES_ALERTAS_CONOCIDOS, PROVEEDORES_RIO_CONOCIDOS } from './proveedores-conocidos'
import { DATASETS_REFERENCIA } from '../datasets/catalogo'
import { idiomaDeLocale } from '../../i18n/idioma'

const DIR_REGIONES = new URL('../../../config/regiones/', import.meta.url)
const DIR_PUBLIC = new URL('../../../public/', import.meta.url)

// Files referenced by a region's `archivos` that are not in public/ yet. They
// arrive in B12 (Manaos reference data, after B0 validation). Any other missing
// file fails the contract. Keep this allowlist explicit: add entries on purpose.
// Manaos bbox values are provisional until B0 validates the jurisdiction.
const ARCHIVOS_PENDIENTES_B12: Readonly<Record<string, readonly string[]>> = {
  manaos: ['/data/mascara-manaos.geojson', '/data/municipios-manaos.geojson'],
}

type Contexto = {
  idArchivo: string
  registradas: readonly string[]
  catalogo: readonly string[]
  proveedoresRio: readonly string[]
  proveedoresAlertas: readonly string[]
}

const CONTEXTO_REAL: Contexto = {
  idArchivo: '',
  registradas: REGIONES_CONOCIDAS,
  catalogo: Object.keys(DATASETS_REFERENCIA),
  proveedoresRio: Object.keys(PROVEEDORES_RIO_CONOCIDOS),
  proveedoresAlertas: Object.keys(PROVEEDORES_ALERTAS_CONOCIDOS),
}

const dentroDe = (valor: number, min: number, max: number) => valor >= min && valor <= max

// Pure validator: returns human-readable problems, empty when the region honours the contract.
export function problemasDeContrato(entrada: unknown, ctx: Contexto): string[] {
  const parsed = RegionConfigSchema.safeParse(entrada)
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => `schema: ${issue.path.join('.')} ${issue.message}`)
  }
  const r = parsed.data
  const problemas: string[] = []

  if (r.id !== ctx.idArchivo) problemas.push(`id "${r.id}" no coincide con el archivo "${ctx.idArchivo}.json"`)
  if (!ctx.registradas.includes(r.id)) problemas.push(`region "${r.id}" no registrada en REGIONES_CONOCIDAS`)

  const pendientes = r.datasetsPendientes ?? []
  for (const [rol, clave] of Object.entries(r.datasets)) {
    if (!ctx.catalogo.includes(clave) && !pendientes.includes(clave)) {
      problemas.push(`dataset ${rol}="${clave}" no está en el catálogo ni en datasetsPendientes`)
    }
  }

  for (const fuente of r.fuentesRio) {
    if (!ctx.proveedoresRio.includes(fuente)) problemas.push(`fuentesRio "${fuente}" sin proveedor conocido`)
  }
  for (const fuente of r.fuentesAlertas) {
    if (!ctx.proveedoresAlertas.includes(fuente)) problemas.push(`fuentesAlertas "${fuente}" sin proveedor conocido`)
  }

  const idiomaLocale = idiomaDeLocale(r.locale)
  if (!r.idiomas.includes(idiomaLocale)) {
    problemas.push(`idiomas ${JSON.stringify(r.idiomas)} no incluye el idioma del locale "${r.locale}"`)
  }

  const { bboxPlausible: p, bboxRuta: ruta } = r
  if (!(p.latMin < p.latMax)) problemas.push('bboxPlausible: latMin debe ser menor que latMax')
  if (!(p.lonMin < p.lonMax)) problemas.push('bboxPlausible: lonMin debe ser menor que lonMax')
  if (!(ruta.latMin < ruta.latMax)) problemas.push('bboxRuta: latMin debe ser menor que latMax')
  if (!(ruta.lonMin < ruta.lonMax)) problemas.push('bboxRuta: lonMin debe ser menor que lonMax')

  const dentroPlausible = ([lon, lat]: [number, number]) =>
    dentroDe(lon, p.lonMin, p.lonMax) && dentroDe(lat, p.latMin, p.latMax)
  if (!dentroPlausible(r.vistaInicial.centro)) problemas.push('vistaInicial.centro fuera de bboxPlausible')
  for (const [indice, punto] of r.limitesMapa.entries()) {
    if (!dentroPlausible(punto)) problemas.push(`limitesMapa[${indice}] fuera de bboxPlausible`)
  }

  return problemas
}

// Files on disk: each `archivos` path must exist in public/, or be an explicit B12 pending entry.
export function archivosSinPublicar(r: { id: string; archivos: { mascara: string; departamentos: string } }): string[] {
  const pendientes = ARCHIVOS_PENDIENTES_B12[r.id] ?? []
  return Object.values(r.archivos).filter(
    (ruta) => !existsSync(new URL(`.${ruta}`, DIR_PUBLIC)) && !pendientes.includes(ruta),
  )
}

const regionesEnDisco = () =>
  readdirSync(DIR_REGIONES)
    .filter((nombre) => nombre.endsWith('.json'))
    .map((nombre) => ({
      idArchivo: nombre.replace(/\.json$/, ''),
      json: JSON.parse(readFileSync(new URL(nombre, DIR_REGIONES), 'utf8')) as unknown,
    }))

describe('contrato de regiones (config/regiones/*.json)', () => {
  it('lists every region file on disk', () => {
    expect(regionesEnDisco().map((r) => r.idArchivo).sort()).toEqual(['corrientes', 'manaos'])
  })

  it.each(regionesEnDisco().map((r) => [r.idArchivo, r] as const))(
    '%s cumple el contrato',
    (idArchivo, { json }) => {
      expect(problemasDeContrato(json, { ...CONTEXTO_REAL, idArchivo })).toEqual([])
    },
  )

  it.each(regionesEnDisco().map((r) => [r.idArchivo, r] as const))(
    '%s tiene sus archivos publicados o declarados pendientes',
    (_idArchivo, { json }) => {
      const parsed = RegionConfigSchema.parse(json)
      expect(archivosSinPublicar(parsed)).toEqual([])
    },
  )

  it('known regions are exactly corrientes and manaos', () => {
    expect(REGIONES_CONOCIDAS).toEqual(['corrientes', 'manaos'])
  })
})

describe('validador de contrato (funciones puras, sin tocar archivos)', () => {
  const corrientes = JSON.parse(readFileSync(new URL('corrientes.json', DIR_REGIONES), 'utf8')) as Record<string, unknown>
  const ctx = { ...CONTEXTO_REAL, idArchivo: 'corrientes' }

  it('a region missing from the registry fails (b)', () => {
    const sinRegistro = { ...ctx, registradas: ['manaos'] }
    expect(problemasDeContrato(corrientes, sinRegistro)).toContain(
      'region "corrientes" no registrada en REGIONES_CONOCIDAS',
    )
  })

  it('a bogus river provider fails (d)', () => {
    const malo = { ...corrientes, fuentesRio: ['prefectura', 'proveedor-inventado'] }
    expect(problemasDeContrato(malo, ctx)).toContain('fuentesRio "proveedor-inventado" sin proveedor conocido')
  })

  it('a bogus alert provider fails (d)', () => {
    const malo = { ...corrientes, fuentesAlertas: ['smn', 'nube'] }
    expect(problemasDeContrato(malo, ctx)).toContain('fuentesAlertas "nube" sin proveedor conocido')
  })

  it('an undeclared dataset key fails (c)', () => {
    const malo = { ...corrientes, datasets: { ...(corrientes.datasets as object), localizaciones: 'sin-declarar' } }
    expect(problemasDeContrato(malo, ctx).join('\n')).toContain('dataset localizaciones="sin-declarar"')
  })

  it('a pending dataset key passes (c)', () => {
    const pendiente = {
      ...corrientes,
      datasets: { ...(corrientes.datasets as object), localizaciones: 'sin-declarar' },
      datasetsPendientes: ['sin-declarar'],
    }
    expect(problemasDeContrato(pendiente, ctx)).toEqual([])
  })

  it('idiomas without the locale language fails (e)', () => {
    const malo = { ...corrientes, locale: 'pt-BR' }
    expect(problemasDeContrato(malo, ctx).join('\n')).toContain('no incluye el idioma del locale "pt-BR"')
  })

  it('a vistaInicial outside bboxPlausible fails (f)', () => {
    const malo = { ...corrientes, vistaInicial: { centro: [0, 0], zoom: 6 } }
    expect(problemasDeContrato(malo, ctx)).toContain('vistaInicial.centro fuera de bboxPlausible')
  })

  it('an inverted bbox fails (f)', () => {
    const malo = { ...corrientes, bboxPlausible: { latMin: -26, latMax: -32, lonMin: -61, lonMax: -54 } }
    expect(problemasDeContrato(malo, ctx)).toContain('bboxPlausible: latMin debe ser menor que latMax')
  })

  it('a schema violation is reported and stops the rest', () => {
    const { idiomas: _omitido, ...sinIdiomas } = corrientes
    const problemas = problemasDeContrato(sinIdiomas, ctx)
    expect(problemas.length).toBeGreaterThan(0)
    expect(problemas[0]).toMatch(/^schema: idiomas/)
  })
})
