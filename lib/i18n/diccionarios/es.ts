import type { Semaforo } from '@/lib/sobreoferta'
import { libTextos2Es } from './grupos/libTextos2.es'
import { residuosEs } from './grupos/residuos.es'
import { fichaPanelEs } from './grupos/fichaPanel.es'
import { fichaPaginaEs } from './grupos/fichaPagina.es'
import { radarRestoEs } from './grupos/radarResto.es'
import { libTextosEs } from './grupos/libTextos.es'
import { controlesCapasEs } from './grupos/controlesCapas.es'
import { controlesFiltrosEs } from './grupos/controlesFiltros.es'
import { fichaPanoramaEs } from './grupos/fichaPanorama.es'
import { fichaTerritorioEs } from './grupos/fichaTerritorio.es'
import { fichaHistorialEs } from './grupos/fichaHistorial.es'
import { fichaCuerpoEs } from './grupos/fichaCuerpo.es'
import { etiquetasEs } from './grupos/etiquetas.es'
import { radarEs } from './grupos/radar.es'
import { estadisticasEs } from './grupos/estadisticas.es'
import { controlesEs } from './grupos/controles.es'
import { panelesMapaEs } from './grupos/panelesMapa.es'
import { situacionEs } from './grupos/situacion.es'

// Spanish (Corrientes) dictionary. The values are user-facing text and must
// stay byte-for-byte as shipped: change them only with an explicit product request.
// `didactica` is the microcopy of the map; it is exactly the shape of COPY.
// `didacticaTextos` holds the sentences built by the didactica helpers.
export const es = {
  didactica: {
    title: {
      description:
        'Establecimientos y zonas de ~20 km. Hacer clic muestra la matrícula; en Capas se puede activar Sobreoferta escolar (demanda vs edificios).',
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
  },

  selectorIdioma: {
    label: 'Idioma de la interfaz',
  },
  didacticaTextos: {
    cambio: {
      sinCambio: 'sin cambio',
      bajo: (porcentaje: string) => `bajó ${porcentaje}%`,
      subio: (porcentaje: string) => `subió ${porcentaje}%`,
    },
    demandaFutura: {
      dato: (cambio: string, mediana: string) =>
        `Nacidos 2014→2023: ${cambio} (mediana provincia: ${mediana}).`,
      sinDato: 'SIN DATO DE NATALIDAD PARA PROYECTAR LA COHORTE ESCOLAR.',
      enCaida: {
        lead: 'Esos chicos ya entran o van a entrar a sala de 4 (~4 años después del nacimiento): ',
        emphasis:
          'SE ESPERA QUE LA MATRÍCULA DE ESTE Y LOS PRÓXIMOS CICLOS TIENDA A ACHICARSE, MÁS QUE EN EL PROMEDIO PROVINCIAL.',
      },
      menorModerada: {
        lead: 'Hay menos nacidos que en 2014, pero la caída no es peor que la mediana provincial: ',
        emphasis:
          'LA PRESIÓN A LA BAJA SOBRE SALA DE 4 Y LOS CICLOS SIGUIENTES ES MÁS MODERADA QUE EN EL PROMEDIO PROVINCIAL.',
      },
      sinContraccion: {
        lead: 'La natalidad no muestra contracción relativa: ',
        emphasis:
          'NO SE ANTICIPA, POR ESTE INDICADOR, UNA CAÍDA EXTRA DE MATRÍCULA POR COHORTE EN SALA DE 4.',
      },
    },
    demandaActual: {
      dato: (alumnos: string, mediana: string) =>
        `${alumnos} alumnos por edificio (mediana provincia: ${mediana}).`,
      sinDato: 'Sin dato de alumnos por edificio.',
      bajoDemanda:
        'Hoy ya hay pocos alumnos por edificio respecto del resto de la provincia.',
      noBajoDemanda:
        'Hoy el ratio de alumnos por edificio no está por debajo de la mediana provincial.',
    },
  },

  // Map tabs and modes (the tab bar above the map).
  modos: {
    ariaBarra: (nombre: string) => `Modos y vistas de ENOS ${nombre}`,
    cargandoMapa: 'Cargando mapa…',
    situacionActual: 'Situación actual',
    situacionActualAria: (cantidad: number) =>
      `Situación actual, ${cantidad} ${cantidad === 1 ? 'escuela' : 'escuelas'} con situaciones abiertas`,
    radar: 'Radar',
    planificacion: 'Planificación',
    capas: 'Capas',
    estadisticas: 'Estadísticas',
    exportar: 'Exportar',
    callCenter: 'Call center',
    cuadernillos: 'Cuadernillos',
  },

  // Layers panel (Capas) and the territorial legend of the map.
  capas: {
    ariaPanel: 'Capas',
    situacionActual: 'Situación actual',
    mapaBase: 'Mapa base',
    referencias: 'Referencias',
    riesgo: 'Riesgo',
    estacionesRio: 'Estaciones de Prefectura (altura de ríos)',
    lluviaObservada: 'Lluvia observada (satélite IMERG)',
    ventanaLluvia: 'Ventana de lluvia observada',
    limitesDepartamentos: 'Límites de los departamentos',
    nombresDepartamentos: 'Nombres de los departamentos',
    rutaAcceso: 'Ruta de acceso de la escuela seleccionada',
    crucesAgua: 'Cruces de agua de la ruta',
    escuelasEnRiesgo: 'Escuelas en riesgo hoy (moderado o más)',
    escuelasAisladas: 'Escuelas aisladas',
    seleccionarEscuela: 'Se muestra al seleccionar una escuela.',
    datosTerritorialesNo: 'Los datos territoriales no están disponibles.',
    escalaRiesgo: 'Escala de riesgo',
    accesos: {
      ariaDatos: 'Datos territoriales',
      cargando: 'Cargando capas territoriales…',
      sinDatosCaminos: 'Sin datos de caminos cargados.',
      sinCobertura: 'Sin dato (escuela fuera de los datos): ',
    },
  },
  // Map legend (Referencias del mapa): sections, scales and notes.
  leyenda: {
    ariaReferencias: 'Referencias del mapa',
    situacionActual: 'Situación actual',
    estacionesPrefectura: 'Estaciones de Prefectura',
    estacionesNota:
      'Una lectura de más de 18 h conserva su último nivel; su antigüedad está en la ficha de la estación.',
    alturaRio: {
      evacuacion: 'Evacuación',
      alerta: 'Alerta',
      normal: 'Normal',
      sinDato: 'Sin dato',
    },
    lluviaObservada: (horas: number) => `Lluvia observada ${horas} h`,
    lluviaActualizada: (fecha: string) => `Actualizado ${fecha}`,
    lluviaSinFecha: 'Sin fecha de actualización',
    lluviaNota: (parciales: number) =>
      `Estimación satelital (NASA IMERG), no medición en tierra.${parciales > 0 ? ` ${parciales} celdas con ventana incompleta.` : ''} Hacé clic en el mapa para ver el valor.`,
    riesgoHoy: 'Escuelas en riesgo hoy',
    riesgoActual: (horizonte: string) => `Riesgo actual (hoy) · ${horizonte}`,
    riesgoActualNota:
      'Las demás escuelas se ven como puntos grises tenues al acercar el mapa (zoom 9 o más); con un clic se abre su ficha.',
    gravedadPrioridad: 'Gravedad / prioridad',
    riesgoGravedad: 'Riesgo / gravedad',
    simbolos: 'Símbolos',
    gravedadActual:
      'El color indica la gravedad del establecimiento o la prioridad calculada de inaccesibilidad de alumnos, según la situación principal.',
    prioridadAlumnos:
      'La prioridad de alumnos combina el porcentaje de la matrícula afectada y la cantidad de alumnos. Sin matrícula o selección vigente, no se asigna un nivel.',
    sinSituaciones: 'Sin situaciones',
    sinActualizar: 'Sin actualizar',
    solucionadaRecientemente: 'Solucionada recientemente',
  },

  // School ficha (header, tabs, situations) and the school preview card.
  ficha: {
    volverAlMapa: 'Volver al mapa',
    irAlMapa: 'Ir al mapa',
    navegacionSuperior: 'Navegación superior',
    detalleEstablecimiento: 'Detalle del establecimiento',
    seccionesFicha: 'Secciones de la ficha',
    matriculados: (cantidad: string, etiquetaAlumnos: string) => `${cantidad} ${etiquetaAlumnos} matriculados`,
    sinUbicacion: 'Ubicación no disponible en el mapa',
    actualizarParte: 'Actualizar el parte',
    cargarSituacion: 'Cargar una situación',
    pestanas: {
      panorama: 'Panorama',
      situaciones: 'Situaciones',
      situacionesConteo: (cantidad: number) => `Situaciones (${cantidad})`,
      territorio: 'Territorio y clima',
      historial: 'Historial',
    },
    situacionesSeccion: 'Situaciones',
    cargandoSituaciones: 'Cargando situaciones del parte…',
    errorSituaciones: 'No se pudo cargar la información operativa de la escuela.',
    justificacionGravedad: 'Justificación de gravedad:',
    vistaPrevia: {
      cerrar: 'Cerrar vista previa',
      prioridad: 'Prioridad',
      gravedad: 'Gravedad',
      cargandoSituacion: 'Cargando situación…',
      situacionActiva: 'Situación activa',
      situacionReportada: 'Situación reportada',
      situacionesAbiertas: (cantidad: number) =>
        `${cantidad} ${cantidad === 1 ? 'situación abierta' : 'situaciones abiertas'}`,
      desde: (fecha: string) => `desde ${fecha}`,
      sinSituacionesAbiertas: 'Sin situaciones abiertas reportadas',
      sinReporte: 'Sin reporte activo (la ausencia de reporte no confirma normalidad)',
      alumnosAfectados: (cantidad: number) => (cantidad === 1 ? 'alumno afectado' : 'alumnos afectados'),
      proporcionAfectada: (porcentaje: number) => `${porcentaje}% de la matrícula afectada`,
      contextoImpacto: (porcentaje: number, matricula: string, unico: boolean) =>
        `${porcentaje}% de ${matricula} ${unico ? 'alumno' : 'alumnos'} de la escuela`,
      funcionamiento: 'Funcionamiento',
      seccionesAfectadas: 'Secciones afectadas',
      clases: 'Clases',
      sinClases: (cantidad: string) => `${cantidad} sin clases`,
      asistencia: 'Asistencia',
      edificio: 'Edificio',
      ultimoParte: 'Último parte',
      sinActualizar: 'Sin actualizar (>72 h)',
      vigente: 'Vigente',
      comedor: 'Comedor',
      evacuacion: 'Evacuación',
      aislamiento: 'Aislamiento',
      hastaLocalidad: 'Hasta la localidad',
      porCamino: 'por camino',
      antecedentes: 'Antecedentes',
      sinHistoricas: 'Sin situaciones históricas',
      situacionesHistoricas: (cantidad: string, unica: boolean) =>
        `${cantidad} ${unica ? 'situación histórica' : 'situaciones históricas'}`,
      solucionadas: (cantidad: string) => `${cantidad} solucionada(s) en 15 días`,
      abrirFichaCompleta: 'Abrir ficha completa',
      quitarSeleccion: 'Quitar selección',
    },
  },
  fichaCuerpo: fichaCuerpoEs,
  etiquetas: etiquetasEs,
  radar: radarEs,
  estadisticas: estadisticasEs,
  controles: controlesEs,
  panelesMapa: panelesMapaEs,
  situacion: situacionEs,
  fichaPanorama: fichaPanoramaEs,
  fichaTerritorio: fichaTerritorioEs,
  fichaHistorial: fichaHistorialEs,
  controlesCapas: controlesCapasEs,
  controlesFiltros: controlesFiltrosEs,
  radarResto: radarRestoEs,
  libTextos: libTextosEs,
  fichaPanel: fichaPanelEs,
  fichaPagina: fichaPaginaEs,
  libTextos2: libTextos2Es,
  residuos: residuosEs,
} as const
