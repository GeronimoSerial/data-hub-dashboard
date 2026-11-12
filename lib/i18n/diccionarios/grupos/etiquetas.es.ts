// Spanish (Corrientes) texts of the `etiquetas` group. Values stay byte-for-byte as shipped.
// Leaves identical in Portuguese (e.g. "Evacuado", "Alto") are not here: the lib constant is used.
export const etiquetasEs = {
  estadoClases: {
    normal: 'Funcionamiento habitual',
    parcial: 'Funcionamiento parcialmente interrumpido',
    sin: 'Funcionamiento interrumpido',
    centro: 'Usado como centro de evacuados',
  },
  nivelRiesgo: {
    muy_alto: 'Muy alto',
    bajo: 'Bajo',
  },
  gravedad: {
    0: 'Sin situaciones',
    1: 'Baja',
    2: 'Media',
  },
  apoyo: {
    brinda: 'Se brinda',
    no: 'No se brinda',
    sin_dato: 'Sin dato',
  },
  apoyoEtiqueta: {
    sin_dato: 'Asistencia pedagógica sin dato',
    no: 'No se brinda asistencia pedagógica',
    brinda: 'Se brinda asistencia pedagógica',
    virtual: 'Asistencia pedagógica: clase virtual',
    cuadernillo: 'Asistencia pedagógica: cuadernillo',
    ambos: 'Asistencia pedagógica: clase virtual y cuadernillo',
  },
  instituto: {
    carreras: (cantidad: number) => `${cantidad} ${cantidad === 1 ? 'carrera' : 'carreras'}`,
    alumnosMatriculados: (cantidad: number, numero: string) => `${numero} ${cantidad === 1 ? 'alumno matriculado' : 'alumnos matriculados'}`,
  },
  nivelPlan: {
    1: 'Bajo',
    2: 'Medio',
  },
  tituloVista: {
    aisladas: 'Aislamiento',
    historial: 'Veces con situaciones',
  },
  basemapas: {
    osm: 'Rutas y caminos',
    voyager: 'Mapa vial alternativo',
  },
  vecesSituaciones: (cantidad: number) => `${cantidad} ${cantidad === 1 ? 'situación' : 'situaciones'}`,
} as const
