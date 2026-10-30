import { describe, expect, it, vi } from 'vitest'
import { extraerBloqueJson, normalizarV29 } from './importar-v29'

type Bloque = 'data' | 'datosNominales' | 'referentes' | 'centers'

// Cada bloque va en una sola línea `const <nombre>=<JSON>;`, como en el mockup.
function htmlCon(bloques: Partial<Record<Bloque, unknown>>): string {
  const lineas = Object.entries(bloques).map(([nombre, valor]) => `const ${nombre}=${JSON.stringify(valor)};`)
  return ['<html><body><script>', 'const x=alert(1);', ...lineas, '</script></body></html>'].join('\n')
}

const escuelaA = {
  cue: '1800001-00', nombre: 'Escuela A', departamento: 'Capital', localidad: 'Corrientes',
  ambito: 'Urbano', cui: '1800001', jurisdiccion: 'Corrientes', modalidad: 'Común',
  matricula: 4, historia: { '2023': 3, '2026': 5 }, lat: -27.47, lon: -58.83, pof: {},
  agentes: 0, zona: 'Zona 1', sueldos_total: 1000000, personas_sueldos: 4,
  clasificacion_zona_sueldos: 'Urbana',
}

// Sin importe positivo (0) y clasificación "NULL" del origen.
const escuelaB = {
  cue: '1800002-00', nombre: 'Escuela B', departamento: 'Capital', localidad: 'Corrientes',
  ambito: 'Urbano', cui: '1800002', jurisdiccion: 'Corrientes', modalidad: 'Común',
  matricula: 6, historia: { '2026': 6 }, lat: -27.48, lon: -58.84, pof: { Docente: 2 },
  agentes: 2, zona: 'Zona 1', sueldos_total: 0, personas_sueldos: 0,
  clasificacion_zona_sueldos: 'NULL',
}

// Sin importe (clave ausente), zona "Aislado" y un campo que el parser no traslada.
const escuelaC = {
  cue: '1800003-00', nombre: 'Escuela C', departamento: 'Esquina', localidad: 'Esquina',
  ambito: 'Rural', cui: '1800003', jurisdiccion: 'Corrientes', modalidad: 'Común',
  matricula: 2, historia: {}, lat: -28, lon: -59, pof: {}, agentes: 0,
  zona: 'Aislado', tipoGestion: 'Estatal',
}

const referencias = [
  {
    cue: '1800001-00', nombre: 'Escuela A', lat: -27.47, lon: -58.83, primaria: true,
    secundaria: false, matriculaPrimaria: 4, localidad: 'Corrientes', departamento: 'Capital',
  },
  {
    cue: '1800099-00', nombre: 'Secundaria X', lat: -27.5, lon: -58.8, primaria: false,
    secundaria: true, matriculaPrimaria: 0, localidad: 'Corrientes', departamento: 'Capital',
  },
]

const centros = [{ lat: -27.47, lon: -58.83, id: 1 }]

const datosNominales = {
  '1800001-00': { Primario: { total: 4, turnos: { Mañana: 4 }, modalidades: ['Común'], orientaciones: [] } },
  '1800002-00': { Primario: { total: 6, turnos: { Mañana: 6 }, modalidades: ['Común'], orientaciones: [] } },
  '1800050-00': {
    Secundario: { total: 30, turnos: { Tarde: 30 }, modalidades: ['Común'], orientaciones: ['Ciencias Naturales'] },
  },
}

function htmlValido(): string {
  return htmlCon({ data: [escuelaA, escuelaB, escuelaC], datosNominales, referentes: referencias, centers: centros })
}

