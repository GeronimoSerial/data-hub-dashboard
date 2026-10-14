import { describe, expect, it } from 'vitest'
import {
  describirAguaArriba,
  describirTraza,
  fechaHoraArt,
  horaArt,
  nombreRio,
  nombrePropio,
  numeroEs,
} from './traza-texto'

const METRICAS_RIO = [
  { id: 'rio.pna-paso-de-los-libres.altura_max_m', valor: 9.33, unidad: 'm', etiqueta: 'Altura máxima PASO DE LOS LIBRES' },
  { id: 'rio.pna-paso-de-los-libres.evacuacion_m', valor: 8.5, unidad: 'm', etiqueta: 'Nivel de evacuación PASO DE LOS LIBRES' },
  { id: 'rio.pna-paso-de-los-libres.alerta_m', valor: 7.1, unidad: 'm', etiqueta: 'Nivel de alerta PASO DE LOS LIBRES' },
]

describe('nombrePropio', () => {
  it('pasa a mayúscula inicial y deja los conectores en minúscula', () => {
    expect(nombrePropio('PASO DE LOS LIBRES')).toBe('Paso de los Libres')
  })

  it('restituye tildes de estaciones conocidas', () => {
    expect(nombrePropio('IGUAZU')).toBe('Iguazú')
    expect(nombrePropio('SANTO TOME')).toBe('Santo Tomé')
  })
})

describe('nombreRio', () => {
  it('traduce los códigos de río a su nombre propio', () => {
    expect(nombreRio('uruguay')).toBe('Uruguay')
    expect(nombreRio('parana')).toBe('Paraná')
  })
})

describe('numeroEs', () => {
  it('usa coma decimal y los decimales pedidos', () => {
    expect(numeroEs(9.3, 2)).toBe('9,30')
    expect(numeroEs(130, 1)).toBe('130,0')
  })
})

describe('horaArt y fechaHoraArt', () => {
  it('muestran la hora de Argentina', () => {
    expect(horaArt('2026-10-13T21:48:00Z')).toBe('18:48')
  })

  it('muestran día, mes y hora de Argentina', () => {
    expect(fechaHoraArt('2026-10-13T21:48:00Z')).toBe('13/10 18:48')
  })
})

