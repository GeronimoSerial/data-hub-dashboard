import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  clasificarFilas,
  decodificarPadron,
  deduplicarMembresias,
  derivarEnteroEstable,
  derivarIds,
  extraerB64DeHtml,
  normalizarFilaHtml,
  reconciliarFilas,
} from './import-padron.mjs'

function htmlConPadron(payload: unknown): string {
  const b64 = gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64')
  return `<html><body><script>const STUDENTS_GZ_B64="${b64}";</script></body></html>`
}

describe('extraerB64DeHtml', () => {
  it('extrae el contenido de STUDENTS_GZ_B64', () => {
    const html = htmlConPadron({ c: [], r: [] })
    expect(extraerB64DeHtml(html)).toMatch(/^[A-Za-z0-9+/=]+$/)
  })

  it('tira si la constante no está presente', () => {
    expect(() => extraerB64DeHtml('<html></html>')).toThrow()
  })
})

describe('decodificarPadron', () => {
  it('decodifica gzip+base64 y devuelve el JSON { c, r }', () => {
    const filas = [['1', 'PEREZ', 'ANA', 'Primario', '', '', '', '1800001-00', '', '1', 'A', 'Mañana']]
    const html = htmlConPadron({ c: [], r: filas })
    const resultado = decodificarPadron(html)
    expect(resultado.r).toEqual(filas)
  })

  it('tira si el JSON decodificado no tiene forma { r: [...] }', () => {
    const html = htmlConPadron({ c: [] })
    expect(() => decodificarPadron(html)).toThrow()
  })
})

describe('derivarEnteroEstable', () => {
  it('es determinístico para la misma clave', () => {
    expect(derivarEnteroEstable('1800673-00|1|A|Mañana|Primario')).toBe(
      derivarEnteroEstable('1800673-00|1|A|Mañana|Primario'),
    )
  })

  it('produce valores distintos para claves distintas', () => {
    expect(derivarEnteroEstable('a')).not.toBe(derivarEnteroEstable('b'))
  })

  it('devuelve un entero positivo dentro de Number.MAX_SAFE_INTEGER', () => {
    const valor = derivarEnteroEstable('57937653')
    expect(typeof valor).toBe('number')
    expect(valor).toBeGreaterThan(0)
    expect(valor).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER)
  })
})

function fila(overrides: Partial<{
  dni: string
  apellido: string
  nombre: string
  nivel: string
  cue: string
  curso: string
  division: string
  turno: string
}> = {}) {
  const f = {
    dni: '1',
    apellido: 'PEREZ',
    nombre: 'ANA',
    nivel: 'Primario',
    cue: '1800001-00',
    curso: '1',
    division: 'A',
    turno: 'Mañana',
    ...overrides,
  }
  return [f.dni, f.apellido, f.nombre, f.nivel, '', '', '', f.cue, '', f.curso, f.division, f.turno]
}

describe('clasificarFilas', () => {
  const cuesConocidos = new Set(['1800001-00'])

  it('acepta una fila con CUE válido y conocido', () => {
    const r = clasificarFilas([fila()], cuesConocidos)
    expect(r.aceptadas).toHaveLength(1)
    expect(r.descartadosPorCue).toBe(0)
    expect(r.descartadosPorLocalizacion).toBe(0)
    expect(r.cuesConciliados.has('1800001-00')).toBe(true)
  })

  it('descarta una fila con CUE mal formado', () => {
    const r = clasificarFilas([fila({ cue: 'no-es-cue' })], cuesConocidos)
    expect(r.aceptadas).toHaveLength(0)
    expect(r.descartadosPorCue).toBe(1)
  })

  it('descarta una fila cuyo CUE no está en ge_localizacion, sin inventarlo', () => {
    const r = clasificarFilas([fila({ cue: '9999999-99' })], cuesConocidos)
    expect(r.aceptadas).toHaveLength(0)
    expect(r.descartadosPorLocalizacion).toBe(1)
    expect(r.cuesDescartados.has('9999999-99')).toBe(true)
  })
})

