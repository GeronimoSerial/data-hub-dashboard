// Spanish (Corrientes) texts of the `parteComunTextos` group. Values stay byte-for-byte as shipped.
export const parteComunTextosEs = {
  etiquetaServicio: {
    normal: 'Funcionamiento habitual',
    parcial: 'Funcionamiento parcialmente interrumpido',
    suspendido: 'Funcionamiento interrumpido',
  },
  etiquetaClases: {
    normal: 'Sí, con normalidad',
    suspendido: 'No, se suspendieron',
  },
  envio: {
    'guardado-local': 'Guardado en este dispositivo',
    'pendiente-envio': 'Sin conexión. Su parte queda guardado y se envía solo cuando vuelva.',
    'error-servidor': 'No pudimos enviar. Reintentamos en unos segundos.',
    enviando: 'Enviando…',
    enviado: 'Enviado',
    'sesion-vencida': 'La sesión venció. Vuelva a ingresar con el enlace de su escuela; lo cargado se conserva.',
    error: 'No se pudo enviar',
  },
  almacenOcupado: 'El almacenamiento local está ocupado. Intente guardar de nuevo.',
  tiempoAgotado: 'El servidor no respondió. Reintentamos solos; su parte queda guardado.',
  categoriaAfectacion: {
    establecimiento: {
      etiqueta: 'Afecta al establecimiento',
      descripcion: 'La escuela o parte de ella deja de funcionar con normalidad.',
    },
    alumnos: {
      etiqueta: 'Inaccesibilidad de alumnos',
      descripcion: 'La escuela funciona, pero hay alumnos que no pueden llegar.',
    },
  },
  guardadoInstituto: 'Ya figura en el estado actual de su institución.',
  vigencia: {
    fueraDeRango: 'La fecha debe estar entre hace 12 meses y el momento actual.',
    horaFutura: 'Esa hora todavía no pasó. Elija una hora anterior a la actual.',
    elijaHora: 'Elija la hora.',
    elijaFechaYHora: 'Elija la fecha y la hora.',
    hora: 'Hora',
  },
  institutoCategoria: {
    confirmar: {
      establecimiento:
        'Va a marcar las carreras donde el instituto no puede funcionar con normalidad. Si son alumnos puntuales que no pueden llegar, elija "Inaccesibilidad de alumnos".',
      alumnos:
        'Va a marcar sólo a los alumnos que no pueden llegar al instituto. Si la situación afecta al edificio o al instituto, elija "Afecta al establecimiento".',
    },
    descripcion: {
      establecimiento: 'El instituto o parte de él deja de funcionar con normalidad.',
      alumnos: 'El instituto funciona, pero hay alumnos que no pueden llegar.',
    },
  },
  criterioSeveridad: {
    establecimiento: {
      Baja: 'Molesta, pero se dicta clase normalmente.',
      Media: 'Condiciona el dictado: algunas secciones o turnos funcionan a medias.',
      Alta: 'Impide dictar clase en parte del establecimiento.',
      Crítica: 'Impide el funcionamiento o hay riesgo para las personas.',
    },
    alumnos: {
      Baja: 'Llegan con demora o dificultad, pero asisten.',
      Media: 'Algunos alumnos faltan algunos días por el acceso.',
      Alta: 'Los alumnos afectados no pueden llegar de forma sostenida.',
      Crítica: 'Llegar implica riesgo para los alumnos (cruzar un arroyo crecido, un camino anegado).',
    },
  },
  criterioSeveridadInstituto: {
    establecimiento: {
      Baja: 'Molesta, pero se dicta clase normalmente.',
      Media: 'Condiciona el dictado: algunas carreras funcionan a medias.',
      Alta: 'Impide dictar clase en parte del establecimiento.',
      Crítica: 'Impide el funcionamiento o hay riesgo para las personas.',
    },
    alumnos: {
      Baja: 'Llegan con demora o dificultad, pero asisten.',
      Media: 'Algunos alumnos faltan algunos días por el acceso.',
      Alta: 'Los alumnos afectados no pueden llegar de forma sostenida.',
      Crítica: 'Llegar implica riesgo para los alumnos (cruzar un arroyo crecido, un camino anegado).',
    },
  },
  justificacionCritica: {
    mas_personas: 'Afecta a más personas o secciones de lo habitual',
    riesgo_fisico: 'Hay riesgo eléctrico, estructural o sanitario',
    se_prolonga: 'Se prolonga en el tiempo o no tiene fecha de solución',
    combinado: 'Se combina con otra situación activa',
    otro: 'Otro',
  },
  consistencia: {
    mensajes: {
      evacuacionHabitual: 'Con una evacuación preventiva el edificio no puede figurar como habitual.',
      evacuacionCentroEvacuados: 'Con una evacuación preventiva el edificio no puede figurar como centro de evacuados.',
      inundacionCentroEvacuados: 'Con una inundación el edificio no puede figurar como centro de evacuados.',
      inaccesibilidadEvacuado: 'Si los docentes no pueden acceder, el edificio no puede figurar como evacuado.',
      evacuadoClasesNormales: 'Con el edificio evacuado no pueden dictarse clases con normalidad.',
      otroSinDescripcion: 'Describa la situación: al elegir "Otro" la descripción es obligatoria.',
      inundacionHabitual: 'Una inundación suele afectar al edificio. Verifique que siga figurando como habitual.',
      tormentaCentroEvacuados: 'Una tormenta severa pocas veces obliga a un centro de evacuados. Verifique el estado del edificio.',
      sinEnergiaEvacuado: 'Sin energía o agua el edificio rara vez queda evacuado. Verifique el estado del edificio.',
      sinEnergiaCentroEvacuados: 'Sin energía o agua el edificio rara vez se convierte en centro de evacuados. Verifique el estado del edificio.',
      inaccesibilidadParcial: 'Si el problema es solo el acceso de los docentes, el edificio suele estar en uso normal. Verifique el estado del edificio.',
      inaccesibilidadCentroEvacuados: 'Si los docentes no pueden acceder, pocas veces el edificio es un centro de evacuados. Verifique el estado del edificio.',
      habitualClasesSuspendidas: 'El edificio figura habitual pero las clases están suspendidas. Verifique ambas respuestas.',
      habitualClasesSuspendidasSinEnergia: 'El edificio figura habitual pero las clases están suspendidas. Si falta energía o agua en toda la escuela, indique que el edificio está sin clases.',
      sinClasesClasesNormales: 'Con el edificio sin clases, las clases no pueden ser normales. Verifique la respuesta.',
      centroClasesNormales: 'Con el edificio en centro de evacuados es poco probable que las clases sean normales. Verifique la respuesta.',
      clasesNormalesConAsistencia: 'Si las clases son normales, no suele haber asistencia pedagógica. Verifique la respuesta.',
      evacuacionSeveridadBaja: 'Una evacuación preventiva suele tener una gravedad mayor que Baja. Verifique la gravedad.',
      inundacionParcialClasesNormales: 'Con una inundación y el edificio parcial, las clases difícilmente sean normales. Verifique la respuesta.',
      criticaSeccionUnica: 'Una gravedad Crítica con una sola sección afectada es poco frecuente. Verifique el alcance.',
      masPersonasSeccionUnica: 'La justificación "afecta a más personas" no coincide con una sola sección. Verifique la justificación.',
      seProlongaAhora: 'La situación "se prolonga" no suele empezar en este momento. Verifique la fecha de inicio.',
      evacuacionVigenciaAntigua: 'Una evacuación preventiva iniciada hace más de una semana es poco frecuente. Verifique la fecha de inicio.',
      habitualConAfectacionesActivas: 'Antes de figurar como habitual, indique qué pasa con cada afectación activa: solucionada o sigue activa.',
      habitualConServicioSuspendido: 'El servicio sigue suspendido. Para figurar como habitual, indique que las clases vuelven a dictarse.',
      habitualConAfectacionActiva: 'Se mantiene una afectación activa con el edificio figurando como habitual. Verifique la situación.',
    },
    sugerencias: {
      usoParcial: 'Cambiar a Uso parcial',
      sinDanos: 'Cambiar a Sin daños',
      sinClases: 'Cambiar a Sin clases',
      clasesSuspendidas: 'Cambiar a Clases suspendidas',
      clasesNormales: 'Cambiar a Clases normales',
    },
  },
}
