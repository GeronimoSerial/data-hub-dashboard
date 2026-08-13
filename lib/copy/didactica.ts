import type { Semaforo } from '@/lib/sobreoferta'

/** Microcopy didáctica del mapa — tono presentación ejecutiva. */
export const COPY = {
  title: {
    description:
      'Establecimientos y zonas de ~20 km. Clic para ver la matrícula; en Capas podés activar Sobreoferta escolar (demanda vs edificios).',
  },

  legend: {
    evolutionTitle: 'Evolución matrícula 2023-2026',
    evolutionHint:
      'Los colores muestran cómo cambió la matrícula en escuelas con serie completa.',
    comparableLabel: 'Escuelas con serie completa 2023–2026',
    enrollment2023: 'Matrícula 2023',
    enrollment2026: 'Matrícula 2026',
    variation: 'Variación',
    sobreofertaTitle: 'Sobreoferta escolar',
    sobreofertaPurpose:
      'Señala candidatas a revisión (demanda vs edificios). No decide cierres ni fusiones.',
    noSobreofertaData: 'Sin datos de sobreoferta',
    tips: [
      'Los nacidos llegan a sala de 4 unos 4 años después: una caída de natalidad anticipa menos matrícula en este y los próximos ciclos.',
      'Nacidos vivos = lugar de registro (hospital), no siempre dónde vive la familia.',
      '“Natalidad en caída” = peor que la mediana de Corrientes, no cualquier valor negativo.',
    ],
  },

  layers: {
    sobreofertaTip:
      'Mira demanda actual y futura vs edificios. No implica cierres.',
  },

  popup: {
    enrollmentSection: 'Matrícula',
    enrollmentHint: 'Cómo cambió la cantidad de alumnos',
    costsSection: 'Costos',
    costsHint: 'Sueldos mensuales estimados (orientativo)',
    demandSection: 'Demanda vs edificios',
    demandHint:
      'Los nacidos llegan a sala de 4 ~4 años después. Si nacieron menos, la matrícula de este y los próximos ciclos tiende a achicarse.',
    signalFuture: 'Demanda futura (natalidad → sala de 4)',
    signalToday: 'Demanda actual (alumnos por edificio)',
    contextExtra: 'Contexto adicional',
    tasaAsistencia4: 'Asistencia estimada a sala de 4',
    icseQuintil: 'Contexto social ICSE (1 mejor … 5 más vulnerable)',
    semaforo: 'Lectura',
    cue: 'CUE-Anexo',
    locality: 'Localidad',
    department: 'Departamento',
    zone: 'Zona',
    deptShare: 'La zona toca varios departamentos (peso por edificios)',
    apiSection: 'Matrícula real (API GE)',
    apiHint: 'Inicio → fin del ciclo lectivo por año',
    zoneAllSchools: 'Matrícula de todas las escuelas',
    zoneCompleteHistory: 'Solo escuelas con historia completa',
    zoneCompleteCount: 'Con historia completa',
    diameter: 'Diámetro',
    establishments: 'Establecimientos',
    absChange: 'Variación absoluta 2023–2026',
    pctChange: 'Variación porcentual 2023–2026',
    trend: 'Tendencia',
    monthlySalary: 'Costo mensual de sueldos',
    monthlySavings: 'Ahorro mensual estimado si se revisara la oferta',
    upDownFlat: 'Aumentaron / disminuyeron / sin cambio',
    sobreedad: 'Sobreedad',
    repitencia: 'Repitencia',
    byOffer: 'Por oferta',
    byTurn: 'Por turno',
  },

  /** Implicación ejecutiva del color (qué hacer / cómo leer). */
  semaforoGlosa: {
    rojo: 'Candidata a revisar si sobran edificios: poca matrícula hoy y natalidad en baja relativa.',
    amarillo:
      'Conviene observar: la natalidad ya cae más que el promedio; el ratio actual aún no se ve tan flojo.',
    verde:
      'Sin las dos señales juntas de presión a la baja; no priorizar revisión por sobreoferta.',
  } satisfies Record<Semaforo, string>,
} as const

export function semaforoGlosa(key: Semaforo): string {
  return COPY.semaforoGlosa[key]
}

/** "bajó 34,1%" / "subió 5,0%" / "sin cambio" */
export function formatCambioPct(frac: number | null | undefined): string {
  if (frac == null || Number.isNaN(frac)) return '—'
  const pct = frac * 100
  const abs = Math.abs(pct).toFixed(1).replace('.', ',')
  if (Math.abs(pct) < 0.05) return 'sin cambio'
  return pct < 0 ? `bajó ${abs}%` : `subió ${abs}%`
}

/**
 * Párrafo ejecutivo de demanda futura (+4 hacia sala de 4).
 * Una sola lectura: dato → desfase → expectativa de matrícula.
 * `emphasis` = conclusión en MAYÚSCULAS (cualquier decisión, no solo la negativa).
 */
export function demandaFuturaTexto(opts: {
  variacion: number | null | undefined
  mediana: number
  enCaida: boolean
}): { dato: string; lead: string; emphasis: string } {
  const cambio = formatCambioPct(opts.variacion)
  const med = formatCambioPct(opts.mediana)
  const dato = `Nacidos 2014→2023: ${cambio} (mediana provincia: ${med}).`

  if (opts.variacion == null) {
    return {
      dato,
      lead: '',
      emphasis: 'SIN DATO DE NATALIDAD PARA PROYECTAR LA COHORTE ESCOLAR.',
    }
  }

  if (opts.enCaida) {
    return {
      dato,
      lead: 'Esos chicos ya entran o van a entrar a sala de 4 (~4 años después del nacimiento): ',
      emphasis:
        'SE ESPERA QUE LA MATRÍCULA DE ESTE Y LOS PRÓXIMOS CICLOS TIENDA A ACHICARSE, MÁS QUE EN EL PROMEDIO PROVINCIAL.',
    }
  }

  if (opts.variacion < 0) {
    return {
      dato,
      lead: 'Hay menos nacidos que en 2014, pero la caída no es peor que la mediana provincial: ',
      emphasis:
        'LA PRESIÓN A LA BAJA SOBRE SALA DE 4 Y LOS CICLOS SIGUIENTES ES MÁS MODERADA QUE EN EL PROMEDIO PROVINCIAL.',
    }
  }

  return {
    dato,
    lead: 'La natalidad no muestra contracción relativa: ',
    emphasis:
      'NO SE ANTICIPA, POR ESTE INDICADOR, UNA CAÍDA EXTRA DE MATRÍCULA POR COHORTE EN SALA DE 4.',
  }
}

export function demandaActualTexto(opts: {
  alumnos: number | null | undefined
  mediana: number
  bajoDemanda: boolean
}): { dato: string; lectura: string } {
  const alumnos =
    opts.alumnos == null ? '—' : opts.alumnos.toFixed(1).replace('.', ',')
  const med = opts.mediana.toFixed(1).replace('.', ',')
  const dato = `${alumnos} alumnos por edificio (mediana provincia: ${med}).`

  if (opts.alumnos == null) {
    return {
      dato,
      lectura: 'Sin dato de alumnos por edificio.',
    }
  }

  return {
    dato,
    lectura: opts.bajoDemanda
      ? 'Hoy ya hay pocos alumnos por edificio respecto del resto de la provincia.'
      : 'Hoy el ratio de alumnos por edificio no está por debajo de la mediana provincial.',
  }
}