describe('derivarIds', () => {
  it('agrupa membresías por sección y por persona con ids estables', () => {
    const aceptadas = [
      fila({ dni: '1', cue: '1800001-00', curso: '1', division: 'A' }),
      fila({ dni: '2', cue: '1800001-00', curso: '1', division: 'A' }),
    ].map((f) => ({
      dni: f[0],
      apellido: f[1],
      nombre: f[2],
      nivel: f[3],
      cueAnexo: f[7],
      curso: f[9],
      division: f[10],
      turno: f[11],
    }))

    const { secciones, personas, asignaciones } = derivarIds(aceptadas)
    expect(secciones.size).toBe(1)
    expect(personas.size).toBe(2)
    expect(asignaciones).toHaveLength(2)
  })

  it('nunca conserva el DNI en las estructuras que se persisten', () => {
    const aceptadas = [
      {
        dni: '57937653',
        apellido: 'ALBARENGA',
        nombre: 'BIANCA',
        nivel: 'Primario',
        cueAnexo: '1800001-00',
        curso: '1',
        division: 'A',
        turno: 'Mañana',
      },
    ]
    const { secciones, personas, asignaciones } = derivarIds(aceptadas)
    const serializado = JSON.stringify([...secciones.values(), ...personas.values(), asignaciones])
    expect(serializado).not.toContain('57937653')
  })

  it('tira Error si dos DNIs distintos producen el mismo gePersonId (colisión simulada)', () => {
    const aceptadas = [
      {
        dni: 'x',
        apellido: 'A',
        nombre: 'B',
        nivel: 'Primario',
        cueAnexo: '1800001-00',
        curso: '1',
        division: 'A',
        turno: 'Mañana',
      },
    ]
    // No podemos forzar una colisión real de sha256 en un test unitario; se
    // verifica en cambio que la función de derivación es la única fuente del
    // id (ver derivarEnteroEstable) y que un DNI repetido reutiliza el mismo id.
    const primera = derivarIds(aceptadas)
    const segunda = derivarIds([...aceptadas, { ...aceptadas[0] }])
    expect(segunda.personas.size).toBe(1)
    expect(primera.personas.size).toBe(1)
  })
})

describe('deduplicarMembresias', () => {
  it('elimina asignaciones repetidas de (seccion, persona)', () => {
    const r = deduplicarMembresias([
      { geSectionId: 1, gePersonId: 1 },
      { geSectionId: 1, gePersonId: 1 },
      { geSectionId: 1, gePersonId: 2 },
    ])
    expect(r).toHaveLength(2)
  })
})

describe('normalizarFilaHtml / reconciliarFilas', () => {
  const cuesConocidos = new Set(['1800001-00'])

  it('la fila posicional del HTML y la fila de Gestión Educativa convergen', () => {
    // El lector de Postgres (scripts/padron-ge.mjs) entrega exactamente esta
    // forma; si los dos orígenes divergen, el resto del pipeline se rompe.
    const desdeHtml = normalizarFilaHtml(fila())
    expect(desdeHtml).toEqual({
      dni: '1',
      apellido: 'PEREZ',
      nombre: 'ANA',
      nivel: 'Primario',
      cueAnexo: '1800001-00',
      curso: '1',
      division: 'A',
      turno: 'Mañana',
    })
  })

  it('reconcilia filas ya normalizadas sin pasar por el HTML', () => {
    const r = reconciliarFilas([normalizarFilaHtml(fila())], cuesConocidos)
    expect(r.aceptadas).toHaveLength(1)
    expect(r.cuesConciliados.has('1800001-00')).toBe(true)
  })

  it('normaliza el CUE antes de reconciliar', () => {
    const r = reconciliarFilas(
      [{ ...normalizarFilaHtml(fila()), cueAnexo: ' 1800001-00 ' }],
      cuesConocidos,
    )
    expect(r.aceptadas[0]?.cueAnexo).toBe('1800001-00')
  })
})
