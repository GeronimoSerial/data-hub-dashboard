import { describe, it, expect } from 'vitest'
import { armarResumen, describirAlcanceServicio } from './reporte-inicial-resumen'

const afectacion = {
  motivo: 'Inundación',
  severidad: 'Alta',
  secciones: 2,
  alumnos: 53,
  descripcion: '',
}

const base = {
  afectacion,
  servicio: null,
  estadoEstablecimiento: '' as const,
  rigeDesde: '2026-09-18T13:30:00.000Z',
}

describe('describirAlcanceServicio', () => {
  it('el servicio normal no menciona alcance alguno', () => {
    expect(
      describirAlcanceServicio({ estado: 'normal', alcanceTipo: '', turnos: [], secciones: 0 }),
    ).toBe('Funcionamiento escolar normal')
  })

  it('nombra los turnos suspendidos', () => {
    expect(
      describirAlcanceServicio({
        estado: 'suspendido',
        alcanceTipo: 'turno',
        turnos: ['Mañana', 'Tarde'],
        secciones: 0,
      }),
    ).toBe('Funcionamiento escolar interrumpido en el turno Mañana, Tarde')
  })

  it('singulariza una sección', () => {
    expect(
      describirAlcanceServicio({ estado: 'suspendido', alcanceTipo: 'seccion', turnos: [], secciones: 1 }),
    ).toBe('Funcionamiento escolar interrumpido en 1 sección')
  })

  // El director tiene que poder ver que le falta un dato ANTES de guardar. Un
  // alcance vacío que se leyera "todo el establecimiento" le haría confirmar
  // algo que no eligió.
  it('un alcance elegido pero vacío se informa como faltante, no como todo el establecimiento', () => {
    expect(
      describirAlcanceServicio({ estado: 'suspendido', alcanceTipo: 'turno', turnos: [], secciones: 0 }),
    ).toBe('Funcionamiento escolar interrumpido, sin alcance indicado')
    expect(
      describirAlcanceServicio({ estado: 'suspendido', alcanceTipo: '', turnos: [], secciones: 0 }),
    ).toBe('Funcionamiento escolar interrumpido, sin alcance indicado')
  })
})

describe('armarResumen', () => {
  it('muestra el motivo, la severidad y el alcance en pares de etiqueta y valor', () => {
    const lineas = armarResumen(base)

    expect(lineas[0]).toEqual({ etiqueta: 'Situación', valor: 'Inundación', severidad: 'Alta' })
    expect(lineas[1]).toEqual({ etiqueta: 'Afecta a', valor: '2 secciones · 53 alumnos' })
  })

  it('omite la descripción cuando está vacía o en blanco', () => {
    expect(armarResumen(base)).toHaveLength(3)
    expect(armarResumen({ ...base, afectacion: { ...afectacion, descripcion: '   ' } })).toHaveLength(3)
  })

  it('incluye la descripción escrita, sin espacios sobrantes', () => {
    const lineas = armarResumen({
      ...base,
      afectacion: { ...afectacion, descripcion: '  El patio quedó bajo agua  ' },
    })

    expect(lineas).toContainEqual({ etiqueta: 'Detalle', valor: 'El patio quedó bajo agua' })
  })

  it('suma servicio y situación del establecimiento sólo si fueron informados', () => {
    const lineas = armarResumen({
      ...base,
      servicio: { estado: 'suspendido', alcanceTipo: 'establecimiento', turnos: [], secciones: 0 },
      estadoEstablecimiento: 'centro_evacuados',
    })

    expect(lineas).toContainEqual({ etiqueta: 'Clases', valor: 'suspendidas en todo el establecimiento' })
    expect(lineas).toContainEqual({ etiqueta: 'Edificio', valor: 'usado como centro de evacuados' })
  })

  it('cierra con el momento desde el que rige', () => {
    const lineas = armarResumen(base)

    expect(lineas[lineas.length - 1].etiqueta).toBe('Desde')
    expect(lineas[lineas.length - 1].valor).not.toBe('')
  })

  it('resume la asistencia pedagógica con el mismo par de etiqueta y valor', () => {
    const sinAsistencia = armarResumen({ ...base, asistenciaPedagogica: { brinda: false, modalidades: [] } })
    const conAsistencia = armarResumen({ ...base, asistenciaPedagogica: { brinda: true, modalidades: ['Clase virtual', 'Cuadernillo'] } })

    expect(sinAsistencia.at(-1)).toEqual({ etiqueta: 'Asistencia pedagógica', valor: 'No' })
    expect(conAsistencia.at(-1)).toEqual({ etiqueta: 'Asistencia pedagógica', valor: 'Sí (Clase virtual, Cuadernillo)' })
  })

  // Vocabulario prohibido por spec §5.4.
  it('nunca usa el vocabulario prohibido de la especificación', () => {
    const texto = armarResumen({
      ...base,
      servicio: { estado: 'normal', alcanceTipo: '', turnos: [], secciones: 0 },
      estadoEstablecimiento: 'evacuado',
      afectacion: { ...afectacion, descripcion: 'algo' },
    })
      .map(({ etiqueta, valor }) => `${etiqueta}: ${valor}`)
      .join(' ')
      .toLowerCase()

    for (const prohibida of ['versión', 'entidad', 'registro histórico', 'persistencia']) {
      expect(texto).not.toContain(prohibida)
    }
  })
})
