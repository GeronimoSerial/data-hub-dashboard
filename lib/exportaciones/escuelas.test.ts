import { describe, expect, it } from 'vitest'
import { ETIQUETA_GRAVEDAD } from '@/lib/infraestructura/mapa/etiquetas'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import {
  esTipoExportacion,
  EXPORTACIONES_ESCUELAS,
  filasExportacion,
  riesgoPorCueDesdeRadar,
  TIPOS_EXPORTACION_ESCUELAS,
  type ContextoExportacionEscuelas,
} from './escuelas'

function escuela(extra: Partial<EscuelaMapaEnriquecida> = {}): EscuelaMapaEnriquecida {
  return {
    cueAnexo: '30-00001-0',
    nombre: 'Escuela Base',
    departamento: 'PARANA',
    localidad: 'Paraná',
    lat: null,
    lon: null,
    niveles: ['Primario'],
    nivelJurisdiccionalId: 1,
    nivelJurisdiccionalNombre: 'Dirección Primaria',
    alumnos: 100,
    gravedad: 0,
    categoriaPrincipal: null,
    clases: 'normal',
    apoyo: null,
    sinActualizar: false,
    ultimaNovedad: null,
    alumnosSinClases: 0,
    situacionesHistoricas: 0,
    solucionadasRecientes: 0,
    ...extra,
  }
}

// Sólo la presencia de `parte` importa para "afectada"; el resto del parte no se lee.
const parteFicticio = {} as unknown as ParteMapa

const afectada = escuela({
  cueAnexo: '30-00002-0',
  nombre: 'Afectada',
  gravedad: 3,
  categoriaPrincipal: 'edificio',
  ultimaNovedad: '2026-10-10T12:00:00.000Z',
  parte: parteFicticio,
})
const sinClasesConApoyo = escuela({
  cueAnexo: '30-00003-0',
  nombre: 'Sin clases con apoyo',
  departamento: 'CONCORDIA',
  clases: 'sin',
  apoyo: 'virtual',
  alumnosSinClases: 80,
  alumnos: 80,
  parte: parteFicticio,
})
const sinClasesSinApoyo = escuela({
  cueAnexo: '30-00004-0',
  nombre: 'Sin clases sin apoyo',
  departamento: 'PARANA',
  clases: 'parcial',
  apoyo: 'no',
  alumnosSinClases: 20,
  alumnos: 60,
  parte: parteFicticio,
})
const conClases = escuela({ cueAnexo: '30-00005-0', nombre: 'Con clases', departamento: 'CONCORDIA' })
const enRiesgoAlto = escuela({ cueAnexo: '30-00006-0', nombre: 'En riesgo alto', departamento: 'PARANA' })
const enRiesgoBajo = escuela({ cueAnexo: '30-00007-0', nombre: 'Riesgo leve', departamento: 'PARANA' })

const todas = [afectada, sinClasesConApoyo, sinClasesSinApoyo, conClases, enRiesgoAlto, enRiesgoBajo]
const contexto: ContextoExportacionEscuelas = {
  riesgoPorCue: new Map([
    ['30-00006-0', 'alto'],
    ['30-00007-0', 'bajo'],
  ]),
}

function incluidas(tipo: Parameters<typeof filasExportacion>[0], lista = todas) {
  return filasExportacion(tipo, lista, contexto).map((fila) => fila.cue).sort()
}

describe('esTipoExportacion', () => {
  it('acepta sólo los cinco tipos de la etapa 1', () => {
    expect(TIPOS_EXPORTACION_ESCUELAS).toEqual(['afectadas', 'sin-clases', 'con-clases', 'asistidas', 'en-riesgo'])
    for (const tipo of TIPOS_EXPORTACION_ESCUELAS) expect(esTipoExportacion(tipo)).toBe(true)
    expect(esTipoExportacion('bajo-lluvia')).toBe(false)
    expect(esTipoExportacion('')).toBe(false)
  })
})