describe('normalizarV29', () => {
  it('normaliza escuelas a camelCase y convierte sueldos no positivos o ausentes en null', () => {
    const { dataset } = normalizarV29(htmlValido())

    expect(dataset.escuelas).toEqual([
      {
        cue: '1800001-00', nombre: 'Escuela A', departamento: 'Capital', localidad: 'Corrientes',
        ambito: 'Urbano', cui: '1800001', jurisdiccion: 'Corrientes', modalidad: 'Común',
        matricula: 4, historia: { '2023': 3, '2026': 5 }, lat: -27.47, lon: -58.83, pof: {},
        agentes: 0, zona: 'Zona 1', sueldosTotal: 1000000, personasSueldos: 4,
        clasificacionZonaSueldos: 'Urbana',
      },
      {
        cue: '1800002-00', nombre: 'Escuela B', departamento: 'Capital', localidad: 'Corrientes',
        ambito: 'Urbano', cui: '1800002', jurisdiccion: 'Corrientes', modalidad: 'Común',
        matricula: 6, historia: { '2026': 6 }, lat: -27.48, lon: -58.84, pof: { Docente: 2 },
        agentes: 2, zona: 'Zona 1', sueldosTotal: null, personasSueldos: 0,
        clasificacionZonaSueldos: null,
      },
      {
        cue: '1800003-00', nombre: 'Escuela C', departamento: 'Esquina', localidad: 'Esquina',
        ambito: 'Rural', cui: '1800003', jurisdiccion: 'Corrientes', modalidad: 'Común',
        matricula: 2, historia: {}, lat: -28, lon: -59, pof: {}, agentes: 0,
        zona: 'Aislado', sueldosTotal: null, personasSueldos: null,
        clasificacionZonaSueldos: null,
      },
    ])
  })

  it('conserva null cuando una referencia no informa matrícula primaria', () => {
    const html = htmlCon({
      data: [escuelaA, escuelaB, escuelaC],
      datosNominales,
      referentes: [{ ...referencias[0], matriculaPrimaria: null }, referencias[1]],
      centers: centros,
    })
    const { dataset } = normalizarV29(html)
    expect(dataset.referencias[0].matriculaPrimaria).toBeNull()
    expect(dataset.referencias[1].matriculaPrimaria).toBe(0)
  })

  it('normaliza referencias, centros y oferta por CUE', () => {
    const { dataset } = normalizarV29(htmlValido())

    expect(dataset.version).toBe('V29')
    expect(dataset.corte).toBe('2026-10-28')
    expect(dataset.referencias).toEqual([
      {
        cue: '1800001-00', nombre: 'Escuela A', lat: -27.47, lon: -58.83, primaria: true,
        secundaria: false, matriculaPrimaria: 4, localidad: 'Corrientes', departamento: 'Capital',
      },
      {
        cue: '1800099-00', nombre: 'Secundaria X', lat: -27.5, lon: -58.8, primaria: false,
        secundaria: true, matriculaPrimaria: 0, localidad: 'Corrientes', departamento: 'Capital',
      },
    ])
    expect(dataset.centros).toEqual([{ lat: -27.47, lon: -58.83, id: 1 }])
    expect(dataset.ofertaPorCue).toEqual(datosNominales)
  })

  it('informa conteos de cobertura y diferencias entre fuentes', () => {
    const { informe } = normalizarV29(htmlValido())

    expect(informe).toEqual({
      escuelas: 3,
      alumnos: 12,
      conCoordenadas: 3,
      conImportePositivo: 1,
      conRegistrosPof: 1,
      centros: 1,
      zonasOcupadas: 1,
      historiaPorAnio: { '2023': 1, '2026': 2 },
      aislados: 0,
      aisladosNota: 'calculado en zonas.ts',
      referencias: 2,
      referenciasPrimaria: 1,
      referenciasSecundaria: 1,
      clavesOferta: 3,
      referenciasSinOferta: 1,
      ofertaSinReferencia: 2,
      sinImporte: ['1800002-00', '1800003-00'],
      camposDescartados: ['tipoGestion'],
    })
  })

  it('el dataset expone solo la cobertura, sin diagnósticos de importación', () => {
    const { dataset } = normalizarV29(htmlValido())

    expect(dataset.cobertura).toEqual({
      escuelas: 3,
      alumnos: 12,
      conCoordenadas: 3,
      conImportePositivo: 1,
      conRegistrosPof: 1,
      centros: 1,
      zonasOcupadas: 1,
      historiaPorAnio: { '2023': 1, '2026': 2 },
    })
  })

  it('no ejecuta el código del HTML aunque haya una línea que lo parezca', () => {
    const alertaFalsa = vi.fn()
    vi.stubGlobal('alert', alertaFalsa)

    try {
      normalizarV29(htmlValido())
      expect(alertaFalsa).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('lanza error ante un CUE duplicado en data', () => {
    const html = htmlCon({ data: [escuelaA, { ...escuelaB, cue: escuelaA.cue }], datosNominales, referentes: referencias, centers: centros })

    expect(() => normalizarV29(html)).toThrow('CUE duplicado en data: 1800001-00')
  })

  it('lanza error si una escuela no tiene coordenadas finitas', () => {
    const html = htmlCon({
      data: [{ ...escuelaA, lat: null }],
      datosNominales,
      referentes: referencias,
      centers: centros,
    })

    expect(() => normalizarV29(html)).toThrow(/Escuela 1800001-00 lat/)
  })
})

describe('extraerBloqueJson', () => {
  it('devuelve el JSON de la línea del bloque pedido', () => {
    expect(extraerBloqueJson(htmlCon({ centers: centros }), 'centers')).toEqual(centros)
  })

  it('nombra el bloque cuando falta en el HTML', () => {
    const html = htmlCon({ data: [escuelaA], datosNominales, referentes: referencias })

    expect(() => normalizarV29(html)).toThrow('Bloque "centers" no encontrado')
    expect(() => extraerBloqueJson(html, 'centers')).toThrow('Bloque "centers" no encontrado')
  })

  it('nombra el bloque cuando su JSON no es válido', () => {
    const html = '<script>\nconst data=[{];\n</script>'

    expect(() => extraerBloqueJson(html, 'data')).toThrow(/Bloque "data" no es JSON válido/)
  })
})

