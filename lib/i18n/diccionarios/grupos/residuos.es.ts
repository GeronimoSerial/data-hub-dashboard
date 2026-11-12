// Spanish (Corrientes) texts of the `residuos` group. Values stay byte-for-byte as shipped.
export const residuosEs = {
  vistaPrevia: {
    ariaTitulo: (nombre: string) => `Vista previa de ${nombre}`,
  },
  veredicto: {
    titulo: 'Veredicto diario',
    ariaDia: 'Veredicto del día',
    calibracion: 'En calibración',
    sinGenerar: 'El veredicto de este día todavía no se generó.',
  },
  popup: {
    sinNombre: 'Establecimiento',
  },
  instituto: {
    alcanza: 'Alcanza a',
    carrera: 'carrera',
    carreras: 'carreras',
    alumno: 'alumno',
    alumnos: 'alumnos',
  },
  vigencia: {
    desde: 'Desde',
    ahora: (etiqueta: string) => `${etiqueta} ahora`,
    hoy: (etiqueta: string, hora: string) => `${etiqueta} hoy a las ${hora}`,
    fechaYHora: (etiqueta: string, dia: string, fecha: string, hora: string) => `${etiqueta} el ${dia} ${fecha} a las ${hora}`,
    elijaHora: 'Elija la hora',
    elijaFechaYHora: 'Elija la fecha y la hora',
    dias: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  },
} as const