describe('predicados por tipo', () => {
  it('afectadas: sólo escuelas con parte', () => {
    expect(incluidas('afectadas')).toEqual(['30-00002-0', '30-00003-0', '30-00004-0'])
  })

  it('sin-clases: clases distinto de normal', () => {
    expect(incluidas('sin-clases')).toEqual(['30-00003-0', '30-00004-0'])
  })

  it('con-clases: clases normal', () => {
    expect(incluidas('con-clases')).toEqual(['30-00002-0', '30-00005-0', '30-00006-0', '30-00007-0'])
  })

  it('asistidas: apoyo pedagógico brindado, igual que el filtro "brinda" del mapa', () => {
    const conApoyoPorTodosLosModos = [
      escuela({ cueAnexo: 'v', clases: 'parcial', apoyo: 'virtual' }),
      escuela({ cueAnexo: 'c', clases: 'parcial', apoyo: 'cuadernillo' }),
      escuela({ cueAnexo: 'a', clases: 'sin', apoyo: 'ambos' }),
      escuela({ cueAnexo: 'b', clases: 'sin', apoyo: 'brinda' }),
      escuela({ cueAnexo: 'n', clases: 'sin', apoyo: 'no' }),
      escuela({ cueAnexo: 's', clases: 'sin', apoyo: 'sin_dato' }),
      escuela({ cueAnexo: 'x', clases: 'normal', apoyo: null }),
    ]
    expect(incluidas('asistidas', conApoyoPorTodosLosModos)).toEqual(['a', 'b', 'c', 'v'])
  })

  it('en-riesgo: toma el nivel desde el contexto y excluye las demás', () => {
    expect(incluidas('en-riesgo')).toEqual(['30-00006-0', '30-00007-0'])
    expect(filasExportacion('en-riesgo', todas)).toEqual([])
  })

  it('sin-clases y con-clases particionan el conjunto', () => {
    const sin = incluidas('sin-clases')
    const con = incluidas('con-clases')
    expect(new Set([...sin, ...con]).size).toBe(todas.length)
    expect(sin.filter((c) => con.includes(c))).toEqual([])
  })
})

describe('EXPORTACIONES_ESCUELAS', () => {
  it('cada tipo tiene título, nombre de archivo y columnas base con claves únicas', () => {
    for (const tipo of TIPOS_EXPORTACION_ESCUELAS) {
      const definicion = EXPORTACIONES_ESCUELAS[tipo]
      expect(definicion.titulo).toMatch(/^Escuelas /)
      expect(definicion.nombreArchivo).toMatch(/^escuelas-[a-z-]+$/)
      const claves = definicion.columnas.map((c) => c.clave)
      expect(new Set(claves).size).toBe(claves.length)
      expect(claves.slice(0, 7)).toEqual(['cue', 'escuela', 'departamento', 'localidad', 'direccion', 'niveles', 'matricula'])
    }
  })
})

describe('filasExportacion', () => {
  it('devuelve filas con las claves de columnas y valores formateados', () => {
    const [fila] = filasExportacion('afectadas', [afectada])
    expect(fila).toMatchObject({
      cue: '30-00002-0',
      escuela: 'Afectada',
      departamento: 'Parana',
      localidad: 'Paraná',
      direccion: 'Dirección Primaria',
      niveles: 'Primario',
      matricula: 100,
      gravedad: ETIQUETA_GRAVEDAD[3],
      categoria: 'edificio',
    })
    expect(fila.ultimaNovedad).toEqual(new Date('2026-10-10T12:00:00.000Z'))
  })

  it('en-riesgo expone el nivel de riesgo del contexto', () => {
    const [fila] = filasExportacion('en-riesgo', todas, contexto)
    expect(fila).toMatchObject({ cue: '30-00006-0', nivelRiesgo: 'Alto' })
  })

  it('ordena por departamento y luego por nombre', () => {
    const lista = [
      escuela({ cueAnexo: 'z', nombre: 'Zeta', departamento: 'PARANA', clases: 'sin', parte: parteFicticio }),
      escuela({ cueAnexo: 'b', nombre: 'Beta', departamento: 'CONCORDIA', clases: 'sin', parte: parteFicticio }),
      escuela({ cueAnexo: 'a', nombre: 'Alfa', departamento: 'PARANA', clases: 'sin', parte: parteFicticio }),
    ]
    expect(filasExportacion('sin-clases', lista).map((f) => f.cue)).toEqual(['b', 'a', 'z'])
  })

  it('no modifica la lista de entrada', () => {
    const lista = [sinClasesConApoyo, sinClasesSinApoyo]
    const copia = [...lista]
    filasExportacion('sin-clases', lista)
    expect(lista).toEqual(copia)
  })
})

describe('riesgoPorCueDesdeRadar', () => {
  it('mapea cue a nivel para las escuelas que el radar muestra', () => {
    const puntos = [
      { cueAnexo: '30-00006-0', horizonteHoras: 24, nivelRiesgo: 'alto', nivelAmenaza: 'alto', nivelVulnerabilidad: 'moderado' },
      { cueAnexo: '30-00007-0', horizonteHoras: 24, nivelRiesgo: 'bajo', nivelAmenaza: 'bajo', nivelVulnerabilidad: 'bajo' },
      { cueAnexo: '30-00005-0', horizonteHoras: 72, nivelRiesgo: 'muy_alto', nivelAmenaza: 'muy_alto', nivelVulnerabilidad: 'muy_alto' },
    ]
    expect(riesgoPorCueDesdeRadar(puntos, todas, 24)).toEqual(new Map([['30-00006-0', 'alto']]))
  })
})
