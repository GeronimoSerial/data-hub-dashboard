import { describe, expect, it } from 'vitest'
import {
  conexionDesdeEntorno,
  leerPadronDesdeGe,
  normalizarFilaGe,
  parsearConexion,
} from './padron-ge.mjs'

describe('parsearConexion', () => {
  it('parsea el formato clave/valor de .NET', () => {
    expect(
      parsearConexion('Server=1.2.3.4;Port=5432;Database=asistencias;User Id=geronimo;Password=secreta;'),
    ).toEqual({
      host: '1.2.3.4',
      port: 5432,
      database: 'asistencias',
      user: 'geronimo',
      password: 'secreta',
    })
  })

  it('deja pasar una URL postgres:// sin tocarla', () => {
    const url = 'postgres://u:p@host:5432/db'
    expect(parsearConexion(url)).toEqual({ connectionString: url })
  })

  it('usa 5432 cuando no viene el puerto', () => {
    const c = parsearConexion('Server=h;Database=d;User Id=u;Password=p')
    expect(c.port).toBe(5432)
  })

  it('no rompe con una contraseña que contiene "="', () => {
    const c = parsearConexion('Server=h;Database=d;User Id=u;Password=ab=cd==')
    expect(c.password).toBe('ab=cd==')
  })

  it('tira nombrando los campos que faltan', () => {
    expect(() => parsearConexion('Server=h')).toThrow(/Database, User Id/)
  })

  it('tira si la cadena está vacía', () => {
    expect(() => parsearConexion('  ')).toThrow()
  })
})

describe('conexionDesdeEntorno', () => {
  it('prefiere PADRON_PG_URL sobre ConnectionStrings', () => {
    const c = conexionDesdeEntorno({
      PADRON_PG_URL: 'postgres://a/b',
      ConnectionStrings: 'Server=otro;Database=d;User Id=u',
    })
    expect(c).toEqual({ connectionString: 'postgres://a/b' })
  })

  it('cae a ConnectionStrings si no hay PADRON_PG_URL', () => {
    const c = conexionDesdeEntorno({ ConnectionStrings: 'Server=h;Database=d;User Id=u' })
    expect(c.host).toBe('h')
  })

  it('tira si no hay ninguna de las dos', () => {
    expect(() => conexionDesdeEntorno({})).toThrow(/PADRON_PG_URL/)
  })
})

describe('normalizarFilaGe', () => {
  it('convierte los NULL de texto en cadena vacía', () => {
    expect(
      normalizarFilaGe({
        dni: '57937653',
        apellido: 'ALBARENGA',
        nombre: 'BIANCA',
        nivel: 'Primario',
        cue_anexo: '1800001-00',
        curso: '1',
        division: 'A',
        turno: null,
      }),
    ).toEqual({
      dni: '57937653',
      apellido: 'ALBARENGA',
      nombre: 'BIANCA',
      nivel: 'Primario',
      cueAnexo: '1800001-00',
      curso: '1',
      division: 'A',
      turno: '',
    })
  })

  it('recorta espacios alrededor de los valores', () => {
    const fila = normalizarFilaGe({ dni: ' 1 ', cue_anexo: ' 1800001-00 ' })
    expect(fila.dni).toBe('1')
    expect(fila.cueAnexo).toBe('1800001-00')
  })
})

function clienteFalso(rows: unknown[]) {
  const llamadas: { sql: string; args: unknown[] }[] = []
  class Fake {
    conectado = false
    terminado = false
    async connect() {
      this.conectado = true
    }
    async query(sql: string, args: unknown[]) {
      llamadas.push({ sql, args })
      return { rows }
    }
    async end() {
      this.terminado = true
    }
  }
  return { Fake, llamadas }
}

describe('leerPadronDesdeGe', () => {
  const fila = (over: Record<string, unknown> = {}) => ({
    dni: '1',
    apellido: 'PEREZ',
    nombre: 'ANA',
    nivel: 'Primario',
    cue_anexo: '1800001-00',
    curso: '1',
    division: 'A',
    turno: 'Mañana',
    ...over,
  })

  it('normaliza las filas y filtra el ciclo pedido', async () => {
    const { Fake, llamadas } = clienteFalso([fila()])
    const r = await leerPadronDesdeGe({
      conexion: {},
      cicloLectivo: '2026',
      Client: Fake,
    })

    expect(r.filas).toHaveLength(1)
    expect(r.filas[0].cueAnexo).toBe('1800001-00')
    expect(r.cicloLectivo).toBe('2026')
    expect(llamadas[0].args[0]).toBe('2026')
  })

  it('descarta las filas sin documento y las cuenta', async () => {
    const { Fake } = clienteFalso([fila(), fila({ dni: null }), fila({ dni: '  ' })])
    const r = await leerPadronDesdeGe({ conexion: {}, cicloLectivo: '2026', Client: Fake })

    expect(r.filas).toHaveLength(1)
    expect(r.sinDocumento).toBe(2)
  })

  it('cierra la conexión aunque la consulta falle', async () => {
    let terminado = false
    class Rota {
      async connect() {}
      async query() {
        throw new Error('caída')
      }
      async end() {
        terminado = true
      }
    }
    await expect(
      leerPadronDesdeGe({ conexion: {}, cicloLectivo: '2026', Client: Rota }),
    ).rejects.toThrow('caída')
    expect(terminado).toBe(true)
  })

  it('pagina hasta agotar el padrón y no retiene todo en memoria', async () => {
    // Dos páginas completas y una parcial: la tercera corta el recorrido.
    const paginas = [Array.from({ length: 2 }, () => fila()), Array.from({ length: 2 }, () => fila({ dni: '2' })), [fila({ dni: '3' })]]
    let i = 0
    const llamadas: unknown[][] = []
    class Paginado {
      async connect() {}
      async query(_sql: string, args: unknown[]) {
        llamadas.push(args)
        return { rows: paginas[i++] ?? [] }
      }
      async end() {}
    }

    const { recorrerPadronDesdeGe } = await import('./padron-ge.mjs')
    const lotes: number[] = []
    const r = await recorrerPadronDesdeGe({
      conexion: {},
      cicloLectivo: '2026',
      Client: Paginado,
      tamanoPagina: 2,
      onLote: (filas: unknown[]) => { lotes.push(filas.length) },
    })

    expect(lotes).toEqual([2, 2, 1])
    expect(r.leidas).toBe(5)
    expect(llamadas.map((a) => a[2])).toEqual([0, 2, 4])
  })

  it('solo pide alumnos activos', async () => {
    const { Fake, llamadas } = clienteFalso([])
    await leerPadronDesdeGe({ conexion: {}, cicloLectivo: '2026', Client: Fake })
    expect(llamadas[0].sql).toContain("a.status::text = 'activo'")
  })
})