describe('describirTraza', () => {
  it('describe el estado de evacuación de un río con su cota', () => {
    const texto = describirTraza(
      { regla: 'rio.estado', ref: 'rio.pna-paso-de-los-libres.estado_max', valor: 9.33, umbral: 'evacuacion', nivel: 'severo' },
      METRICAS_RIO,
    )
    expect(texto).toBe(
      'Prefectura Paso de los Libres (río Uruguay) — Altura del río: 9,33 m · Evacuación (evacuación 8,50 m)',
    )
  })

  it('describe el estado de alerta de un río con su cota', () => {
    const texto = describirTraza(
      { regla: 'rio.estado', ref: 'rio.pna-paso-de-los-libres.estado_max', valor: 7.25, umbral: 'alerta', nivel: 'alerta' },
      METRICAS_RIO,
    )
    expect(texto).toBe('Prefectura Paso de los Libres (río Uruguay) — Altura del río: 7,25 m · Alerta (alerta 7,10 m)')
  })

  it('omite el umbral cuando su métrica no está', () => {
    const texto = describirTraza(
      { regla: 'rio.estado', ref: 'rio.pna-paso-de-los-libres.estado_max', valor: 9.33, umbral: 'evacuacion', nivel: 'severo' },
      METRICAS_RIO.filter((m) => !m.id.endsWith('evacuacion_m')),
    )
    expect(texto).toBe('Prefectura Paso de los Libres (río Uruguay) — Altura del río: 9,33 m · Evacuación')
  })

  it('describe la subida de 24 h de un río en alerta', () => {
    const texto = describirTraza(
      { regla: 'rio.estado', ref: 'rio.pna-paso-de-los-libres.estado_max', valor: 0.35, umbral: 0.3, nivel: 'severo' },
      METRICAS_RIO,
    )
    expect(texto).toBe('Prefectura Paso de los Libres (río Uruguay): subió 0,35 m en 24 h (umbral 0,30 m)')
  })

  it('describe un río normal que se acerca a la alerta', () => {
    const texto = describirTraza(
      { regla: 'rio.tendencia', ref: 'rio.pna-paso-de-los-libres.estado_max', valor: 0.4, umbral: 0.5, nivel: 'vigilancia' },
      METRICAS_RIO,
    )
    expect(texto).toBe('Prefectura Paso de los Libres (río Uruguay): a 0,40 m de la alerta (umbral 0,50 m)')
  })

  it('describe la lluvia máxima de 24 h frente a su percentil', () => {
    const texto = describirTraza(
      { regla: 'lluvia.obs_24h', ref: 'lluvia.obs_24h.max_mm', valor: 62.4, umbral: 'p95', nivel: 'alerta' },
      [],
    )
    expect(texto).toBe('Lluvia máxima en 24 h: 62,4 mm (sobre el percentil 95 climatológico)')
  })

  it('describe la lluvia máxima de 24 h con percentil 90 y 99', () => {
    const p90 = describirTraza({ regla: 'lluvia.obs_24h', ref: 'lluvia.obs_24h.max_mm', valor: 40, umbral: 'p90', nivel: 'vigilancia' }, [])
    const p99 = describirTraza({ regla: 'lluvia.obs_24h', ref: 'lluvia.obs_24h.max_mm', valor: 90, umbral: 'p99', nivel: 'severo' }, [])
    expect(p90).toBe('Lluvia máxima en 24 h: 40,0 mm (sobre el percentil 90 climatológico)')
    expect(p99).toBe('Lluvia máxima en 24 h: 90,0 mm (sobre el percentil 99 climatológico)')
  })

  it('describe la lluvia máxima de 72 h frente a su umbral en mm', () => {
    const texto = describirTraza(
      { regla: 'lluvia.obs_72h', ref: 'lluvia.obs_72h.max_mm', valor: 130, umbral: 120, nivel: 'alerta' },
      [],
    )
    expect(texto).toBe('Lluvia máxima en 72 h: 130,0 mm ≥ 120 mm')
  })

  it('describe el caudal pronosticado sin el prefijo "Caudal pico"', () => {
    const texto = describirTraza(
      { regla: 'caudal.percentil', ref: 'caudal.corrientes.pico_m3s', valor: 12000, umbral: 'p95', nivel: 'alerta' },
      [{ id: 'caudal.corrientes.pico_m3s', valor: 12000, unidad: 'm³/s', etiqueta: 'Caudal pico Corrientes' }],
    )
    expect(texto).toBe('Caudal pronosticado Corrientes: 12.000 m³/s (sobre el percentil 95)')
  })

  it('describe la probabilidad del ensamble frente a p95', () => {
    const texto = describirTraza(
      { regla: 'ensamble.prob', ref: 'lluvia.ens.prob_p95', valor: 0.55, umbral: 0.5, nivel: 'alerta' },
      [],
    )
    expect(texto).toBe('Probabilidad de lluvia sobre el percentil 95: 55 % ≥ 50 %')
  })

  it('describe la probabilidad del ensamble frente a p99', () => {
    const texto = describirTraza(
      { regla: 'ensamble.prob', ref: 'lluvia.ens.prob_p99', valor: 0.25, umbral: 0.2, nivel: 'alerta' },
      [],
    )
    expect(texto).toBe('Probabilidad de lluvia sobre el percentil 99: 25 % ≥ 20 %')
  })

  it('describe el aviso del SMN por su color', () => {
    const texto = describirTraza({ regla: 'smn.aviso', ref: 'smn.a1.nivel', valor: null, umbral: 'naranja', nivel: 'alerta' }, [])
    expect(texto).toBe('Aviso del SMN nivel naranja')
  })

  it('usa la etiqueta de la métrica y su valor para una regla desconocida', () => {
    const texto = describirTraza(
      { regla: 'otra.regla', ref: 'otra.metrica', valor: 3, umbral: null, nivel: 'vigilancia' },
      [{ id: 'otra.metrica', valor: 3, unidad: 'días', etiqueta: 'Días de lluvia' }],
    )
    expect(texto).toBe('Días de lluvia: 3 días')
  })
})

describe('describirAguaArriba', () => {
  it('describe una estación sobre su cota de evacuación', () => {
    expect(
      describirAguaArriba({
        nombre: 'IGUAZU',
        rio: 'parana',
        estadoMax: 'evacuacion',
        alturaMaxM: 30.8,
        umbralM: 28,
      }),
    ).toBe('Prefectura Iguazú (río Paraná) — Altura del río: 30,80 m · Evacuación (evacuación 28,00 m)')
  })

  it('describe una estación en alerta y una normal con su cota de alerta', () => {
    const base = { nombre: 'IGUAZU', rio: 'parana' as const, alturaMaxM: 27.5, umbralM: 27.9 }
    expect(describirAguaArriba({ ...base, estadoMax: 'alerta' })).toBe(
      'Prefectura Iguazú (río Paraná) — Altura del río: 27,50 m · Alerta (alerta 27,90 m)',
    )
    expect(describirAguaArriba({ ...base, estadoMax: 'normal' })).toBe(
      'Prefectura Iguazú (río Paraná) — Altura del río: 27,50 m · Normal (alerta 27,90 m)',
    )
  })

  it('omite la cota cuando no hay margen publicado', () => {
    expect(
      describirAguaArriba({
        nombre: 'IGUAZU',
        rio: 'parana',
        estadoMax: 'normal',
        alturaMaxM: 27.5,
        umbralM: null,
      }),
    ).toBe('Prefectura Iguazú (río Paraná) — Altura del río: 27,50 m')
  })
})

describe('describirTraza lluvia pronosticada', () => {
  it('describe el máximo de 24 h pronosticado frente al umbral', () => {
    const texto = describirTraza(
      { regla: 'lluvia.pron_24h', ref: 'lluvia.pron_24h.max_mm', valor: 85, umbral: 80, nivel: 'alerta' },
      [],
    )
    expect(texto).toBe('Lluvia pronosticada en 24 h (ECMWF): 85,0 mm ≥ 80 mm')
  })
})
