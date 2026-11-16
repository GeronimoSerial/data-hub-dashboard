// Spanish (Corrientes) texts of the `radarResto` group. Values stay byte-for-byte as shipped.
export const radarRestoEs = {
  pronostico: {
    cargando: 'Cargando pronóstico…',
    reintentar: 'Reintentar pronóstico',
    error: 'No se pudo cargar el pronóstico. Intente de nuevo más tarde.',
    vacio: 'Todavía no hay un pronóstico disponible. Vuelva a consultar más tarde.',
    actualizado: (antiguedad: string) => `Actualizado ${antiguedad}`,
  },
  escuela: {
    aria: (nombre: string, cue: string) => `Pronóstico de ${nombre}, CUE ${cue}`,
    titulo: (nombre: string) => `${nombre} · abrir pronóstico`,
  },
  linea: {
    retroceder: 'Retroceder un cuadro',
    avanzar: 'Avanzar un cuadro',
    reproducir: 'Reproducir',
    paso: 'Paso',
    cuadro: 'Cuadro del pronóstico',
  },
  horizonte: {
    sinDatos: 'Sin datos para este horizonte',
  },
  panel: {
    variable: 'Variable meteorológica',
    lluvia: 'Lluvia (mm)',
    probabilidad: 'Lluvia (prob)',
  },
  lluvia: {
    titulo: 'Lluvia observada',
    acumulado: (horas: number) => `Acumulado de las últimas ${horas} h`,
    masDe150: '150 mm o más',
    satelite: (cobertura: number) => `Faltan pasadas del satélite en esta ventana (${cobertura} % cubierto): la lluvia real puede ser mayor.`,
    bajaConfianza: 'Estimación satelital de baja confianza: puede deberse a nubosidad o humedad, no necesariamente lluvia.',
    constelacion: 'Constelación de satélites NASA · JAXA',
  },
} as const
